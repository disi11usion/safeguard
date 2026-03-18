 /*
 * file: create_tables.sql
 * description: This script creates the necessary tables.
 * It includes tables for user authentication, metadata management,
 * raw data storage, clean data processing, and analytics.
 * Date: 26-06-2025
*/
-- Create enum type
CREATE TYPE sentiment_label AS ENUM ('Bearish', 'Somewhat-Bearish', 'Neutral', 'Bullish', 'Somewhat-Bullish');
CREATE TYPE period_type AS ENUM ('hourly', 'daily', 'weekly', 'monthly');
CREATE TYPE mover_type AS ENUM ('gainer', 'loser', 'active');
CREATE TYPE event_importance AS ENUM ('low', 'medium', 'high');

-- Influencer referral codes table
CREATE TABLE IF NOT EXISTS auth.influencer_codes (
    code TEXT PRIMARY KEY,
    influencer_name TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS disclaimer_acceptances (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  disclaimer_version TEXT NOT NULL,
  disclaimer_hash TEXT NOT NULL,
  country TEXT,
  accepted BOOLEAN DEFAULT TRUE,
  accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_id INTEGER NULL
);

-- Stores user authentication details. It also tracks the last
-- login time and timestamps for creation and updates.
CREATE TABLE IF NOT EXISTS auth.users (
    user_id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    hashed_password TEXT NOT NULL,
    full_name TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    user_type TEXT NOT NULL DEFAULT 'normal' CHECK (user_type IN ('normal','special')),
    influencer_code TEXT NULL REFERENCES auth.influencer_codes(code)
);

-- =========================
-- Billing / Orders / Influencer commissions
-- =========================
CREATE SCHEMA IF NOT EXISTS billing;

-- One row per successful payment (idempotent via provider + provider_payment_id)
CREATE TABLE IF NOT EXISTS billing.orders (
    order_id BIGSERIAL PRIMARY KEY,

    buyer_user_id BIGINT NOT NULL REFERENCES auth.users(user_id),

    provider TEXT NOT NULL,                       -- 'stripe' / 'paypal' / 'wise'
    provider_payment_id TEXT NOT NULL,            -- payment intent / capture id / etc
    amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'USD',

    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('paid', 'refunded', 'failed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE (provider, provider_payment_id)
);

-- One row per order that generated commission (ledger/audit table)
CREATE TABLE IF NOT EXISTS billing.influencer_commissions (
    commission_id BIGSERIAL PRIMARY KEY,

    order_id BIGINT NOT NULL REFERENCES billing.orders(order_id) ON DELETE CASCADE,

    influencer_code TEXT NOT NULL REFERENCES auth.influencer_codes(code),
    gross_amount_cents BIGINT NOT NULL CHECK (gross_amount_cents >= 0),
    commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.30,
    commission_cents BIGINT NOT NULL CHECK (commission_cents >= 0),

    status TEXT NOT NULL DEFAULT 'earned' CHECK (status IN ('pending', 'earned', 'paid', 'reversed')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE (order_id)
);

-- Fast summary table for admin panel dashboards
CREATE TABLE IF NOT EXISTS billing.influencer_balances (
    influencer_code TEXT PRIMARY KEY REFERENCES auth.influencer_codes(code),

    usage_count BIGINT NOT NULL DEFAULT 0,
    total_sales_cents BIGINT NOT NULL DEFAULT 0,
    total_commission_cents BIGINT NOT NULL DEFAULT 0,

    pending_commission_cents BIGINT NOT NULL DEFAULT 0,
    earned_commission_cents BIGINT NOT NULL DEFAULT 0,

    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orders_buyer_user ON billing.orders(buyer_user_id);
CREATE INDEX IF NOT EXISTS idx_commissions_code ON billing.influencer_commissions(influencer_code);

ALTER TABLE auth.influencer_codes
ADD COLUMN IF NOT EXISTS influencer_user_id BIGINT REFERENCES auth.users(user_id);



-- Stores metadata about data sources. It also tracks when the
-- source was created and last updated.
CREATE TABLE IF NOT EXISTS metadata.data_sources (
    source_id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT,
    base_url TEXT,
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
	last_updated_at TIMESTAMPTZ DEFAULT now()
);

-- Logs ingestion jobs for data sources. It tracks the start and end
-- times of the job, the number of records processed, and the status
-- of the job. It also includes an error message in case of failure.
CREATE TABLE IF NOT EXISTS metadata.ingestion_job_log (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id INT NOT NULL REFERENCES metadata.data_sources(source_id),
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    record_count INT,
    status TEXT NOT NULL CHECK (status IN ('started','staged', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);


-- Stores information about cryptocurrencies.
CREATE TABLE IF NOT EXISTS reference.cryptocurrencies (
    crypto_id BIGSERIAL PRIMARY KEY,
    symbol_binance TEXT NOT NULL UNIQUE,
    symbol_coingecko TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
	icon_path TEXT,
    rank INT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);


-- Stores risk profiles for users based on their questionnaire results.
-- Each profile has a unique name and description, along with high and low
-- score thresholds.
CREATE TABLE IF NOT EXISTS reference.risk_profiles (
    profile_id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    score_high NUMERIC(7, 4) NOT NULL,
    score_low NUMERIC(7, 4) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);

-- Store Economic Events
CREATE TABLE IF NOT EXISTS reference.economic_events (
    id BIGSERIAL PRIMARY KEY,
    event_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    country TEXT NOT NULL,
    currency TEXT DEFAULT 'USD',
    category TEXT NOT NULL,
    event_date TIMESTAMPTZ NOT NULL,
    importance event_importance DEFAULT 'medium',
    previous_value NUMERIC(15, 6),
    forecast_value NUMERIC(15, 6),
    actual_value NUMERIC(15, 6),
    is_high_impact BOOLEAN DEFAULT FALSE,
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);

-- Raw Prices Tables
-- These tables store raw price data for cryptocurrencies.
-- The raw prices are stored in both historic and real-time formats.
CREATE TABLE IF NOT EXISTS raw_data.raw_prices_historic (
    price_id BIGSERIAL,
    crypto_id INT NOT NULL REFERENCES reference.cryptocurrencies(crypto_id),
    recorded_at TIMESTAMPTZ,
    price NUMERIC(40, 10),
    price_open NUMERIC(40, 10),
    price_high NUMERIC(40, 10),
    price_low NUMERIC(40, 10),
    volume NUMERIC(40, 10),
    quote_asset_volume NUMERIC(40, 10),
    price_change NUMERIC(40, 10),
    percentage_change NUMERIC(20, 10),
    market_cap NUMERIC(40, 10),
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
	payload JSONB,
    job_id UUID REFERENCES metadata.ingestion_job_log(job_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (price_id, recorded_at)
);


-- Raw Data Tables
-- These tables store raw data for news, and social media posts.
CREATE TABLE IF NOT EXISTS raw_data.raw_news (
    news_id BIGSERIAL,
    title TEXT NOT NULL,
    content TEXT,
    published_at TIMESTAMPTZ,
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    url TEXT,
    coins TEXT,
    crypto_ids TEXT,
	payload JSONB,
    job_id UUID REFERENCES metadata.ingestion_job_log(job_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (news_id, published_at)
);

CREATE TABLE IF NOT EXISTS raw_data.raw_social (
    post_id BIGSERIAL,
    platform_id TEXT,                      
    title TEXT,
    content TEXT,
    posted_at TIMESTAMPTZ,
    author TEXT,
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    url TEXT,
    comments JSONB,
    payload JSONB,
    job_id UUID REFERENCES metadata.ingestion_job_log(job_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (post_id, posted_at),
    CONSTRAINT ux_raw_social_source_platform UNIQUE (source_id, platform_id,posted_at) 
);

-- crypto transactions table 
CREATE TABLE IF NOT EXISTS raw_data.crypto_transactions(
    hash TEXT PRIMARY KEY,
    total NUMERIC(30, 8),
    fee NUMERIC(30, 8),
    timestamp TIMESTAMPTZ NOT NULL,
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    job_id UUID REFERENCES metadata.ingestion_job_log(job_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);
-- crypto tx senders table
CREATE TABLE IF NOT EXISTS raw_data.crypto_tx_senders(
    id BIGSERIAL PRIMARY KEY,
    transaction_hash TEXT NOT NULL REFERENCES raw_data.crypto_transactions(hash),
    address TEXT NOT NULL,
    output_value NUMERIC(30, 8),
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);
--crypto tx receivers table
CREATE TABLE IF NOT EXISTS raw_data.crypto_tx_receivers(
    id BIGSERIAL PRIMARY KEY,
    transaction_hash TEXT NOT NULL REFERENCES raw_data.crypto_transactions(hash),
    address TEXT NOT NULL,
    value NUMERIC(30, 8),
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);



-- Clean Prices Tables
-- These tables store cleaned price data for cryptocurrencies.
-- The cleaned prices are stored in historic daily, monthly and real-time formats.
CREATE TABLE IF NOT EXISTS clean_data.clean_prices_historic (
    price_id BIGSERIAL,
    crypto_id INT NOT NULL REFERENCES reference.cryptocurrencies(crypto_id),
    recorded_at TIMESTAMPTZ,
    price NUMERIC(40, 10),
    price_open NUMERIC(40, 10),
    price_high NUMERIC(40, 10),
    price_low NUMERIC(40, 10),
    volume NUMERIC(40, 10),
    quote_asset_volume NUMERIC(40, 10),
    price_change NUMERIC(40, 10),
    percentage_change NUMERIC(20, 10),
    percentage_change_7d NUMERIC(20, 10),
    market_cap NUMERIC(40, 10),
    sma_20 NUMERIC(40, 10),
    sma_50 NUMERIC(40, 10),
    rsi NUMERIC(40, 10),
    volume_color TEXT CHECK (volume_color IN ('green', 'red')),
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    raw_price_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (price_id, recorded_at)
);

CREATE TABLE IF NOT EXISTS clean_data.clean_prices_monthly (
    price_id BIGSERIAL PRIMARY KEY,
    crypto_id INT NOT NULL REFERENCES reference.cryptocurrencies(crypto_id),
    month INT,
    year INT,
    price NUMERIC(40, 10),
    volume NUMERIC(40, 10),
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clean_data.clean_prices_realtime (
    price_id BIGSERIAL,
    crypto_id INT NOT NULL REFERENCES reference.cryptocurrencies(crypto_id),
    recorded_at TIMESTAMPTZ,
    price NUMERIC(40, 10),
    price_open NUMERIC(40, 10),
    price_high NUMERIC(40, 10),
    price_low NUMERIC(40, 10),
    volume NUMERIC(40, 10),
    quote_asset_volume NUMERIC(40, 10),
    price_change NUMERIC(40, 10),
    percentage_change NUMERIC(20, 10),
    market_cap NUMERIC(40, 10),
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    job_id UUID REFERENCES metadata.ingestion_job_log(job_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (price_id, recorded_at)
);

-- Clean Data Tables
-- These tables store cleaned data for news, social media posts, and announcements.
CREATE TABLE IF NOT EXISTS clean_data.clean_news (
    news_id BIGSERIAL,
    title TEXT,
    news_content TEXT,
    published_at TIMESTAMPTZ,
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    url TEXT,
    raw_news_id BIGINT,
    coins TEXT,
    crypto_ids TEXT,
    job_id UUID REFERENCES metadata.ingestion_job_log(job_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (news_id, published_at)
);

CREATE TABLE IF NOT EXISTS clean_data.clean_social (
    post_id BIGSERIAL,
    platform_id TEXT NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    posted_at TIMESTAMPTZ,
    author TEXT,
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    url TEXT,
    comments JSONB,
    raw_post_id BIGINT,
    job_id UUID REFERENCES metadata.ingestion_job_log(job_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (post_id, posted_at)
);

CREATE TABLE IF NOT EXISTS clean_data.official_announcements (
    announcement_id BIGSERIAL PRIMARY KEY,
    published_year INT,
    gdp_usd NUMERIC(30,10),
    inflation_pct NUMERIC(20,10),
    lending_rate_pct NUMERIC(20,10),
    unemployment_pct NUMERIC(20,10),
    population BIGINT,
    country TEXT,
    country_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);

-- stock market data tables
CREATE TABLE IF NOT EXISTS clean_data.stock_market_data (
    time_key TIMESTAMPTZ NOT NULL,
    ticker TEXT NOT NULL,
    name TEXT,
    price NUMERIC(15, 2),
    change_percent NUMERIC(8, 4),
    volume BIGINT,
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (time_key, ticker)
);

-- User Risk Assessment Tables
-- These tables store user questionnaire results, risk profiles, and coin preferences.
-- The user_questionnaire_results table stores the results of the risk assessment questionnaire.
CREATE TABLE IF NOT EXISTS auth.user_questionnaire_results (
    user_result_id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
    risk_score NUMERIC(7, 4) NOT NULL,
    profile_id INT NOT NULL REFERENCES reference.risk_profiles(profile_id),
    selected_choices JSONB NOT NULL,
    assessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);

-- The user_risk_profiles table stores the risk profiles assigned 
-- to users based on their questionnaire results
CREATE TABLE IF NOT EXISTS auth.user_risk_profiles (
    user_profile_id BIGSERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
    profile_id INT NOT NULL REFERENCES reference.risk_profiles(profile_id),
    risk_score NUMERIC(7, 4),
    result_id BIGINT UNIQUE REFERENCES auth.user_questionnaire_results(user_result_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);

-- The user_coin_preferences table stores the cryptocurrencies that 
-- users have selected as their preferences.
CREATE TABLE IF NOT EXISTS auth.user_coin_preferences (
    user_preference_id BIGSERIAL,
    user_id INT NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
    crypto_id INT NOT NULL REFERENCES reference.cryptocurrencies(crypto_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now(),
    is_active BOOLEAN DEFAULT TRUE,
    PRIMARY KEY (user_id, crypto_id)
);

-- The training_data_news table stores historic crypto news required for training.
CREATE TABLE IF NOT EXISTS clean_data.training_data_news (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    news_datetime TEXT,
    url TEXT NOT NULL,
    coin_symbol TEXT,
    coin_name TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);


-- This table stores periodic coin level sentiments calculated using
-- FinBERT model
CREATE TABLE IF NOT EXISTS analytics.finbert_coin_sentiment (
    sentiment_id SERIAL,
    crypto_id INT NOT NULL REFERENCES reference.cryptocurrencies(crypto_id),
    sentiment_score DOUBLE PRECISION,
    sentiment_label TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (sentiment_id, created_at)
);

-- This table stores periodic market level sentiment calculated using
-- FinBERT model
CREATE TABLE IF NOT EXISTS analytics.market_level_sentiment (
    sentiment_id BIGSERIAL,
    sentiment_score  DOUBLE PRECISION NOT NULL,
    sentiment_label  VARCHAR(16)   NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at  TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (sentiment_id, created_at)
);


-- The table forecasts stores periodic forecasts per coin based on risk profiles
CREATE TABLE IF NOT EXISTS analytics.forecasts (
    forecast_id BIGSERIAL,
    profile_id INT REFERENCES reference.risk_profiles(profile_id),
    crypto_id INT REFERENCES reference.cryptocurrencies(crypto_id),
    volatility NUMERIC(10, 5),
    trend TEXT,
    risk_message TEXT,
    recommendation TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (forecast_id, created_at)
);
 
 -- news sentiment table
CREATE TABLE IF NOT EXISTS analytics.news_sentiment (
    id BIGSERIAL PRIMARY KEY,
    news_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT,
    source TEXT,
    authors JSONB,
    overall_sentiment_score NUMERIC(5, 4),
    overall_sentiment_label sentiment_label,
    url TEXT,
    banner_image_url TEXT,
    time_published TIMESTAMPTZ,
    topics JSONB,
    ticker_sentiment JSONB,
    data_source text DEFAULT 'eodhd',
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    job_id UUID REFERENCES metadata.ingestion_job_log(job_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);

-- news sentiment summary
CREATE TABLE IF NOT EXISTS analytics.news_sentiment_summary (
    id BIGSERIAL PRIMARY KEY,
    summary_date DATE NOT NULL,
    period_type period_type DEFAULT 'daily',
    total_news_count INTEGER DEFAULT 0,
    bullish_count INTEGER DEFAULT 0,
    somewhat_bullish_count INTEGER DEFAULT 0,
    neutral_count INTEGER DEFAULT 0,
    bearish_count INTEGER DEFAULT 0,
    somewhat_bearish_count INTEGER DEFAULT 0,
    average_sentiment_score NUMERIC(5, 4),
    dominant_sentiment sentiment_label,
    top_tickers JSONB,
    market_sector JSONB,
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (summary_date, period_type)
);
-- market movers table
CREATE TABLE IF NOT EXISTS analytics.market_movers (
    id BIGSERIAL PRIMARY KEY,
    ticker TEXT NOT NULL,
    name TEXT,
    price NUMERIC(15, 4),
    change_percent NUMERIC(8, 4),
    volume BIGINT,
    market_cap BIGINT,
    sector TEXT,
    industry TEXT,
    mover_type mover_type,
    reason TEXT,
    news_count INTEGER DEFAULT 0,
    sentiment_score NUMERIC(5, 4),
    ranking INTEGER,
    data_date DATE,
    source_id BIGINT REFERENCES metadata.data_sources(source_id),
    job_id UUID REFERENCES metadata.ingestion_job_log(job_id),
    created_at TIMESTAMPTZ DEFAULT now(),
    last_updated_at TIMESTAMPTZ DEFAULT now()
);


-- 订阅付费
-- 套餐基础设计（套餐的价格和时间）
CREATE TABLE IF NOT EXISTS payments.plans (
    -- 基础信息
    plan_key       TEXT PRIMARY KEY, -- 套餐类型：'free', 'basic_monthly', 'basic_yearly', ...
    tier           TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free','basic','premium','enterprise')), -- 订阅等级（默认free)
    billing_cycle  TEXT NOT NULL DEFAULT 'none' CHECK (billing_cycle IN ('none','monthly','yearly')), -- 订阅周期(默认none)
    price_cents    INT  NOT NULL DEFAULT 0 CHECK (price_cents >= 0), -- 套餐价格（按分结算，避免浮点误差）
    currency       TEXT NOT NULL DEFAULT 'USD', -- 默认货币USD

    -- 功能限制
    news_analysis_limit    INT NOT NULL DEFAULT -1 CHECK (news_analysis_limit >= -1), -- 新闻分析次数限制（-1 表示无限）
    social_analysis_limit  INT NOT NULL DEFAULT -1 CHECK (social_analysis_limit >= -1), -- 社交媒体分析次数限制（-1 表示无限）
    data_access            TEXT NOT NULL DEFAULT 'basic' CHECK (data_access IN ('basic','limited','full')), -- 数据访问权限等级（默认基础）
    sentiment_analysis     TEXT NOT NULL DEFAULT 'none' CHECK (sentiment_analysis IN ('none','limited','full')), -- 情绪分析功能权限
    api_access             BOOLEAN NOT NULL DEFAULT FALSE, -- 是否允许 API 调用（防止滥用）
    priority_support       BOOLEAN NOT NULL DEFAULT FALSE, -- 是否提供优先客服支持
    duration_days          INT NULL CHECK (duration_days IS NULL OR duration_days > 0), -- 套餐持续时长（monthly可以使用30等）
    -- 一致性约束
    CHECK (
        (billing_cycle = 'none' AND duration_days IS NULL)
        OR
        (billing_cycle IN ('monthly','yearly') AND duration_days IS NOT NULL AND duration_days > 0)
    ),

    -- 状态控制
    is_visible     BOOLEAN NOT NULL DEFAULT TRUE, -- 是否对前端可见，默认可见
    is_active      BOOLEAN NOT NULL DEFAULT TRUE, -- 是否允许售卖，默认都可购买

    -- 套餐审计
    description TEXT, -- 套餐描述
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(), -- 套餐设计创建时间
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now() -- 套餐设计更新时间
);

-- updated_at字段自动更新
CREATE OR REPLACE FUNCTION payments.set_updated_at_if_changed()
RETURNS TRIGGER AS $$
BEGIN
  IF ROW(NEW.*) IS DISTINCT FROM ROW(OLD.*) THEN
    NEW.updated_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION payments.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_plans_set_updated_at ON payments.plans;

CREATE TRIGGER trg_plans_set_updated_at
BEFORE UPDATE ON payments.plans
FOR EACH ROW
EXECUTE FUNCTION payments.set_updated_at_if_changed();

-- 用户订阅记录
CREATE TABLE IF NOT EXISTS payments.subscriptions (
    -- 基础信息
    subscription_id BIGSERIAL PRIMARY KEY, -- 订阅号
    user_id         BIGINT NOT NULL, -- 用户id
    plan_key        TEXT   NOT NULL, -- 套餐类型

    -- 订阅具体信息
    status          TEXT   NOT NULL CHECK (status IN ('active','expired','cancelled','pending', 'past_due')), -- 订阅状态
    start_at        TIMESTAMPTZ NOT NULL DEFAULT now(), -- 订阅开始时间
    end_at          TIMESTAMPTZ NULL, -- 订阅结束时间
    auto_renew      BOOLEAN NOT NULL DEFAULT FALSE, -- 是否自动续费
    provider        TEXT NULL CHECK(provider IN ('mock','stripe','paypal')), -- 'mock'（测试用）/'stripe'/'paypal'
    provider_ref    TEXT NULL,                      -- payment_intent/order_id etc.外部引用号，用于标定一个订单的支付记录，由支付平台产生

    -- 订阅审计
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(), -- 创建时间
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(), -- 更新时间

    -- 约束条件
    CONSTRAINT fk_sub_user -- user id外键
      FOREIGN KEY (user_id) REFERENCES auth.users(user_id) ON DELETE CASCADE,

    CONSTRAINT fk_sub_plan -- 套餐类型外键
      FOREIGN KEY (plan_key) REFERENCES payments.plans(plan_key),

    CONSTRAINT chk_end_after_start -- 时间设定
      CHECK (end_at IS NULL OR end_at > start_at)
);

-- 关键索引：查当前订阅/到期扫描（高频）
CREATE INDEX IF NOT EXISTS idx_sub_user_status
ON payments.subscriptions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_sub_end_at
ON payments.subscriptions(end_at);

-- 取最新一条（ORDER BY start_at DESC LIMIT 1）
CREATE INDEX IF NOT EXISTS idx_sub_user_status_start_desc
  ON payments.subscriptions (user_id, status, start_at DESC);

-- 确保每个用户同一时间最多只有一条 active
CREATE UNIQUE INDEX IF NOT EXISTS uq_sub_one_active_per_user
ON payments.subscriptions(user_id)
WHERE status = 'active';

-- 外部引用幂等去重（防止webhook 重放、重复写入）
CREATE UNIQUE INDEX IF NOT EXISTS uq_sub_provider_ref
  ON payments.subscriptions (provider, provider_ref)
  WHERE provider IS NOT NULL AND provider_ref IS NOT NULL;

-- 权限查询索引
CREATE INDEX IF NOT EXISTS idx_sub_user_status_start_desc
  ON payments.subscriptions (user_id, status, start_at DESC);
-- 使用方式
-- SELECT
--   p.plan_key,
--   p.news_analysis_limit,
--   p.social_analysis_limit,
--   p.data_access,
--   p.api_access,
--   p.priority_support
-- FROM payments.subscriptions s
-- JOIN billing.plans p ON p.plan_key = s.plan_key
-- WHERE s.user_id = $1
--   AND s.status = 'active'
--   AND (s.end_at IS NULL OR s.end_at > now())
-- ORDER BY s.start_at DESC
-- LIMIT 1;

-- 自动更新日期的trigger
DROP TRIGGER IF EXISTS trg_sub_updated_at ON payments.subscriptions;

CREATE TRIGGER trg_sub_updated_at
BEFORE UPDATE ON payments.subscriptions
FOR EACH ROW
EXECUTE FUNCTION payments.set_updated_at();


-- ============================================================================
-- Stripe 支付交易表（替换原有的 payments.transactions）
-- ============================================================================
DROP TABLE IF EXISTS payments.transactions CASCADE;

CREATE TABLE IF NOT EXISTS payments.stripe_transactions (
    -- 主键
    id                          BIGSERIAL PRIMARY KEY,
    
    -- 关联信息
    user_id                     BIGINT NOT NULL,
    subscription_id             BIGINT NULL,
    plan_key                    TEXT NOT NULL,
    
    -- Stripe 核心字段
    stripe_payment_intent_id    TEXT NULL UNIQUE,
    stripe_charge_id            TEXT NULL,
    stripe_invoice_id           TEXT NULL,
    
    -- 金额信息
    amount_cents                INT NOT NULL CHECK (amount_cents >= 0),
    currency                    TEXT NOT NULL DEFAULT 'USD',
    
    -- 交易状态
    status                      TEXT NOT NULL DEFAULT 'created' 
        CHECK (status IN ('created', 'succeeded', 'pending', 'failed', 'refunded', 'canceled')),
    
    -- 支付方式信息
    payment_method_type         TEXT NULL 
        CHECK (payment_method_type IN ('card', 'alipay', 'wechat_pay', 'bank_transfer', 'apple_pay', 'google_pay')),
    
    -- 卡信息
    card_brand                  TEXT NULL 
        CHECK (card_brand IN ('visa', 'mastercard', 'amex', 'discover', 'diners', 'jcb', 'unionpay')),
    card_last4                  TEXT NULL CHECK (card_last4 IS NULL OR LENGTH(card_last4) = 4),
    card_exp_month              INT NULL CHECK (card_exp_month IS NULL OR (card_exp_month >= 1 AND card_exp_month <= 12)),
    card_exp_year               INT NULL CHECK (card_exp_year IS NULL OR card_exp_year >= 2024),
    
    -- 收据和错误信息
    receipt_url                 TEXT NULL,
    error_code                  TEXT NULL,
    error_message               TEXT NULL,
    
    -- 额外元数据
    metadata                    JSONB NULL,
    
    -- 时间戳
    paid_at                     TIMESTAMPTZ NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- 外键约束
    CONSTRAINT fk_stripe_tx_user
        FOREIGN KEY (user_id) REFERENCES auth.users(user_id) ON DELETE CASCADE,
    
    CONSTRAINT fk_stripe_tx_subscription
        FOREIGN KEY (subscription_id) REFERENCES payments.subscriptions(subscription_id) ON DELETE SET NULL,
    
    CONSTRAINT fk_stripe_tx_plan
        FOREIGN KEY (plan_key) REFERENCES payments.plans(plan_key)
);

-- ============================================================================
-- 索引优化
-- ============================================================================
-- 用户查询索引（高频）
CREATE INDEX IF NOT EXISTS idx_stripe_tx_user_created
ON payments.stripe_transactions(user_id, created_at DESC);

-- Stripe Payment Intent 查询索引（webhook 使用）
CREATE INDEX IF NOT EXISTS idx_stripe_tx_payment_intent
ON payments.stripe_transactions(stripe_payment_intent_id)
WHERE stripe_payment_intent_id IS NOT NULL;

-- Stripe Charge 查询索引
CREATE INDEX IF NOT EXISTS idx_stripe_tx_charge_id
ON payments.stripe_transactions(stripe_charge_id)
WHERE stripe_charge_id IS NOT NULL;

-- Stripe Invoice 查询索引
CREATE INDEX IF NOT EXISTS idx_stripe_tx_invoice_id
ON payments.stripe_transactions(stripe_invoice_id)
WHERE stripe_invoice_id IS NOT NULL;

-- 订阅关联查询索引
CREATE INDEX IF NOT EXISTS idx_stripe_tx_subscription
ON payments.stripe_transactions(subscription_id)
WHERE subscription_id IS NOT NULL;

-- 状态查询索引
CREATE INDEX IF NOT EXISTS idx_stripe_tx_status
ON payments.stripe_transactions(status, created_at DESC);

-- 支付方式统计索引
CREATE INDEX IF NOT EXISTS idx_stripe_tx_payment_method
ON payments.stripe_transactions(payment_method_type, created_at DESC);

-- 支付时间查询索引
CREATE INDEX IF NOT EXISTS idx_stripe_tx_paid_at
ON payments.stripe_transactions(paid_at DESC)
WHERE paid_at IS NOT NULL;

-- ============================================================================
-- 触发器：自动更新 updated_at
-- ============================================================================
DROP TRIGGER IF EXISTS trg_stripe_tx_updated_at ON payments.stripe_transactions;

CREATE TRIGGER trg_stripe_tx_updated_at
BEFORE UPDATE ON payments.stripe_transactions
FOR EACH ROW
EXECUTE FUNCTION payments.set_updated_at();





-- ============================================================================
-- Stripe Webhook 事件日志表
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments.stripe_webhook_events (
    event_id                TEXT PRIMARY KEY,
    event_type              TEXT NOT NULL,
    event_data              JSONB NOT NULL,
    
    -- 处理状态
    processed               BOOLEAN NOT NULL DEFAULT FALSE,
    processed_at            TIMESTAMPTZ NULL,
    error_message           TEXT NULL,
    retry_count             INT NOT NULL DEFAULT 0,
    
    -- 关联交易
    related_transaction_id  BIGINT NULL REFERENCES payments.stripe_transactions(id),
    
    -- 审计
    received_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_processed 
ON payments.stripe_webhook_events(processed, received_at);

CREATE INDEX IF NOT EXISTS idx_stripe_webhook_event_type 
ON payments.stripe_webhook_events(event_type, received_at DESC);