/* file: data_processing.sql
 * description: This script contains procedures for inserting clean data into the database.
 * Date: 01-07-2025
*/

-- This procedure inserts historic cleaned prices into the database.
-- It takes a JSONB array of records as input.
CREATE OR REPLACE PROCEDURE clean_data.insert_historic_clean_prices(
    _records JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    elem JSONB;
    _crypto_id INT;
BEGIN

    PERFORM set_config('timezone', 'UTC', true);

    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            RAISE NOTICE 'Processing element: %', elem;

            -- Insert into clean_data.clean_prices_historic table
            INSERT INTO clean_data.clean_prices_historic (
                crypto_id,
                recorded_at,
                price,
                price_open,
                price_high,
                price_low,
                volume,
                quote_asset_volume,
                price_change,
                percentage_change,
                percentage_change_7d,
                market_cap,
                sma_20,
                sma_50,
                rsi,
                volume_color,
                source_id,
                raw_price_id,
                created_at,
                last_updated_at
            )
            VALUES (
                (elem->>'crypto_id')::int,
                NULLIF(elem->>'recorded_at', '')::timestamptz,
                ROUND(NULLIF(elem->>'price', '')::numeric, 10),
                ROUND(NULLIF(elem->>'price_open', '')::numeric, 10),
                ROUND(NULLIF(elem->>'price_high', '')::numeric, 10),
                ROUND(NULLIF(elem->>'price_low', '')::numeric, 10),
                ROUND(NULLIF(elem->>'volume', '')::numeric, 10),
                ROUND(NULLIF(elem->>'quote_asset_volume', '')::numeric, 10),
                ROUND(NULLIF(elem->>'price_change', '')::numeric, 10),
                ROUND(NULLIF(elem->>'percentage_change', '')::numeric, 10),
                ROUND(NULLIF(elem->>'price_change_percent_7d', '')::numeric, 10),
                ROUND(NULLIF(elem->>'market_cap', '')::numeric, 10),
                ROUND(NULLIF(elem->>'SMA20', '')::numeric, 10),
                ROUND(NULLIF(elem->>'SMA50', '')::numeric, 10),
                ROUND(NULLIF(elem->>'RSI_14', '')::numeric, 10),
                elem->>'volume_color',
                (elem->>'source_id')::bigint,
                (elem->>'price_id')::bigint,
                now(),
                now()
            );
        EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
            CONTINUE;
        END;
    END LOOP;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in insert_historic_clean_prices procedure: %', SQLERRM;
        RAISE;
END;
$$;

-- This procedure inserts real-time cleaned prices into the database.
-- It takes a source ID, job ID, and a JSONB array of records as input.
CREATE OR REPLACE PROCEDURE clean_data.insert_realtime_clean_prices(
    _source_id BIGINT,
    _job_id UUID,
    _records JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    elem JSONB;
    _crypto_id INT;
BEGIN
    PERFORM set_config('timezone', 'UTC', true);
    
    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            RAISE NOTICE 'Processing element: %', elem;
            SELECT crypto_id INTO _crypto_id
            FROM reference.cryptocurrencies
            WHERE LOWER(symbol_binance) = LOWER(elem->>'symbol')
            OR LOWER(symbol_coingecko) = LOWER(elem->>'symbol');

            IF _crypto_id IS NULL THEN
                RAISE NOTICE 'Skipping row. Could not resolve crypto or exchange: %', elem;
                CONTINUE;
            END IF;

            -- Insert into clean_data.clean_prices_realtime table
            INSERT INTO clean_data.clean_prices_realtime (
                crypto_id,
                recorded_at,
                price,
                price_open,
                price_high,
                price_low,
                volume,
                quote_asset_volume,
                price_change,
                percentage_change,
                market_cap,
                source_id,
                job_id,
                created_at,
                last_updated_at
            )
            VALUES (
                _crypto_id,
                NULLIF(elem->>'recorded_at', '')::timestamptz,
                ROUND(NULLIF(elem->>'price', '')::numeric, 10),
                ROUND(NULLIF(elem->>'price_open', '')::numeric, 10),
                ROUND(NULLIF(elem->>'price_high', '')::numeric, 10),
                ROUND(NULLIF(elem->>'price_low', '')::numeric, 10),
                ROUND(NULLIF(elem->>'volume', '')::numeric, 10),
                ROUND(NULLIF(elem->>'quote_asset_volume', '')::numeric, 10),
                ROUND(NULLIF(elem->>'price_change', '')::numeric, 10),
                ROUND(NULLIF(elem->>'percentage_change', '')::numeric, 10),
                ROUND(NULLIF(elem->>'market_cap', '')::numeric, 10),
                _source_id,
                _job_id,
                now(),
                now()
            );
        EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
            CONTINUE;
        END;
    END LOOP;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in insert_realtime_clean_prices procedure: %', SQLERRM;
        RAISE;
END;
$$;


-- This procedure inserts cleaned social posts into the database.
-- It takes a source ID, job ID, and a JSONB array of records as input.
CREATE OR REPLACE PROCEDURE clean_data.insert_clean_social(
    _source_id BIGINT,
    _job_id UUID,
    _records JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    elem JSONB;
    comments JSONB;
BEGIN
    PERFORM set_config('timezone', 'UTC', true);
    
    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            RAISE NOTICE 'Processing element: %', elem;
            -- Extracting comments if available
            comments := NULLIF(elem->'comments', '[]'::jsonb);
            IF comments IS NULL THEN
                comments := '[]'::jsonb;
            END IF;
            -- Insert into clean_data.clean_social table
            INSERT INTO clean_data.clean_social (
                platform_id,
                title,
                content,
                posted_at,
                author,
                source_id,
                url,
                comments,
                raw_post_id,
                job_id,
                created_at,
                last_updated_at
            )
            VALUES (
                NULLIF(elem->>'platform_id', ''),
                NULLIF(elem->>'title', ''),
                NULLIF(elem->>'content', ''),
                NULLIF(elem->>'posted_at', '')::timestamptz,
                NULLIF(elem->>'author', ''),
                _source_id,
                NULLIF(elem->>'url', ''),
                comments,
                (elem->>'post_id')::bigint,
                _job_id,
                now(),
                now()
            );
        EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
            CONTINUE;
        END;
        
    END LOOP;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in insert_clean_social procedure: %', SQLERRM;
        RAISE;
END;
$$;


-- This procedure inserts cleaned news into the database.
-- It takes a source ID, job ID and a JSONB array of records as input
CREATE OR REPLACE PROCEDURE clean_data.insert_clean_news(
    _source_id BIGINT,
    _job_id UUID,
    _records JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    elem JSONB;
    crypto_id BIGINT;

BEGIN
    PERFORM set_config('timezone', 'UTC', true);
    RAISE NOTICE 'Timezone set to UTC in insert_news procedure.';
    
    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            RAISE NOTICE 'Processing element: %', elem;

            -- Insert into clean_data.clean_news table
            INSERT INTO clean_data.clean_news (
                title,
                news_content,
                published_at,
                source_id,
                url,
                raw_news_id,
                coins,
                crypto_ids,
                job_id,
                created_at,
                last_updated_at
            )
            VALUES (
                NULLIF(elem->>'title', ''),
                NULLIF(elem->>'news', ''),
                NULLIF(elem->>'published_at', '')::timestamptz,
                _source_id,
                NULLIF(elem->>'url', ''),
                (elem->>'news_id')::bigint,
                NULLIF(elem->>'coins', ''),
                NULLIF(elem->>'crypto_ids', ''),
                _job_id,
                now(),
                now()
            );
        EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
            CONTINUE;
        END;
    END LOOP;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in insert_clean_news procedure: %', SQLERRM;
        RAISE;
END;
$$;

-- stock market data
CREATE OR REPLACE PROCEDURE clean_data.process_stock_data(
    _source_id BIGINT,
    _job_id UUID,
    _records JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    elem JSONB;
BEGIN
    PERFORM set_config('timezone', 'UTC', true);
    RAISE NOTICE 'Timezone set to UTC in process_stock_data procedure.';

    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            RAISE NOTICE 'Processing element: %', elem;

            -- Insert into clean_data.stock_market table
            INSERT INTO clean_data.stock_market (
                time_key,
                ticker, 
                name,
                price,
                change_percent,
                volume
            )
            VALUES (
                NULLIF(elem->>'time_key', '')::timestamptz,
                NULLIF(elem->>'ticker', ''),
                NULLIF(elem->>'name', ''),
                NULLIF(elem->>'price', '')::numeric,
                NULLIF(elem->>'change_percent', '')::numeric,
                NULLIF(elem->>'volume', '')::BIGINT
            ) ON CONFLICT (time_key, ticker) DO UPDATE SET
                name = EXCLUDED.name,
                price = EXCLUDED.price,
                change_percent = EXCLUDED.change_percent,
                volume = EXCLUDED.volume;
        EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
            CONTINUE;
        END;
    END LOOP;
END;
$$;

-- news sentiment
CREATE OR REPLACE PROCEDURE clean_data.process_news_sentiment(
    _source_id BIGINT,
    _job_id UUID,
    _records JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    elem JSONB;
BEGIN
    PERFORM set_config('timezone', 'UTC', true);
    RAISE NOTICE 'Timezone set to UTC in process_news_sentiment procedure.';

    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            RAISE NOTICE 'Processing element: %', elem;

            -- Insert into clean_data.news_sentiment table
            INSERT INTO clean_data.news_sentiment (
                news_id,
                title,
                summary,
                source,
                authors,
                overall_sentiment_score,
                overall_sentiment_label,
                url,
                banner_image_url,
                time_published,
                topics,
                ticker_sentiment
            )
            VALUES (
                NULLIF(elem->>'news_id', '')::bigint,
                NULLIF(elem->>'title', ''),
                NULLIF(elem->>'summary', ''),
                NULLIF(elem->>'source', ''),
                NULLIF(elem->>'authors', '[]')::jsonb,
                NULLIF(elem->>'overall_sentiment_score', '')::numeric,
                NULLIF(elem->>'overall_sentiment_label', ''),
                NULLIF(elem->>'url', ''),
                NULLIF(elem->>'banner_image_url', ''),
                NULLIF(elem->>'time_published', '')::timestamptz,
                NULLIF(elem->>'topics', '[]')::jsonb,
                NULLIF(elem->>'ticker_sentiment', '[]')::jsonb
            ) ON CONFLICT (news_id) DO UPDATE SET
                title = EXCLUDED.title,
                summary = EXCLUDED.summary,
                source = EXCLUDED.source,
                authors = EXCLUDED.authors,
                overall_sentiment_score = EXCLUDED.overall_sentiment_score,
                overall_sentiment_label = EXCLUDED.overall_sentiment_label,
                url = EXCLUDED.url,
                banner_image_url = EXCLUDED.banner_image_url,
                time_published = EXCLUDED.time_published,
                topics = EXCLUDED.topics,
                ticker_sentiment = EXCLUDED.ticker_sentiment;
        EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
            CONTINUE;
        END;
    END LOOP;
END;
$$;