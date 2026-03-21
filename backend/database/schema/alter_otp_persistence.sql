-- OTP persistence: move OTP storage from in-memory Python dicts to database.
-- This ensures OTP data survives server restarts and works across multiple workers.

CREATE TABLE IF NOT EXISTS auth.otp_codes (
    id         BIGSERIAL    PRIMARY KEY,
    email      TEXT         NOT NULL,
    code_hash  TEXT         NOT NULL,
    expires_at TIMESTAMPTZ  NOT NULL,
    attempts_left INTEGER   NOT NULL DEFAULT 5,
    last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified   BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Each email should only have one active OTP at a time.
-- Use a unique index so new OTPs can replace old ones via ON CONFLICT.
CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_codes_email
    ON auth.otp_codes(email);

-- Auto-cleanup: delete expired rows periodically (optional, handled in code too).
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at
    ON auth.otp_codes(expires_at);
