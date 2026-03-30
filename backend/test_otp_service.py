"""
Basic functionality tests for the rewritten otp_service.py.

Covers:
  send_otp     — rate limiting, new OTP upsert, FOR UPDATE lock, safe interval param
  verify_otp   — correct code, wrong code, expired, no row, exhausted attempts, FOR UPDATE
  signup flow  — mark_verified, is_verified, is_verified expired cleanup, clear_verified

No real database or SMTP required.  OTP_DEV_MODE=true bypasses SMTP.

Run from backend/:
    python test_otp_service.py
"""

import os
import sys
import types
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

# ── Stub database.db_pool BEFORE importing otp_service ─────────────────────
# otp_service does `from database.db_pool import get_cursor` at import time,
# so the stub must be in sys.modules first.
_fake_db_pool = types.ModuleType("database.db_pool")

@contextmanager
def _placeholder_get_cursor(cursor_factory=None):
    yield None  # replaced per-test via patch.object

_fake_db_pool.get_cursor = _placeholder_get_cursor
sys.modules.setdefault("database", types.ModuleType("database"))
sys.modules["database.db_pool"] = _fake_db_pool

# ── Environment defaults ────────────────────────────────────────────────────
os.environ.setdefault("OTP_SECRET", "test-secret")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ["OTP_DEV_MODE"] = "true"   # skip real SMTP in every test

# ── Import the module under test ────────────────────────────────────────────
from application.services import otp_service  # noqa: E402


# ── Test helpers ────────────────────────────────────────────────────────────

class FakeCursor:
    """
    Records every execute() call and returns a pre-configured fetchone() value.
    Mimics the psycopg2 cursor interface used inside get_cursor() blocks.
    """
    def __init__(self, fetchone_return=None):
        self._fetchone_return = fetchone_return
        self.executed = []          # list of (sql_str, params)

    def execute(self, sql, params=None):
        self.executed.append((sql, params))

    def fetchone(self):
        return self._fetchone_return

    def close(self):
        pass

    # ── assertion helpers ──────────────────────────────────────────────────
    def all_sql(self):
        return [sql for sql, _ in self.executed]

    def any_sql_contains(self, fragment):
        return any(fragment.upper() in sql.upper() for sql in self.all_sql())


def make_get_cursor(cursor):
    """Wrap a FakeCursor in a context manager that get_cursor() callers expect."""
    @contextmanager
    def _get_cursor(cursor_factory=None):
        yield cursor
    return _get_cursor


# ── Shared timestamp fixtures ───────────────────────────────────────────────
FUTURE = datetime.now(timezone.utc) + timedelta(minutes=5)   # not yet expired
PAST   = datetime.now(timezone.utc) - timedelta(minutes=1)   # already expired
RECENT = datetime.now(timezone.utc) - timedelta(seconds=30)  # within 60s rate-limit window
OLD    = datetime.now(timezone.utc) - timedelta(seconds=120) # outside rate-limit window


def valid_hash(email: str, code: str) -> str:
    """Produce a hash matching what otp_service._hash_code would store."""
    return otp_service._hash_code(email, code)


# ── Minimal test runner ─────────────────────────────────────────────────────
PASS_COUNT = 0
FAIL_COUNT = 0


def run(label: str, fn):
    global PASS_COUNT, FAIL_COUNT
    try:
        fn()
        print(f"  ✅  {label}")
        PASS_COUNT += 1
    except AssertionError as exc:
        print(f"  ❌  {label}\n       AssertionError: {exc}")
        FAIL_COUNT += 1
    except Exception as exc:
        print(f"  ❌  {label}\n       {type(exc).__name__}: {exc}")
        FAIL_COUNT += 1


# ══════════════════════════════════════════════════════════════════════════════
# send_otp
# ══════════════════════════════════════════════════════════════════════════════

def test_send_otp_rate_limited():
    """Rate limit: returns wait-message and does NOT upsert when last_sent_at is recent."""
    cur = FakeCursor(fetchone_return=(RECENT,))
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        result = otp_service.send_otp("user@example.com")

    assert result["success"] is False, f"Expected failure, got: {result}"
    assert "wait" in result["message"].lower(), f"Expected 'wait' in message: {result['message']}"
    # Only the SELECT FOR UPDATE should have run — no INSERT
    assert len(cur.executed) == 1, (
        f"Expected 1 SQL call (SELECT only), got {len(cur.executed)}: {cur.all_sql()}"
    )


def test_send_otp_allowed_when_old_enough():
    """Rate limit: upserts when last_sent_at is outside the min-interval window."""
    cur = FakeCursor(fetchone_return=(OLD,))
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        result = otp_service.send_otp("user@example.com")

    assert result["success"] is True, f"Expected success, got: {result}"
    assert len(cur.executed) == 2, (
        f"Expected SELECT + INSERT, got {len(cur.executed)}: {cur.all_sql()}"
    )
    assert cur.any_sql_contains("INSERT INTO auth.otp_codes"), "No INSERT found"


