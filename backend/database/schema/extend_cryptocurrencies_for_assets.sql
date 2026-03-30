-- =====================================================
-- Migration Script: Extend cryptocurrencies table to support all asset types
-- Description: Add category column and insert stocks, forex, futures data
--              Maintain backward compatibility with existing crypto data
-- Date: 2025-11-10
-- =====================================================

-- Step 1: Add category column to existing cryptocurrencies table
-- Default to 'crypto' for all existing records
ALTER TABLE reference.cryptocurrencies 
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'crypto' 
CHECK (category IN ('crypto', 'stock', 'forex', 'futures'));

-- Step 2: Add comment for documentation
COMMENT ON COLUMN reference.cryptocurrencies.category IS 'Asset category: crypto (default), stock, forex, or futures';

-- Step 3: Update existing records to ensure they have 'crypto' category
UPDATE reference.cryptocurrencies 
SET category = 'crypto' 
WHERE category IS NULL;

-- Step 4: Create index for category-based queries
CREATE INDEX IF NOT EXISTS idx_cryptocurrencies_category ON reference.cryptocurrencies(category);

-- Step 5: Insert US Stocks data (all active by default)
-- Using symbol_binance for ticker and name for full name
INSERT INTO reference.cryptocurrencies (symbol_binance, symbol_coingecko, name, category, is_active) VALUES
    ('AAPL', 'AAPL', 'Apple Inc.', 'stock', TRUE),
    ('MSFT', 'MSFT', 'Microsoft Corporation', 'stock', TRUE),
    ('GOOGL', 'GOOGL', 'Alphabet Inc. (Google)', 'stock', TRUE),
    ('AMZN', 'AMZN', 'Amazon.com Inc.', 'stock', TRUE),
    ('NVDA', 'NVDA', 'NVIDIA Corporation', 'stock', TRUE),
    ('META', 'META', 'Meta Platforms Inc. (Facebook)', 'stock', TRUE),
    ('TSLA', 'TSLA', 'Tesla Inc.', 'stock', TRUE),
    ('BRK.B', 'BRK.B', 'Berkshire Hathaway Inc.', 'stock', TRUE),
    ('V', 'V', 'Visa Inc.', 'stock', TRUE),
    ('JPM', 'JPM', 'JPMorgan Chase & Co.', 'stock', TRUE),
    ('JNJ', 'JNJ', 'Johnson & Johnson', 'stock', TRUE),
    ('WMT', 'WMT', 'Walmart Inc.', 'stock', TRUE),
    ('PG', 'PG', 'Procter & Gamble Co.', 'stock', TRUE),
    ('UNH', 'UNH', 'UnitedHealth Group Inc.', 'stock', TRUE),
    ('MA', 'MA', 'Mastercard Inc.', 'stock', TRUE)
ON CONFLICT (symbol_binance) DO NOTHING;

-- Step 6: Insert Forex Pairs data
INSERT INTO reference.cryptocurrencies (symbol_binance, symbol_coingecko, name, category, is_active) VALUES
    ('EUR/USD', 'EURUSD', 'Euro / U.S. Dollar', 'forex', TRUE),
    ('USD/JPY', 'USDJPY', 'U.S. Dollar / Japanese Yen', 'forex', TRUE),
    ('GBP/USD', 'GBPUSD', 'British Pound / U.S. Dollar', 'forex', TRUE),
    ('USD/CHF', 'USDCHF', 'U.S. Dollar / Swiss Franc', 'forex', TRUE),
    ('AUD/USD', 'AUDUSD', 'Australian Dollar / U.S. Dollar', 'forex', TRUE),
    ('USD/CAD', 'USDCAD', 'U.S. Dollar / Canadian Dollar', 'forex', TRUE),
    ('NZD/USD', 'NZDUSD', 'New Zealand Dollar / U.S. Dollar', 'forex', TRUE),
    ('EUR/GBP', 'EURGBP', 'Euro / British Pound', 'forex', TRUE),
    ('EUR/JPY', 'EURJPY', 'Euro / Japanese Yen', 'forex', TRUE),
    ('GBP/JPY', 'GBPJPY', 'British Pound / Japanese Yen', 'forex', TRUE),
    ('EUR/CHF', 'EURCHF', 'Euro / Swiss Franc', 'forex', TRUE),
    ('AUD/JPY', 'AUDJPY', 'Australian Dollar / Japanese Yen', 'forex', TRUE),
    ('CAD/JPY', 'CADJPY', 'Canadian Dollar / Japanese Yen', 'forex', TRUE),
    ('EUR/AUD', 'EURAUD', 'Euro / Australian Dollar', 'forex', TRUE),
    ('GBP/CHF', 'GBPCHF', 'British Pound / Swiss Franc', 'forex', TRUE)
ON CONFLICT (symbol_binance) DO NOTHING;

-- Step 7: Insert Metal Futures data
INSERT INTO reference.cryptocurrencies (symbol_binance, symbol_coingecko, name, category, is_active) VALUES
    ('XAU/USD', 'XAUUSD', 'Gold Futures', 'futures', TRUE)
ON CONFLICT (symbol_binance) DO NOTHING;

-- Step 8: Ensure all non-crypto assets are active
UPDATE reference.cryptocurrencies
SET is_active = TRUE, last_updated_at = NOW()
WHERE category IN ('stock', 'forex', 'futures')
AND is_active = FALSE;

-- Step 9: Verify the insertion (active assets only)
DO $$
DECLARE
    crypto_count INTEGER;
    stock_count INTEGER;
    forex_count INTEGER;
    futures_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO crypto_count FROM reference.cryptocurrencies WHERE category = 'crypto' AND is_active = TRUE;
    SELECT COUNT(*) INTO stock_count FROM reference.cryptocurrencies WHERE category = 'stock' AND is_active = TRUE;
    SELECT COUNT(*) INTO forex_count FROM reference.cryptocurrencies WHERE category = 'forex' AND is_active = TRUE;
    SELECT COUNT(*) INTO futures_count FROM reference.cryptocurrencies WHERE category = 'futures' AND is_active = TRUE;
    
    RAISE NOTICE 'Active asset counts - Crypto: %, Stock: %, Forex: %, Futures: %', 
        crypto_count, stock_count, forex_count, futures_count;
END $$;

-- =====================================================
-- End of Migration Script
-- =====================================================
