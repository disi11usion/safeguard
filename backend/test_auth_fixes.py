"""
Minimal tests for the five auth/routes fixes.

1. Connection leak fix — accept_disclaimer, get_user_preference_assets, get_plans
   use get_cursor() (context manager) instead of raw get_conn()/release_conn().
2. create_access_token produces a timezone-aware UTC exp claim.
3. user_login no longer calls _apply_admin_role_policy.
4. user_signup returns a clean message (not raw DB error) on duplicate user.
5. user_signup no longer issues a pre-INSERT SELECT to check for duplicates.

No real database, SMTP, or full app startup required.

Run from backend/:
    python test_auth_fixes.py
"""

import sys
import os
import types
import inspect
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, patch, call

# ── Minimal stubs so imports resolve without real services ──────────────────

def _stub(name):
    m = types.ModuleType(name)
    sys.modules[name] = m
    return m

for mod in ["dotenv", "jose", "jose.jwt", "jose.exceptions", "bcrypt",
            "fastapi", "fastapi.security"]:
    _stub(mod)

sys.modules["dotenv"].load_dotenv = lambda *a, **kw: None
sys.modules["jose"].JWTError = Exception
sys.modules["jose.exceptions"].JWTError = Exception

class _FakeHTTPException(Exception):
    def __init__(self, status_code=500, detail=""):
        self.status_code = status_code
        self.detail = detail

sys.modules["fastapi"].HTTPException = _FakeHTTPException
sys.modules["fastapi"].Request = object
sys.modules["fastapi.security"].HTTPBearer = MagicMock
sys.modules["fastapi.security"].HTTPAuthorizationCredentials = object

fake_jwt = _stub("jose.jwt") if "jose.jwt" not in sys.modules else sys.modules["jose.jwt"]
fake_jwt.encode = lambda data, *a, **kw: "fake.token"
fake_jwt.decode = lambda *a, **kw: {}

fake_bcrypt = sys.modules["bcrypt"]
fake_bcrypt.hashpw = lambda pw, salt: b"hashed"
fake_bcrypt.gensalt = lambda: b"salt"
fake_bcrypt.checkpw = lambda pw, hashed: True

# Stub psycopg2 — define a real IntegrityError hierarchy so user_auth can catch it.
# psycopg2 is only available inside Docker; the test stubs it completely.
class _FakeIntegrityError(Exception):
    pass

fake_psycopg2 = _stub("psycopg2")
fake_psycopg2.IntegrityError = _FakeIntegrityError
fake_psycopg2.connect = MagicMock(side_effect=RuntimeError("psycopg2.connect called — use pool"))

_real_psycopg2 = fake_psycopg2  # alias used in test bodies below

# Stub database.db_pool BEFORE importing user_auth
fake_db_pool = _stub("database.db_pool")
fake_db_pool.get_conn = MagicMock()
fake_db_pool.release_conn = MagicMock()

@contextmanager
def _placeholder_get_cursor(cursor_factory=None):
    yield MagicMock()

fake_db_pool.get_cursor = _placeholder_get_cursor
_stub("database")
sys.modules["database.db_pool"] = fake_db_pool
_stub("database.scripts")

os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ALGORITHM", "HS256")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "30")
os.environ.setdefault("FORCE_ALL_USERS_ADMIN_DEV", "false")

# ── Import modules under test ───────────────────────────────────────────────
import importlib.util, pathlib

_ua_path = pathlib.Path(__file__).parent / "database" / "scripts" / "user_auth.py"
_spec = importlib.util.spec_from_file_location("user_auth", _ua_path)
user_auth = importlib.util.module_from_spec(_spec)
sys.modules["user_auth"] = user_auth
_spec.loader.exec_module(user_auth)


# ── Helpers ─────────────────────────────────────────────────────────────────

class FakeCursor:
    def __init__(self, fetchone_return=None):
        self._fetchone_return = fetchone_return
        self.executed = []

    def execute(self, sql, params=None):
        self.executed.append(sql.strip() if sql else "")

    def fetchone(self):
        return self._fetchone_return

    def close(self):
        pass

    def any_sql_contains(self, fragment):
        return any(fragment.upper() in s.upper() for s in self.executed)


def make_conn(cursor):
    """Build a minimal fake psycopg2 connection around a FakeCursor."""
    conn = MagicMock()
    conn.cursor.return_value = cursor
    conn.__enter__ = lambda s: s
    conn.__exit__ = MagicMock(return_value=False)
    return conn


PASS_COUNT = 0
FAIL_COUNT = 0


def run(label, fn):
    global PASS_COUNT, FAIL_COUNT
    try:
        fn()
        print(f"  ✅  {label}")
        PASS_COUNT += 1
    except AssertionError as exc:
        print(f"  ❌  {label}\n       {exc}")
        FAIL_COUNT += 1
    except Exception as exc:
        print(f"  ❌  {label}\n       {type(exc).__name__}: {exc}")
        FAIL_COUNT += 1


