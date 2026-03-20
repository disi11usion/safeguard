import os
import time
import secrets
import hashlib
import socket
from typing import Dict, Any

import smtplib
from email.message import EmailMessage

from database.utils.db_pool import get_db_connection

# ---------------------------------------------------------------------------
# Helpers (unchanged)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Database connection
# ---------------------------------------------------------------------------

def _get_conn():
    return get_db_connection() 


# ---------------------------------------------------------------------------
# SMTP (unchanged)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Public API  (same function signatures, storage changed from dict to DB)
# ---------------------------------------------------------------------------

def send_otp(email: str) -> Dict[str, Any]:
    ttl_seconds = _get_int_env("OTP_TTL_SECONDS", 300)
    min_interval = _get_int_env("OTP_MIN_INTERVAL_SECONDS", 60)
    max_attempts = _get_int_env("OTP_MAX_ATTEMPTS", 5)

    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            # Check rate limit
            cur.execute(
                "SELECT last_sent_at FROM auth.otp_codes WHERE email = %s",
                (email.lower(),),
            )
            row = cur.fetchone()
            if row and row[0]:
                last_sent_ts = row[0].timestamp()
                elapsed = _now() - last_sent_ts
                if elapsed < min_interval:
                    retry_in = int(min_interval - elapsed)
                    return {"success": False, "message": f"Please wait {retry_in}s before requesting another code."}

            # Generate OTP
            code = _generate_code()
            code_hash = _hash_code(email, code)

            # Upsert into DB (replace any existing OTP for this email)
            cur.execute(
                """
                INSERT INTO auth.otp_codes (email, code_hash, expires_at, attempts_left, last_sent_at, verified)
                VALUES (%s, %s, now() + interval '%s seconds', %s, now(), FALSE)
                ON CONFLICT (email) DO UPDATE SET
                    code_hash     = EXCLUDED.code_hash,
                    expires_at    = EXCLUDED.expires_at,
                    attempts_left = EXCLUDED.attempts_left,
                    last_sent_at  = EXCLUDED.last_sent_at,
                    verified      = FALSE
                """,
                (email.lower(), code_hash, ttl_seconds, max_attempts),
            )
            conn.commit()
    finally:
        conn.close()

    # Dev mode: return code directly without sending email
    dev_mode = _get_bool_env("OTP_DEV_MODE", False)
    if dev_mode:
        print(f"[OTP_DEV_MODE] OTP for {email}: {code}")
        return {"success": True, "message": "OTP generated (dev mode).", "dev_otp": code}

    # Send email
    try:
        if os.getenv("SMTP_HOST"):
            _send_via_smtp_with_retry(email, code)
        else:
            raise RuntimeError("SMTP configuration missing (SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM)")
    except (OSError, TimeoutError, smtplib.SMTPException, RuntimeError) as exc:
        return {"success": False, "error": "smtp_unavailable", "detail": str(exc)}

    return {"success": True, "message": "OTP sent successfully."}


def verify_otp(email: str, code: str) -> Dict[str, Any]:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT code_hash, expires_at, attempts_left FROM auth.otp_codes WHERE email = %s",
                (email.lower(),),
            )
            row = cur.fetchone()
            if not row:
                return {"success": False, "message": "OTP not found or expired."}

            code_hash, expires_at, attempts_left = row

            # Check expiry
            if _now() > expires_at.timestamp():
                cur.execute("DELETE FROM auth.otp_codes WHERE email = %s", (email.lower(),))
                conn.commit()
                return {"success": False, "message": "OTP expired. Please request a new code."}

            # Check attempts
            if attempts_left <= 0:
                cur.execute("DELETE FROM auth.otp_codes WHERE email = %s", (email.lower(),))
                conn.commit()
                return {"success": False, "message": "Too many attempts. Please request a new code."}

            # Check code
            if _hash_code(email, code) != code_hash:
                cur.execute(
                    "UPDATE auth.otp_codes SET attempts_left = attempts_left - 1 WHERE email = %s",
                    (email.lower(),),
                )
                conn.commit()
                return {"success": False, "message": "Invalid code."}

            # Success - delete the OTP row
            cur.execute("DELETE FROM auth.otp_codes WHERE email = %s", (email.lower(),))
            conn.commit()
            return {"success": True, "message": "OTP verified."}
    finally:
        conn.close()


def mark_verified(email: str) -> None:
    ttl_seconds = _get_int_env("OTP_TTL_SECONDS", 300)
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO auth.otp_codes (email, code_hash, expires_at, attempts_left, verified)
                VALUES (%s, '', now() + interval '%s seconds', 0, TRUE)
                ON CONFLICT (email) DO UPDATE SET
                    verified   = TRUE,
                    expires_at = now() + interval '%s seconds'
                """,
                (email.lower(), ttl_seconds, ttl_seconds),
            )
            conn.commit()
    finally:
        conn.close()


def is_verified(email: str) -> bool:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT verified, expires_at FROM auth.otp_codes WHERE email = %s",
                (email.lower(),),
            )
            row = cur.fetchone()
            if not row:
                return False
            verified, expires_at = row
            if not verified:
                return False
            if _now() > expires_at.timestamp():
                cur.execute("DELETE FROM auth.otp_codes WHERE email = %s", (email.lower(),))
                conn.commit()
                return False
            return True
    finally:
        conn.close()


def clear_verified(email: str) -> None:
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM auth.otp_codes WHERE email = %s", (email.lower(),))
            conn.commit()
    finally:
        conn.close()
