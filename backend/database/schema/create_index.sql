/*
 * file: create_index.sql
 * description: This script creates the indexes on the tables 
 * for faster access.
 * It includes indexes for user authentication, metadata management,
 * raw data storage, and clean data processing.
 * Date: 26-06-2025
*/

CREATE INDEX IF NOT EXISTS idx_users_ ON auth.users (user_id);
CREATE INDEX IF NOT EXISTS idx_sources_ ON metadata.data_sources (source_id);
CREATE INDEX IF NOT EXISTS idx_cryptocurrencies ON reference.cryptocurrencies (crypto_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_composite ON metadata.ingestion_job_log (job_id, source_id);
CREATE INDEX IF NOT EXISTS idx_user_results_composite ON auth.user_questionnaire_results (user_result_id, user_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_user_profile_composite ON auth.user_risk_profiles (user_profile_id, user_id);
CREATE INDEX IF NOT EXISTS idx_user_coin_composite ON auth.user_coin_preferences (user_preference_id, user_id);
-- CREATE INDEX IF NOT EXISTS idx_login_verification_user ON auth.login_verification_codes(user_id);
-- CREATE INDEX IF NOT EXISTS idx_login_verification_exp ON auth.login_verification_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_raw_prices_historic_composite ON raw_data.raw_prices_historic (crypto_id, source_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_news_pub ON raw_data.raw_news (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_social_posted ON raw_data.raw_social (posted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_raw_social_source_platform ON raw_data.raw_social (source_id, platform_id,posted_at);

CREATE INDEX IF NOT EXISTS idx_clean_prices_realtime_composite ON clean_data.clean_prices_realtime (crypto_id, source_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_clean_prices_historic_composite ON clean_data.clean_prices_historic (crypto_id, source_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_clean_news_pub ON clean_data.clean_news (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_clean_social_posted ON clean_data.clean_social (posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_finbert_coin_sentiment_composite ON analytics.finbert_coin_sentiment (crypto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_level_sentiment_created_at ON analytics.market_level_sentiment (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forecasts_composite ON analytics.forecasts (profile_id, crypto_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_economic_events_date ON reference.economic_events (event_date);
CREATE INDEX IF NOT EXISTS idx_economic_events_country ON reference.economic_events (country);
CREATE INDEX IF NOT EXISTS idx_economic_events_importance ON reference.economic_events (importance);
CREATE INDEX IF NOT EXISTS idx_economic_events_high_impact ON reference.economic_events (is_high_impact);
CREATE INDEX IF NOT EXISTS idx_stock_market_ticker_time ON clean_data.stock_market_data (ticker, time_key);
CREATE INDEX IF NOT EXISTS idx_stock_market_time ON clean_data.stock_market_data (time_key);
CREATE INDEX IF NOT EXISTS idx_crypto_transactions_timestamp ON raw_data.crypto_transactions (timestamp);
CREATE INDEX IF NOT EXISTS idx_crypto_senders_hash ON raw_data.crypto_tx_senders (transaction_hash);
CREATE INDEX IF NOT EXISTS idx_crypto_receivers_hash ON raw_data.crypto_tx_receivers (transaction_hash);
CREATE INDEX IF NOT EXISTS idx_crypto_senders_address ON raw_data.crypto_tx_senders (address);
CREATE INDEX IF NOT EXISTS idx_crypto_receivers_address ON raw_data.crypto_tx_receivers (address);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_time_published ON analytics.news_sentiment (time_published);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_label ON analytics.news_sentiment (overall_sentiment_label);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_source ON analytics.news_sentiment (source);
CREATE INDEX IF NOT EXISTS idx_news_sentiment_created_at ON analytics.news_sentiment (created_at);
CREATE INDEX IF NOT EXISTS idx_sentiment_summary_date ON analytics.news_sentiment_summary (summary_date);
CREATE INDEX IF NOT EXISTS idx_sentiment_summary_period_type ON analytics.news_sentiment_summary (period_type);
CREATE INDEX IF NOT EXISTS idx_market_movers_ticker_date ON analytics.market_movers (ticker, data_date);
CREATE INDEX IF NOT EXISTS idx_market_movers_type ON analytics.market_movers (mover_type);
CREATE INDEX IF NOT EXISTS idx_market_movers_date ON analytics.market_movers (data_date);
CREATE INDEX IF NOT EXISTS idx_market_movers_sector ON analytics.market_movers (sector);
CREATE INDEX IF NOT EXISTS idx_market_movers_ranking ON analytics.market_movers (ranking);
