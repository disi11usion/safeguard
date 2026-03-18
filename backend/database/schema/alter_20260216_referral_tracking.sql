-- Incremental schema updates for referral tracking on users.

ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS referral_code_used TEXT NULL,
    ADD COLUMN IF NOT EXISTS referred_by_influencer_id BIGINT NULL,
    ADD COLUMN IF NOT EXISTS referred_at TIMESTAMPTZ NULL;

ALTER TABLE auth.users
    ADD CONSTRAINT IF NOT EXISTS fk_users_referred_by_influencer
    FOREIGN KEY (referred_by_influencer_id)
    REFERENCES marketing.influencers(id)
    ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_referral_code_used
    ON auth.users(referral_code_used);

CREATE INDEX IF NOT EXISTS idx_users_referred_by_influencer_id
    ON auth.users(referred_by_influencer_id);
