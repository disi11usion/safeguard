 /*
 * file: create_hypertables.sql
 * description: This script creates the hypertables on the raw and.
 * clean data tables.
 * It includes hypertables for real-time and historic prices, news,
 * social media data, and announcements.
 * Date: 26-06-2025
*/

-- Initializes the timescaledb extension
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- Raw data
SELECT create_hypertable('raw_data.raw_prices_historic', 'recorded_at', chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE);
SELECT create_hypertable('raw_data.raw_news', 'published_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('raw_data.raw_social', 'posted_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
-- Cleaned data
SELECT create_hypertable('clean_data.clean_prices_realtime', 'recorded_at', chunk_time_interval => INTERVAL '1 hour', if_not_exists => TRUE);
SELECT create_hypertable('clean_data.clean_prices_historic', 'recorded_at', chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE);
SELECT create_hypertable('clean_data.clean_news', 'published_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('clean_data.clean_social', 'posted_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('clean_data.stock_market_data', 'time_key', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

-- Analytics data
SELECT create_hypertable('analytics.finbert_coin_sentiment', 'created_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('analytics.market_level_sentiment', 'created_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('analytics.forecasts', 'created_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);