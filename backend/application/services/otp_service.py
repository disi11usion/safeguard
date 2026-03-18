import os
import time
import secrets
import hashlib
import socket
from typing import Dict, Any

import smtplib
from email.message import EmailMessage


_OTP_STORE: Dict[str, Dict[str, Any]] = {}
_VERIFIED_EMAILS: Dict[str, float] = {}


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


def send_otp(email: str) -> Dict[str, Any]:
    ttl_seconds = _get_int_env("OTP_TTL_SECONDS", 300)
    min_interval = _get_int_env("OTP_MIN_INTERVAL_SECONDS", 60)
    max_attempts = _get_int_env("OTP_MAX_ATTEMPTS", 5)

    entry = _OTP_STORE.get(email)
    now = _now()

    if entry and now - entry.get("last_sent_at", 0) < min_interval:
        retry_in = int(min_interval - (now - entry.get("last_sent_at", 0)))
        return {"success": False, "message": f"Please wait {retry_in}s before requesting another code."}

    code = _generate_code()
    code_hash = _hash_code(email, code)

    _OTP_STORE[email] = {
        "code_hash": code_hash,
        "expires_at": now + ttl_seconds,
        "attempts_left": max_attempts,
        "last_sent_at": now,
    }

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


def mark_verified(email: str) -> None:
    ttl_seconds = _get_int_env("OTP_TTL_SECONDS", 300)
    _VERIFIED_EMAILS[email.lower()] = _now() + ttl_seconds


def is_verified(email: str) -> bool:
    expires_at = _VERIFIED_EMAILS.get(email.lower())
    if not expires_at:
        return False
    if _now() > expires_at:
        _VERIFIED_EMAILS.pop(email.lower(), None)
        return False
    return True


def clear_verified(email: str) -> None:
    _VERIFIED_EMAILS.pop(email.lower(), None)


def verify_otp(email: str, code: str) -> Dict[str, Any]:
    entry = _OTP_STORE.get(email)
    if not entry:
        return {"success": False, "message": "OTP not found or expired."}

    now = _now()
    if now > entry.get("expires_at", 0):
        _OTP_STORE.pop(email, None)
        return {"success": False, "message": "OTP expired. Please request a new code."}

    if entry.get("attempts_left", 0) <= 0:
        _OTP_STORE.pop(email, None)
        return {"success": False, "message": "Too many attempts. Please request a new code."}

    if _hash_code(email, code) != entry.get("code_hash"):
        entry["attempts_left"] = entry.get("attempts_left", 0) - 1
        return {"success": False, "message": "Invalid code."}

    _OTP_STORE.pop(email, None)
    return {"success": True, "message": "OTP verified."}
