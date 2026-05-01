-- OTP persistence: replace in-memory Python dicts with a proper DB table.
-- Idempotent: safe to run on a schema that already exists.

CREATE TABLE IF NOT EXISTS auth.otp_codes (
    id            BIGSERIAL    PRIMARY KEY,
    email         TEXT         NOT NULL,
    code_hash     TEXT         NOT NULL DEFAULT '',
    expires_at    TIMESTAMPTZ  NOT NULL,
    attempts_left INTEGER      NOT NULL DEFAULT 5,
    last_sent_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    verified      BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- One OTP row per email — used for ON CONFLICT upserts
CREATE UNIQUE INDEX IF NOT EXISTS idx_otp_codes_email
    ON auth.otp_codes (email);

-- Allows efficient cleanup of expired rows (future scheduled job)
CREATE INDEX IF NOT EXISTS idx_otp_codes_expires_at
    ON auth.otp_codes (expires_at);