# ══════════════════════════════════════════════════════════════════════════════
# Fix 2 — create_access_token exp is timezone-aware UTC
# ══════════════════════════════════════════════════════════════════════════════

def test_access_token_exp_is_utc_aware():
    """create_access_token must embed a timezone-aware UTC exp, not a naive datetime."""
    captured = {}

    def fake_encode(data, *args, **kwargs):
        captured["exp"] = data.get("exp")
        return "token"

    with patch.object(sys.modules["jose.jwt"], "encode", fake_encode):
        user_auth.create_access_token({"sub": "1", "email": "a@b.com"})

    exp = captured.get("exp")
    assert exp is not None, "No exp field found in token payload"
    assert isinstance(exp, datetime), f"exp should be datetime, got {type(exp)}"
    assert exp.tzinfo is not None, (
        f"exp is a naive datetime (no tzinfo) — token expiry will be unreliable. "
        f"Use datetime.now(timezone.utc) not datetime.now()"
    )
    assert exp.tzinfo == timezone.utc or str(exp.tzinfo) in ("UTC", "utc"), (
        f"exp tzinfo should be UTC, got {exp.tzinfo}"
    )


# ══════════════════════════════════════════════════════════════════════════════
# Fix 3 — user_login no longer calls _apply_admin_role_policy
# ══════════════════════════════════════════════════════════════════════════════

def test_user_login_does_not_call_admin_policy():
    """user_login must NOT call _apply_admin_role_policy (batch UPDATE on every login)."""
    cur = FakeCursor(fetchone_return=(1, "fake_hashed_str", True, "alice"))
    conn = make_conn(cur)
    fake_db_pool.get_conn.return_value = conn

    with patch.object(user_auth, "_apply_admin_role_policy") as mock_policy:
        user_auth.user_login("alice@example.com", "password")
        assert not mock_policy.called, (
            "_apply_admin_role_policy was called during login — "
            "this runs a batch UPDATE on the whole users table on every login"
        )


def test_user_login_no_premature_commit():
    """user_login must not commit before password verification."""
    # hashed_password must be a str — user_auth calls hashed_password.encode("utf-8")
    cur = FakeCursor(fetchone_return=(1, "fake_hashed_str", True, "alice"))
    conn = make_conn(cur)
    fake_db_pool.get_conn.return_value = conn

    # Track commit calls and at what point they happen
    commit_calls = []
    password_checked = []

    original_checkpw = fake_bcrypt.checkpw

    def spy_checkpw(pw, hashed):
        password_checked.append(True)
        return True

    def spy_commit():
        # If commit fires before password check, password_checked is empty
        commit_calls.append(len(password_checked))

    conn.commit.side_effect = spy_commit

    with patch.object(sys.modules["bcrypt"], "checkpw", spy_checkpw):
        user_auth.user_login("alice@example.com", "password")

    assert commit_calls, "No commit was ever called"
    first_commit = commit_calls[0]
    assert first_commit > 0, (
        "conn.commit() was called before bcrypt.checkpw() — "
        "admin role changes were committed before verifying the password"
    )


# ══════════════════════════════════════════════════════════════════════════════
# Fix 4 (via fix 3) — admin policy not committed before password check
# Already covered by test_user_login_no_premature_commit above.
# ══════════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════════════════
# Fix 5a — user_signup does NOT do a pre-INSERT SELECT for duplicates
# ══════════════════════════════════════════════════════════════════════════════

def test_user_signup_no_precheck_select():
    """user_signup must not SELECT before INSERT to check for duplicate username/email."""
    executed_sqls = []

    cur = MagicMock()
    cur.execute.side_effect = lambda sql, params=None: executed_sqls.append(sql.strip())
    cur.fetchone.return_value = (42,)  # simulate RETURNING user_id
    cur.close = MagicMock()

    conn = make_conn(cur)
    conn.cursor.return_value = cur
    fake_db_pool.get_conn.return_value = conn

    user_auth.user_signup("Full Name", "alice", "alice@example.com", "password")

    select_sqls = [s for s in executed_sqls if "SELECT" in s.upper()]
    precheck = [
        s for s in select_sqls
        if "username" in s.lower() and "email" in s.lower() and "INSERT" not in s.upper()
    ]
    assert not precheck, (
        f"Pre-INSERT SELECT for duplicate check found — TOCTOU race still present:\n"
        + "\n".join(precheck)
    )


# ══════════════════════════════════════════════════════════════════════════════
# Fix 5b — user_signup returns clean message on IntegrityError
# ══════════════════════════════════════════════════════════════════════════════