def test_send_otp_new_email():
    """New email (no existing row): upserts an OTP record."""
    cur = FakeCursor(fetchone_return=None)
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        result = otp_service.send_otp("newuser@example.com")

    assert result["success"] is True, f"Expected success, got: {result}"
    assert cur.any_sql_contains("INSERT INTO auth.otp_codes"), "No INSERT found"


def test_send_otp_select_uses_for_update():
    """SELECT in send_otp must include FOR UPDATE to prevent TOCTOU race."""
    cur = FakeCursor(fetchone_return=None)
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        otp_service.send_otp("user@example.com")

    select_sqls = [sql for sql in cur.all_sql() if "SELECT" in sql.upper()]
    assert select_sqls, "No SELECT statement executed"
    assert any("FOR UPDATE" in sql.upper() for sql in select_sqls), (
        f"FOR UPDATE missing from SELECT statements: {select_sqls}"
    )


def test_send_otp_interval_is_parameterised():
    """Interval must use (%s * interval '1 second'), not the unsafe interval '%s seconds'."""
    cur = FakeCursor(fetchone_return=None)
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        otp_service.send_otp("user@example.com")

    insert_sqls = [sql for sql in cur.all_sql() if "INSERT" in sql.upper()]
    assert insert_sqls, "No INSERT statement executed"
    assert any("interval '1 second'" in sql for sql in insert_sqls), (
        f"Safe parameterised interval not found in: {insert_sqls}"
    )
    assert not any("interval '%s seconds'" in sql for sql in insert_sqls), (
        "Unsafe interval interpolation pattern (interval '%s seconds') found"
    )


# ══════════════════════════════════════════════════════════════════════════════
# verify_otp
# ══════════════════════════════════════════════════════════════════════════════

def test_verify_correct_code_succeeds_and_deletes_row():
    """Correct code: returns success and DELETEs the consumed OTP row."""
    email, code = "user@example.com", "123456"
    cur = FakeCursor(fetchone_return=(valid_hash(email, code), FUTURE, 5))
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        result = otp_service.verify_otp(email, code)

    assert result["success"] is True, f"Expected success, got: {result}"
    assert cur.any_sql_contains("DELETE FROM auth.otp_codes"), "Expected DELETE on success"


def test_verify_wrong_code_decrements_attempts():
    """Wrong code: returns failure and issues UPDATE attempts_left = attempts_left - 1."""
    email = "user@example.com"
    cur = FakeCursor(fetchone_return=(valid_hash(email, "999999"), FUTURE, 5))
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        result = otp_service.verify_otp(email, "000000")  # deliberately wrong

    assert result["success"] is False, f"Expected failure, got: {result}"
    assert "invalid" in result["message"].lower(), f"Expected 'invalid' in: {result['message']}"
    assert cur.any_sql_contains("attempts_left = attempts_left - 1"), (
        "Expected decrement UPDATE; SQLs executed: " + str(cur.all_sql())
    )


def test_verify_expired_otp_deletes_and_rejects():
    """Expired OTP: returns expired message and DELETEs the stale row."""
    email, code = "user@example.com", "123456"
    cur = FakeCursor(fetchone_return=(valid_hash(email, code), PAST, 5))
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        result = otp_service.verify_otp(email, code)

    assert result["success"] is False
    assert "expired" in result["message"].lower(), f"Expected 'expired' in: {result['message']}"
    assert cur.any_sql_contains("DELETE FROM auth.otp_codes"), "Expected DELETE on expiry"


def test_verify_no_row_returns_not_found():
    """No DB row: returns not-found / expired message."""
    cur = FakeCursor(fetchone_return=None)
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        result = otp_service.verify_otp("ghost@example.com", "123456")

    assert result["success"] is False
    msg = result["message"].lower()
    assert "not found" in msg or "expired" in msg, f"Unexpected message: {result['message']}"


def test_verify_exhausted_attempts_deletes_and_rejects():
    """Zero attempts left: returns too-many-attempts and DELETEs the row."""
    email, code = "user@example.com", "123456"
    cur = FakeCursor(fetchone_return=(valid_hash(email, code), FUTURE, 0))
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        result = otp_service.verify_otp(email, code)

    assert result["success"] is False
    assert "attempt" in result["message"].lower(), f"Expected 'attempt' in: {result['message']}"
    assert cur.any_sql_contains("DELETE FROM auth.otp_codes"), "Expected DELETE on exhausted attempts"


