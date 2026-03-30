-- Incremental schema updates for influencer + admin features.

-- Create new schemas if they don't exist.
CREATE SCHEMA IF NOT EXISTS marketing;
CREATE SCHEMA IF NOT EXISTS admin;

-- Extend auth.users with role/user_type and influencer_code.
ALTER TABLE auth.users
    ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
    ADD COLUMN IF NOT EXISTS user_type TEXT NOT NULL DEFAULT 'normal',
    ADD COLUMN IF NOT EXISTS influencer_code TEXT NULL;

-- Influencer master table.
CREATE TABLE IF NOT EXISTS marketing.influencers (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    referral_code TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One-time referral attribution at signup.
CREATE TABLE IF NOT EXISTS marketing.referral_attribution (
    user_id BIGINT NOT NULL UNIQUE,
    influencer_id BIGINT NOT NULL REFERENCES marketing.influencers(id),
    referral_code TEXT NOT NULL,
    attributed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id)
);

-- Commission events per transaction.
CREATE TABLE IF NOT EXISTS payments.commission_events (
    id BIGSERIAL PRIMARY KEY,
    influencer_id BIGINT NOT NULL REFERENCES marketing.influencers(id),
    user_id BIGINT NOT NULL REFERENCES auth.users(user_id),
    transaction_id BIGINT UNIQUE NOT NULL REFERENCES payments.stripe_transactions(id),
    plan_key TEXT NULL REFERENCES payments.plans(plan_key),
    revenue_cents BIGINT NOT NULL,
    commission_cents BIGINT NOT NULL,
    currency TEXT NOT NULL,
    paid_at TIMESTAMPTZ NOT NULL,
    eligible_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Store influencer code directly on transactions for reporting.
ALTER TABLE payments.stripe_transactions
    ADD COLUMN IF NOT EXISTS influencer_code TEXT NULL;

-- Monthly commission ledger.
CREATE TABLE IF NOT EXISTS payments.commission_ledger (
    influencer_id BIGINT NOT NULL REFERENCES marketing.influencers(id),
    month DATE NOT NULL,
    currency TEXT NOT NULL,
    eligible_revenue_cents BIGINT NOT NULL,
    commission_cents BIGINT NOT NULL,
    calc_status TEXT NOT NULL DEFAULT 'calculated',
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (influencer_id, month, currency)
);

-- Payouts tracking.
CREATE TABLE IF NOT EXISTS payments.payouts (
    influencer_id BIGINT NOT NULL REFERENCES marketing.influencers(id),
    month DATE NOT NULL,
    currency TEXT NOT NULL,
    amount_cents BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    paid_at TIMESTAMPTZ NULL,
    note TEXT NULL,
    UNIQUE (influencer_id, month, currency)
);

-- Admin audit log.
CREATE TABLE IF NOT EXISTS admin.audit_log (
    id BIGSERIAL PRIMARY KEY,
    admin_user_id BIGINT NOT NULL REFERENCES auth.users(user_id),
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT NULL,
    payload_json JSONB NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes.
CREATE INDEX IF NOT EXISTS idx_influencers_referral_code
    ON marketing.influencers(referral_code);

CREATE INDEX IF NOT EXISTS idx_commission_events_influencer_eligible
    ON payments.commission_events(influencer_id, eligible_at);

CREATE INDEX IF NOT EXISTS idx_commission_events_status_eligible
    ON payments.commission_events(status, eligible_at);

CREATE INDEX IF NOT EXISTS idx_stripe_transactions_influencer_code
    ON payments.stripe_transactions(influencer_code);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at
    ON admin.audit_log(created_at);
