-- Incremental schema updates for influencer codes + referrals.

-- New table for influencer codes (track usage).
CREATE TABLE IF NOT EXISTS marketing.influencer_codes (
    id BIGSERIAL PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    influencer_id BIGINT NOT NULL REFERENCES marketing.influencers(id) ON DELETE CASCADE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- New table for code usages (one code per user at signup).
CREATE TABLE IF NOT EXISTS marketing.referrals (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES auth.users(user_id) ON DELETE CASCADE,
    influencer_code_id BIGINT NOT NULL REFERENCES marketing.influencer_codes(id) ON DELETE CASCADE,
    referred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    source TEXT NULL
);

-- Extend users table for referral reporting.
ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS referral_code_used TEXT NULL,
    ADD COLUMN IF NOT EXISTS referred_influencer_id BIGINT NULL,
    ADD COLUMN IF NOT EXISTS referred_at TIMESTAMPTZ NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_referred_influencer'
    ) THEN
        ALTER TABLE auth.users
            ADD CONSTRAINT fk_users_referred_influencer
            FOREIGN KEY (referred_influencer_id)
            REFERENCES marketing.influencers(id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- Indexes.
CREATE INDEX IF NOT EXISTS idx_users_referral_code_used
    ON auth.users(referral_code_used);

CREATE INDEX IF NOT EXISTS idx_users_referred_influencer_id
    ON auth.users(referred_influencer_id);

CREATE INDEX IF NOT EXISTS idx_referrals_user_id
    ON marketing.referrals(user_id);

CREATE INDEX IF NOT EXISTS idx_referrals_influencer_code_id
    ON marketing.referrals(influencer_code_id);

CREATE INDEX IF NOT EXISTS idx_influencer_codes_code
    ON marketing.influencer_codes(code);

-- Backfill influencer_codes from existing marketing.influencers.referral_code.
INSERT INTO marketing.influencer_codes (code, influencer_id, is_active)
SELECT i.referral_code, i.id, TRUE
FROM marketing.influencers i
WHERE i.referral_code IS NOT NULL
ON CONFLICT (code) DO NOTHING;

-- Backfill referred_influencer_id from legacy column if present.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'auth'
          AND table_name = 'users'
          AND column_name = 'referred_by_influencer_id'
    ) THEN
        EXECUTE '
            UPDATE auth.users
            SET referred_influencer_id = referred_by_influencer_id
            WHERE referred_influencer_id IS NULL
              AND referred_by_influencer_id IS NOT NULL
        ';
    END IF;
END $$;
