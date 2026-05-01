-- User Portfolio Assets — per-user holdings used by Stress Engine and Portfolio page.
-- Migration is idempotent; safe to re-run.

CREATE TABLE IF NOT EXISTS auth.user_portfolio_assets (
    asset_id      BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
    symbol        TEXT NOT NULL,
    name          TEXT,
    category      TEXT NOT NULL DEFAULT 'stock',
    weight        NUMERIC(8, 4) NOT NULL DEFAULT 0,
    entry_price   NUMERIC(18, 6),
    current_price NUMERIC(18, 6),
    risk          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_portfolio_assets_user_id
    ON auth.user_portfolio_assets(user_id);

-- Light constraint: weight should be in 0..100 if app treats it as a percentage.
ALTER TABLE auth.user_portfolio_assets
    DROP CONSTRAINT IF EXISTS user_portfolio_assets_weight_range;
ALTER TABLE auth.user_portfolio_assets
    ADD CONSTRAINT user_portfolio_assets_weight_range
    CHECK (weight >= 0 AND weight <= 100);
