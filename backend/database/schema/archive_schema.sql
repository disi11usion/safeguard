 /*
 * file: archive_schema.sql
 * description: This script creates the archive schema and tables.
 * Date: 02-08-2025
*/

-- Create archive schema
CREATE SCHEMA IF NOT EXISTS archive;

-- Create archive tables with identical structures

-- Raw data archive
CREATE TABLE IF NOT EXISTS archive.raw_prices_historic (LIKE raw_data.raw_prices_historic INCLUDING ALL);
CREATE TABLE IF NOT EXISTS archive.raw_news (LIKE raw_data.raw_news INCLUDING ALL);
CREATE TABLE IF NOT EXISTS archive.raw_social (LIKE raw_data.raw_social INCLUDING ALL);
--CREATE TABLE IF NOT EXISTS archive.crypto_transactions (LIKE raw_data.crypto_transactions INCLUDING ALL);
--CREATE TABLE IF NOT EXISTS archive.crypto_tx_senders (LIKE raw_data.crypto_tx_senders INCLUDING ALL);
--CREATE TABLE IF NOT EXISTS archive.crypto_tx_receivers (LIKE raw_data.crypto_tx_receivers INCLUDING ALL);

-- Clean data archive
CREATE TABLE IF NOT EXISTS archive.clean_prices_historic (LIKE clean_data.clean_prices_historic INCLUDING ALL);
CREATE TABLE IF NOT EXISTS archive.clean_prices_realtime (LIKE clean_data.clean_prices_realtime INCLUDING ALL);
CREATE TABLE IF NOT EXISTS archive.clean_news (LIKE clean_data.clean_news INCLUDING ALL);
CREATE TABLE IF NOT EXISTS archive.clean_social (LIKE clean_data.clean_social INCLUDING ALL);
CREATE TABLE IF NOT EXISTS archive.stock_market_data (LIKE clean_data.stock_market_data INCLUDING ALL);
CREATE TABLE IF NOT EXISTS archive.training_data_news (LIKE clean_data.training_data_news INCLUDING ALL);
-- Analytics data archive
CREATE TABLE IF NOT EXISTS archive.finbert_coin_sentiment (LIKE analytics.finbert_coin_sentiment INCLUDING ALL);
CREATE TABLE IF NOT EXISTS archive.market_level_sentiment (LIKE analytics.market_level_sentiment INCLUDING ALL);
CREATE TABLE IF NOT EXISTS archive.forecasts (LIKE analytics.forecasts INCLUDING ALL);
--CREATE TABLE IF NOT EXISTS archive.news_sentiment (LIKE analytics.news_sentiment INCLUDING ALL);
--CREATE TABLE IF NOT EXISTS archive.news_sentiment_summary (LIKE analytics.news_sentiment_summary INCLUDING ALL);
--CREATE TABLE IF NOT EXISTS archive.market_movers (LIKE analytics.market_movers INCLUDING ALL);


-- Converting archive tables into hypertables
SELECT create_hypertable('archive.raw_prices_historic', 'recorded_at', chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE);
SELECT create_hypertable('archive.raw_news', 'published_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('archive.raw_social', 'posted_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

SELECT create_hypertable('archive.clean_prices_historic', 'recorded_at', chunk_time_interval => INTERVAL '1 month', if_not_exists => TRUE);
SELECT create_hypertable('archive.clean_prices_realtime', 'recorded_at', chunk_time_interval => INTERVAL '1 hour', if_not_exists => TRUE);
SELECT create_hypertable('archive.clean_news', 'published_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('archive.clean_social', 'posted_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('archive.stock_market_data', 'time_key', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

SELECT create_hypertable('archive.finbert_coin_sentiment', 'created_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('archive.market_level_sentiment', 'created_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
SELECT create_hypertable('archive.forecasts', 'created_at', chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);

-- Enabling compression on archive tables
ALTER TABLE archive.raw_prices_historic SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'crypto_id',
    timescaledb.compress_orderby = 'recorded_at DESC, price_id'
);

ALTER TABLE archive.raw_news SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'source_id',
    timescaledb.compress_orderby = 'published_at DESC, news_id'
);

ALTER TABLE archive.raw_social SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'source_id',
    timescaledb.compress_orderby = 'posted_at DESC, post_id'
);
-- CLEAN Data
ALTER TABLE archive.clean_prices_historic SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'crypto_id',
    timescaledb.compress_orderby = 'recorded_at DESC, price_id'
);

ALTER TABLE archive.clean_prices_realtime SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'crypto_id',
    timescaledb.compress_orderby = 'recorded_at DESC, price_id'
);

ALTER TABLE archive.clean_news SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'source_id',
    timescaledb.compress_orderby = 'published_at DESC, news_id'
);

ALTER TABLE archive.clean_social SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'source_id',
    timescaledb.compress_orderby = 'posted_at DESC, post_id'
);
ALTER TABLE archive.stock_market_data SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'ticker',
    timescaledb.compress_orderby = 'time_key DESC'
);

ALTER TABLE archive.finbert_coin_sentiment SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'crypto_id',
    timescaledb.compress_orderby = 'created_at DESC, sentiment_id'
);

ALTER TABLE archive.market_level_sentiment SET (
    timescaledb.compress,
    timescaledb.compress_orderby = 'created_at DESC, sentiment_id'
);

ALTER TABLE archive.forecasts SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'crypto_id',
    timescaledb.compress_orderby = 'created_at DESC, forecast_id'
);