def test_user_signup_integrity_error_gives_clean_message():
    """On duplicate username/email (IntegrityError), return a clean user-facing message."""
    cur = MagicMock()
    cur.execute.side_effect = _real_psycopg2.IntegrityError(
        'duplicate key value violates unique constraint "users_email_key"'
    )
    cur.close = MagicMock()

    conn = make_conn(cur)
    conn.cursor.return_value = cur
    fake_db_pool.get_conn.return_value = conn

    result = user_auth.user_signup("Full Name", "alice", "alice@example.com", "password")

    assert result["success"] is False, f"Expected failure, got: {result}"
    msg = result.get("message", "")
    assert "already exists" in msg.lower(), (
        f"Expected clean 'already exists' message, got raw DB error: '{msg}'"
    )
    assert "unique constraint" not in msg.lower(), (
        f"Raw psycopg2 error text leaked to caller: '{msg}'"
    )
    assert "duplicate key" not in msg.lower(), (
        f"Raw psycopg2 error text leaked to caller: '{msg}'"
    )


# ══════════════════════════════════════════════════════════════════════════════
# Fix 1 — connection leak: accept_disclaimer, get_plans, get_user_preference_assets
# Verify they use get_cursor() context manager, not raw get_conn()/release_conn()
# We inspect the source to confirm the pattern — no real HTTP needed.
# ══════════════════════════════════════════════════════════════════════════════

def _get_routes_source():
    routes_path = os.path.join(
        os.path.dirname(__file__), "presentation", "routes.py"
    )
    with open(routes_path) as f:
        return f.read()


def _function_source(full_source, fn_name):
    """Extract the source of a named async def from the full file source."""
    lines = full_source.splitlines()
    start = None
    for i, line in enumerate(lines):
        if f"async def {fn_name}" in line or f"def {fn_name}" in line:
            start = i
            break
    if start is None:
        return ""
    # Collect until the next top-level def/class or EOF
    body = [lines[start]]
    for line in lines[start + 1:]:
        if line and not line[0].isspace() and (
            line.startswith("@") or line.startswith("def ") or line.startswith("async def ") or line.startswith("class ")
        ):
            break
        body.append(line)
    return "\n".join(body)


def test_accept_disclaimer_uses_get_cursor():
    """accept_disclaimer must use get_cursor() context manager — no raw get_conn() call."""
    src = _function_source(_get_routes_source(), "accept_disclaimer")
    assert "get_cursor" in src, "get_cursor not found in accept_disclaimer"
    assert "get_conn()" not in src, (
        "Raw get_conn() found in accept_disclaimer — connection will leak on exception"
    )
    assert "release_conn" not in src, (
        "Manual release_conn found in accept_disclaimer — "
        "get_cursor() handles this automatically"
    )


def test_get_plans_uses_get_cursor():
    """get_plans must use get_cursor() context manager — no raw get_conn() call."""
    src = _function_source(_get_routes_source(), "get_plans")
    assert "get_cursor" in src, "get_cursor not found in get_plans"
    assert "_get_db_conn()" not in src, (
        "Raw _get_db_conn() found in get_plans — connection will leak on exception"
    )
    assert "release_conn" not in src, (
        "Manual release_conn found in get_plans — get_cursor() handles this"
    )


def test_get_user_preference_assets_uses_get_cursor():
    """get_user_preference_assets must use get_cursor() — no raw get_conn() call."""
    src = _function_source(_get_routes_source(), "get_user_preference_assets")
    assert "get_cursor" in src, "get_cursor not found in get_user_preference_assets"
    assert "_get_db_conn()" not in src, (
        "Raw _get_db_conn() found in get_user_preference_assets — connection leaks on exception"
    )
    assert "release_conn" not in src, (
        "Manual release_conn in get_user_preference_assets — get_cursor() handles this"
    )


# ══════════════════════════════════════════════════════════════════════════════
# Runner
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    print("\n── Fix 1: Connection leaks ──────────────────────────────────────────")
    run("accept_disclaimer uses get_cursor (no raw conn/release)",
        test_accept_disclaimer_uses_get_cursor)
    run("get_plans uses get_cursor (no raw conn/release)",
        test_get_plans_uses_get_cursor)
    run("get_user_preference_assets uses get_cursor (no raw conn/release)",
        test_get_user_preference_assets_uses_get_cursor)

    print("\n── Fix 2: Timezone-aware JWT exp ────────────────────────────────────")
    run("create_access_token embeds UTC-aware exp in token",
        test_access_token_exp_is_utc_aware)

    print("\n── Fix 3+4: admin policy removed from login ─────────────────────────")
    run("user_login does not call _apply_admin_role_policy",
        test_user_login_does_not_call_admin_policy)
    run("user_login does not commit before password check",
        test_user_login_no_premature_commit)

    print("\n── Fix 5: Signup TOCTOU + raw error ─────────────────────────────────")
    run("user_signup skips pre-INSERT SELECT (no TOCTOU check)",
        test_user_signup_no_precheck_select)
    run("user_signup returns clean message on IntegrityError",
        test_user_signup_integrity_error_gives_clean_message)

    total = PASS_COUNT + FAIL_COUNT
    status = "✅ All passed" if FAIL_COUNT == 0 else f"❌ {FAIL_COUNT} failed"
    print(f"\n{status} — {PASS_COUNT}/{total}\n")
    sys.exit(0 if FAIL_COUNT == 0 else 1)
