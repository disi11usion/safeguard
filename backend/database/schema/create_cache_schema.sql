-- Cache schema: persists external-API price snapshots (L3 of the multi-level cache).
-- Used for market_list / market_summary responses from Polygon / TwelveData.
-- clean_data.clean_prices_realtime continues to serve dashboard crypto prices.

CREATE SCHEMA IF NOT EXISTS cache;

CREATE TABLE IF NOT EXISTS cache.price_snapshot (
    cache_key        TEXT        PRIMARY KEY,
    asset_type       VARCHAR(20) NOT NULL,
    data             JSONB       NOT NULL,
    last_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE cache.price_snapshot IS
    'L3 persistent cache for external-API price responses (Polygon, TwelveData). '
    'Populated by the background refresh worker; read on Redis/L1 cache miss.';

CREATE INDEX IF NOT EXISTS idx_price_snapshot_updated
    ON cache.price_snapshot (last_updated_at DESC);
