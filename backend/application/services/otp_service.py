import os
import time
import secrets
import hashlib
import socket
from typing import Dict, Any

import smtplib
from email.message import EmailMessage

from database.db_pool import get_cursor


# ── Internal helpers ───────────────────────────────────────────────────────

def _now() -> float:
    return time.time()


def _get_int_env(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except Exception:
        return default


def _get_bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _hash_code(email: str, code: str) -> str:
    secret = os.getenv("OTP_SECRET", os.getenv("SECRET_KEY", ""))
    raw = f"{email.lower()}::{code}::{secret}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _generate_code(length: int = 6) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


# ── SMTP sending (unchanged) ───────────────────────────────────────────────

def _send_via_smtp(to_email: str, code: str) -> None:
    host = os.getenv("SMTP_HOST")
    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASS")
    from_email = os.getenv("SMTP_FROM") or user
    force_ipv4 = _get_bool_env("SMTP_FORCE_IPV4", False)

    if not host or not user or not password or not from_email:
        raise RuntimeError("SMTP configuration missing (SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM)")

    subject = "Your login code"
    body = f"Your verification code is: {code}\n\nThis code will expire soon."

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.set_content(body)

    smtp_host = host
    if force_ipv4:
        infos = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
        if not infos:
            raise OSError("No IPv4 address found for SMTP host")
        smtp_host = infos[0][4][0]

    with smtplib.SMTP(smtp_host, port, timeout=5) as server:
        server.starttls()
        server.login(user, password)
        server.send_message(msg)


def _send_via_smtp_with_retry(to_email: str, code: str) -> None:
    retries = max(1, _get_int_env("SMTP_SEND_RETRIES", 3))
    base_delay = max(0, _get_int_env("SMTP_RETRY_DELAY_MS", 600)) / 1000.0
    last_exc: Exception | None = None

    for attempt in range(retries):
        try:
            _send_via_smtp(to_email, code)
            return
        except (socket.gaierror, OSError, TimeoutError, smtplib.SMTPException, RuntimeError) as exc:
            last_exc = exc
            err_no = getattr(exc, "errno", None)
            retryable = (
                isinstance(exc, (socket.gaierror, TimeoutError, smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected))
                or err_no in {-3, -2, 101, 110, 111}
            )
            if attempt == retries - 1 or not retryable:
                raise
            time.sleep(base_delay * (attempt + 1))

    if last_exc:
        raise last_exc


# ── Public API ─────────────────────────────────────────────────────────────

def send_otp(email: str) -> Dict[str, Any]:
    """
    Generate and send an OTP for the given email.

    Rate limiting and code storage are both handled atomically via a
    SELECT FOR UPDATE on the auth.otp_codes row, which prevents two
    concurrent requests from bypassing the min-interval check.
    """
    ttl_seconds = _get_int_env("OTP_TTL_SECONDS", 300)
    min_interval = _get_int_env("OTP_MIN_INTERVAL_SECONDS", 60)
    max_attempts = _get_int_env("OTP_MAX_ATTEMPTS", 5)

    code = _generate_code()
    code_hash = _hash_code(email, code)

    try:
        with get_cursor() as cur:
            # Lock the row for this email (if it exists) so that two concurrent
            # send_otp calls cannot both pass the rate-limit check simultaneously.
            cur.execute(
                "SELECT last_sent_at FROM auth.otp_codes WHERE email = %s FOR UPDATE",
                (email.lower(),),
            )
            row = cur.fetchone()
            if row and row[0]:
                elapsed = _now() - row[0].timestamp()
                if elapsed < min_interval:
                    retry_in = int(min_interval - elapsed)
                    return {
                        "success": False,
                        "message": f"Please wait {retry_in}s before requesting another code.",
                    }

            # Upsert the new OTP — overwrites any previous pending code.
            # (%s * interval '1 second') is proper parameterisation; avoids
            # the unsafe  interval '%s seconds'  string-interpolation pattern.
            cur.execute(
                """
                INSERT INTO auth.otp_codes
                    (email, code_hash, expires_at, attempts_left, last_sent_at, verified)
                VALUES
                    (%s, %s, now() + (%s * interval '1 second'), %s, now(), FALSE)
                ON CONFLICT (email) DO UPDATE SET
                    code_hash     = EXCLUDED.code_hash,
                    expires_at    = EXCLUDED.expires_at,
                    attempts_left = EXCLUDED.attempts_left,
                    last_sent_at  = EXCLUDED.last_sent_at,
                    verified      = FALSE
                """,
                (email.lower(), code_hash, ttl_seconds, max_attempts),
            )
        # get_cursor() commits the transaction and releases the lock here.
    except Exception as exc:
        return {"success": False, "error": "db_error", "detail": str(exc)}

    # Send the email AFTER the DB commit so the lock is released quickly
    # and SMTP latency does not hold the row lock.
    dev_mode = _get_bool_env("OTP_DEV_MODE", False)
    if dev_mode:
        print(f"[OTP_DEV_MODE] OTP for {email}: {code}")
        return {"success": True, "message": "OTP generated (dev mode).", "dev_otp": code}

    try:
        if os.getenv("SMTP_HOST"):
            _send_via_smtp_with_retry(email, code)
        else:
            raise RuntimeError("SMTP configuration missing (SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM)")
    except (OSError, TimeoutError, smtplib.SMTPException, RuntimeError) as exc:
        return {"success": False, "error": "smtp_unavailable", "detail": str(exc)}

    return {"success": True, "message": "OTP sent successfully."}


def verify_otp(email: str, code: str) -> Dict[str, Any]:
    """
    Verify the OTP for the given email.

    Uses SELECT FOR UPDATE so that two concurrent verification attempts
    cannot both read the same row, pass all checks, and both return success
    (which would allow the same code to be used twice).  The second caller
    blocks on the lock and, once the first transaction commits (deleting the
    row), finds no row and correctly returns 'OTP not found or expired'.
    """
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                SELECT code_hash, expires_at, attempts_left
                FROM auth.otp_codes
                WHERE email = %s AND verified = FALSE
                FOR UPDATE
                """,
                (email.lower(),),
            )
            row = cur.fetchone()
            if not row:
                return {"success": False, "message": "OTP not found or expired."}

            code_hash, expires_at, attempts_left = row

            if _now() > expires_at.timestamp():
                cur.execute(
                    "DELETE FROM auth.otp_codes WHERE email = %s",
                    (email.lower(),),
                )
                return {"success": False, "message": "OTP expired. Please request a new code."}

            if attempts_left <= 0:
                cur.execute(
                    "DELETE FROM auth.otp_codes WHERE email = %s",
                    (email.lower(),),
                )
                return {"success": False, "message": "Too many attempts. Please request a new code."}

            if _hash_code(email, code) != code_hash:
                cur.execute(
                    "UPDATE auth.otp_codes SET attempts_left = attempts_left - 1 WHERE email = %s",
                    (email.lower(),),
                )
                return {"success": False, "message": "Invalid code."}

            # Code is correct — consume it.
            cur.execute(
                "DELETE FROM auth.otp_codes WHERE email = %s",
                (email.lower(),),
            )
            return {"success": True, "message": "OTP verified."}

    except Exception:
        return {"success": False, "message": "Verification error. Please try again."}


def mark_verified(email: str) -> None:
    """
    Mark an email as verified for the signup flow.

    Called after verify_otp() succeeds on the signup path. Inserts (or
    updates) a row with verified=TRUE and a blank code_hash so that
    is_verified() can confirm the email is cleared for registration.
    """
    ttl_seconds = _get_int_env("OTP_TTL_SECONDS", 300)
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO auth.otp_codes
                    (email, code_hash, expires_at, attempts_left, last_sent_at, verified)
                VALUES
                    (%s, '', now() + (%s * interval '1 second'), 0, now(), TRUE)
                ON CONFLICT (email) DO UPDATE SET
                    verified      = TRUE,
                    expires_at    = now() + (%s * interval '1 second'),
                    code_hash     = '',
                    attempts_left = 0
                """,
                (email.lower(), ttl_seconds, ttl_seconds),
            )
    except Exception:
        pass  # Non-fatal: /register will reject with "Email not verified" if this fails


def is_verified(email: str) -> bool:
    """
    Return True if the email has a current verified=TRUE record in the DB.
    Cleans up the row on the spot if the TTL has already lapsed.
    """
    try:
        with get_cursor() as cur:
            cur.execute(
                "SELECT verified, expires_at FROM auth.otp_codes WHERE email = %s FOR UPDATE",
                (email.lower(),),
            )
            row = cur.fetchone()
            if not row:
                return False
            verified, expires_at = row
            if not verified:
                return False
            if _now() > expires_at.timestamp():
                cur.execute(
                    "DELETE FROM auth.otp_codes WHERE email = %s",
                    (email.lower(),),
                )
                return False
            return True
    except Exception:
        return False


def clear_verified(email: str) -> None:
    """
    Remove the OTP/verified record for this email.
    Called after successful registration to clean up.
    """
    try:
        with get_cursor() as cur:
            cur.execute(
                "DELETE FROM auth.otp_codes WHERE email = %s",
                (email.lower(),),
            )
    except Exception:
        pass
