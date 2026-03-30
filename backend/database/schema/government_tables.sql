-- ============================================================================
-- Government Module Tables
-- Stores macroeconomic indicator data and sentiment for 22 countries
-- ============================================================================

-- Schema
CREATE SCHEMA IF NOT EXISTS government;

-- ============================================================================
-- 1. Country reference table
-- ============================================================================
CREATE TABLE IF NOT EXISTS government.countries (
    country_code    TEXT PRIMARY KEY,          -- ISO 3166-1 alpha-2
    country_name    TEXT NOT NULL,
    region          TEXT NOT NULL,             -- 'major', 'eurozone', 'emerging'
    display_order   INT NOT NULL DEFAULT 0,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT now()
);

-- Seed 22 countries
INSERT INTO government.countries (country_code, country_name, region, display_order) VALUES
    ('US', 'United States',       'major',    1),
    ('EZ', 'Eurozone',            'major',    2),
    ('GB', 'United Kingdom',      'major',    3),
    ('JP', 'Japan',               'major',    4),
    ('CN', 'China',               'major',    5),
    ('CA', 'Canada',              'major',    6),
    ('AU', 'Australia',           'major',    7),
    ('CH', 'Switzerland',         'major',    8),
    ('IN', 'India',               'major',    9),
    ('KR', 'South Korea',         'major',   10),
    ('BR', 'Brazil',              'major',   11),
    ('TR', 'Turkey',              'major',   12),
    ('DE', 'Germany',             'eurozone', 13),
    ('FR', 'France',              'eurozone', 14),
    ('IT', 'Italy',               'eurozone', 15),
    ('ES', 'Spain',               'eurozone', 16),
    ('NL', 'Netherlands',         'eurozone', 17),
    ('SA', 'Saudi Arabia',        'emerging', 18),
    ('AE', 'United Arab Emirates','emerging', 19),
    ('ZA', 'South Africa',        'emerging', 20),
    ('MX', 'Mexico',              'emerging', 21),
    ('SG', 'Singapore',           'emerging', 22)
ON CONFLICT (country_code) DO NOTHING;

-- ============================================================================
-- 2. Raw macroeconomic metrics table
-- ============================================================================
CREATE TABLE IF NOT EXISTS government.macro_metrics (
    id              BIGSERIAL PRIMARY KEY,
    country_code    TEXT NOT NULL REFERENCES government.countries(country_code),
    metric_name     TEXT NOT NULL,              -- 'inflation','interest_rate','employment','gdp','pmi','bond_yield_10y'
    metric_value    NUMERIC,
    previous_value  NUMERIC,
    forecast_value  NUMERIC,
    unit            TEXT,                       -- '%', 'index', 'basis_points'
    source          TEXT,                       -- 'alpha_vantage','fred','world_bank','imf'
    period          TEXT,                       -- '2025-Q4', '2025-12', 'latest'
    fetched_at      TIMESTAMPTZ DEFAULT now(),
    data_date       DATE,                       -- The date the data refers to
    UNIQUE (country_code, metric_name, data_date)
);

CREATE INDEX IF NOT EXISTS idx_macro_metrics_country 
ON government.macro_metrics(country_code, metric_name, data_date DESC);

-- ============================================================================
-- 3. Per-country per-metric sentiment (Positive/Neutral/Negative)
-- ============================================================================
CREATE TABLE IF NOT EXISTS government.metric_sentiment (
    id              BIGSERIAL PRIMARY KEY,
    country_code    TEXT NOT NULL REFERENCES government.countries(country_code),
    metric_name     TEXT NOT NULL,
    sentiment_label TEXT NOT NULL CHECK (sentiment_label IN ('positive','neutral','negative')),
    sentiment_score NUMERIC(6,4),               -- -1.0 to 1.0
    analysis_note   TEXT,                        -- Brief explanation
    analyzed_at     TIMESTAMPTZ DEFAULT now(),
    data_date       DATE,
    UNIQUE (country_code, metric_name, data_date)
);

CREATE INDEX IF NOT EXISTS idx_metric_sentiment_country
ON government.metric_sentiment(country_code, analyzed_at DESC);

-- ============================================================================
-- 4. Per-country overall macro sentiment
-- ============================================================================
CREATE TABLE IF NOT EXISTS government.country_sentiment (
    id              BIGSERIAL PRIMARY KEY,
    country_code    TEXT NOT NULL REFERENCES government.countries(country_code),
    overall_score   NUMERIC(6,4),               -- Average of 6 metrics, -1.0 to 1.0
    overall_label   TEXT NOT NULL CHECK (overall_label IN ('positive','neutral','negative')),
    positive_count  INT DEFAULT 0,
    neutral_count   INT DEFAULT 0,
    negative_count  INT DEFAULT 0,
    analyzed_at     TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_country_sentiment_unique
ON government.country_sentiment(country_code, (analyzed_at::date));

CREATE INDEX IF NOT EXISTS idx_country_sentiment_date
ON government.country_sentiment(analyzed_at DESC);

-- ============================================================================
-- 5. Global market sentiment (average of all 22 countries)
-- ============================================================================
CREATE TABLE IF NOT EXISTS government.global_sentiment (
    id              BIGSERIAL PRIMARY KEY,
    global_score    NUMERIC(6,4),
    global_label    TEXT NOT NULL CHECK (global_label IN ('positive','neutral','negative')),
    countries_count INT DEFAULT 22,
    analyzed_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_global_sentiment_date
ON government.global_sentiment(analyzed_at DESC);