def test_verify_select_uses_for_update():
    """SELECT in verify_otp must include FOR UPDATE to prevent double-verification."""
    cur = FakeCursor(fetchone_return=None)
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        otp_service.verify_otp("user@example.com", "123456")

    select_sqls = [sql for sql in cur.all_sql() if "SELECT" in sql.upper()]
    assert select_sqls, "No SELECT statement executed"
    assert any("FOR UPDATE" in sql.upper() for sql in select_sqls), (
        f"FOR UPDATE missing from SELECT: {select_sqls}"
    )


# ══════════════════════════════════════════════════════════════════════════════
# Signup flow — mark_verified / is_verified / clear_verified
# ══════════════════════════════════════════════════════════════════════════════

def test_mark_verified_upserts_verified_true():
    """mark_verified() must write a row with verified=TRUE to auth.otp_codes."""
    cur = FakeCursor()
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        otp_service.mark_verified("signup@example.com")

    assert cur.any_sql_contains("auth.otp_codes"), "Expected INSERT into auth.otp_codes"
    assert cur.any_sql_contains("TRUE"), "Expected verified=TRUE in the upsert"


def test_is_verified_true_when_row_is_current():
    """is_verified() returns True when DB has verified=True and TTL has not lapsed."""
    cur = FakeCursor(fetchone_return=(True, FUTURE))
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        result = otp_service.is_verified("signup@example.com")

    assert result is True


def test_is_verified_false_when_verified_flag_is_false():
    """is_verified() returns False when the DB row has verified=False."""
    cur = FakeCursor(fetchone_return=(False, FUTURE))
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        result = otp_service.is_verified("signup@example.com")

    assert result is False


def test_is_verified_false_when_no_row():
    """is_verified() returns False when no row exists for the email."""
    cur = FakeCursor(fetchone_return=None)
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        result = otp_service.is_verified("unknown@example.com")

    assert result is False


def test_is_verified_cleans_up_expired_row():
    """is_verified() DELETEs the row and returns False when TTL has lapsed."""
    cur = FakeCursor(fetchone_return=(True, PAST))
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        result = otp_service.is_verified("signup@example.com")

    assert result is False
    assert cur.any_sql_contains("DELETE FROM auth.otp_codes"), (
        "Expected DELETE when verified row is expired; got: " + str(cur.all_sql())
    )


def test_clear_verified_deletes_row():
    """clear_verified() issues a DELETE for the given email."""
    cur = FakeCursor()
    with patch.object(otp_service, "get_cursor", make_get_cursor(cur)):
        otp_service.clear_verified("signup@example.com")

    assert cur.any_sql_contains("DELETE FROM auth.otp_codes"), (
        "Expected DELETE; got: " + str(cur.all_sql())
    )


# ══════════════════════════════════════════════════════════════════════════════
# Runner
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("\n── send_otp ─────────────────────────────────────────────────────────")
    run("rate limit blocks when last_sent_at is recent",      test_send_otp_rate_limited)
    run("upserts new OTP when last_sent_at is old enough",    test_send_otp_allowed_when_old_enough)
    run("upserts for a brand-new email (no row yet)",         test_send_otp_new_email)
    run("SELECT includes FOR UPDATE (TOCTOU fix)",            test_send_otp_select_uses_for_update)
    run("interval uses safe parameterisation",                test_send_otp_interval_is_parameterised)

    print("\n── verify_otp ───────────────────────────────────────────────────────")
    run("correct code succeeds and deletes the row",          test_verify_correct_code_succeeds_and_deletes_row)
    run("wrong code decrements attempts_left",                test_verify_wrong_code_decrements_attempts)
    run("expired OTP rejected and row deleted",               test_verify_expired_otp_deletes_and_rejects)
    run("no row returns not-found message",                   test_verify_no_row_returns_not_found)
    run("zero attempts deletes and rejects",                  test_verify_exhausted_attempts_deletes_and_rejects)
    run("SELECT includes FOR UPDATE (double-verify fix)",     test_verify_select_uses_for_update)

    print("\n── signup flow (mark / is / clear verified) ─────────────────────────")
    run("mark_verified upserts verified=TRUE into DB",        test_mark_verified_upserts_verified_true)
    run("is_verified True when row is current",               test_is_verified_true_when_row_is_current)
    run("is_verified False when verified flag is False",      test_is_verified_false_when_verified_flag_is_false)
    run("is_verified False when no row exists",               test_is_verified_false_when_no_row)
    run("is_verified cleans up expired row and returns False",test_is_verified_cleans_up_expired_row)
    run("clear_verified issues DELETE for the email",         test_clear_verified_deletes_row)

    total = PASS_COUNT + FAIL_COUNT
    status = "✅ All passed" if FAIL_COUNT == 0 else f"❌ {FAIL_COUNT} failed"
    print(f"\n{status} — {PASS_COUNT}/{total}\n")
    sys.exit(0 if FAIL_COUNT == 0 else 1)
