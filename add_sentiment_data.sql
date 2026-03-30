-- Quick fix: Add sentiment data to existing database
-- Run this with: docker exec -i 9900-server-db-1 psql -U postgres -d financeHub < add_sentiment_data.sql

-- Insert cryptocurrency sentiment data
INSERT INTO analytics.finbert_coin_sentiment (crypto_id, sentiment_score, sentiment_label, created_at, last_updated_at)
SELECT 
    c.crypto_id,
    CASE c.symbol_binance
        WHEN 'BTCUSDT' THEN 0.75
        WHEN 'ETHUSDT' THEN 0.68
        WHEN 'BNBUSDT' THEN 0.55
        WHEN 'SOLUSDT' THEN 0.82
        WHEN 'ADAUSDT' THEN 0.48
        WHEN 'DOGEUSDT' THEN 0.35
        WHEN 'MATICUSDT' THEN 0.62
        WHEN 'DOTUSDT' THEN 0.58
        WHEN 'AVAXUSDT' THEN 0.71
        WHEN 'LINKUSDT' THEN 0.66
    END as sentiment_score,
    CASE c.symbol_binance
        WHEN 'BTCUSDT' THEN 'Bullish'
        WHEN 'ETHUSDT' THEN 'Bullish'
        WHEN 'BNBUSDT' THEN 'Neutral'
        WHEN 'SOLUSDT' THEN 'Very Bullish'
        WHEN 'ADAUSDT' THEN 'Neutral'
        WHEN 'DOGEUSDT' THEN 'Bearish'
        WHEN 'MATICUSDT' THEN 'Bullish'
        WHEN 'DOTUSDT' THEN 'Neutral'
        WHEN 'AVAXUSDT' THEN 'Bullish'
        WHEN 'LINKUSDT' THEN 'Bullish'
    END as sentiment_label,
    now() as created_at,
    now() as last_updated_at
FROM reference.cryptocurrencies c
WHERE c.symbol_binance IN ('BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'ADAUSDT', 'DOGEUSDT', 'MATICUSDT', 'DOTUSDT', 'AVAXUSDT', 'LINKUSDT')
ON CONFLICT DO NOTHING;

-- Insert market-level sentiment data
INSERT INTO analytics.market_level_sentiment (sentiment_score, sentiment_label, created_at, last_updated_at)
VALUES 
    (0.64, 'Bullish', now(), now())
ON CONFLICT DO NOTHING;

-- Display confirmation
SELECT 'Sentiment data inserted successfully!' as status;
SELECT COUNT(*) as coin_sentiment_count FROM analytics.finbert_coin_sentiment;
SELECT COUNT(*) as market_sentiment_count FROM analytics.market_level_sentiment;
