/* file: data_ingestion.sql
 * description: This script contains procedures for inserting raw data into the database.
 * Date: 30-06-2025
*/

-- This procedure inserts historic raw prices into the database.
-- It takes a source ID, job ID, and a JSONB array of records as input.
CREATE OR REPLACE PROCEDURE raw_data.insert_historic_raw_prices(
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

            -- Insert into raw_data.raw_prices_historic table
            INSERT INTO raw_data.raw_prices_historic (
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
                payload,
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
                elem,
                _job_id,
                now(),
                now()
            );
        EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
            -- Optionally log elem or error details
            CONTINUE;
        END;
    END LOOP;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'Error in insert_historic_raw_prices procedure: %', SQLERRM;
        RAISE;
END;
$$;


-- This procedure inserts raw social posts into the database.
-- It takes a source ID, job ID, and a JSONB array of records as input.
CREATE OR REPLACE PROCEDURE raw_data.insert_raw_social(
    _source_id BIGINT,
    _job_id UUID,
    _records JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    elem JSONB;
    _comments JSONB;
BEGIN
    PERFORM set_config('timezone', 'UTC', true);

    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            _comments := NULLIF(elem->'comments', '[]'::jsonb);
            IF _comments IS NULL THEN
                _comments := '[]'::jsonb;
            END IF;

            INSERT INTO raw_data.raw_social (
                platform_id, title, content, posted_at, author,
                source_id, url, comments, payload, job_id, created_at, last_updated_at
            )
            VALUES (
                NULLIF(elem->>'platform_id',''),
                NULLIF(elem->>'title',''),
                NULLIF(elem->>'content',''),
                NULLIF(elem->>'posted_at','')::timestamptz,
                NULLIF(elem->>'author',''),
                _source_id,
                NULLIF(elem->>'url',''),
                _comments,
                elem,
                _job_id,
                now(),
                now()
            )
            ON CONFLICT (source_id, platform_id) DO UPDATE
            SET  title          = EXCLUDED.title,
                 content        = EXCLUDED.content,
                 posted_at      = EXCLUDED.posted_at,
                 author         = EXCLUDED.author,
                 url            = EXCLUDED.url,
                 comments       = EXCLUDED.comments,
                 payload        = EXCLUDED.payload,
                 job_id         = EXCLUDED.job_id,
                 last_updated_at= now();

        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
                CONTINUE;
        END;
    END LOOP;
END;
$$;



-- This procedure inserts raw news into the database.
-- It takes a source ID, job ID, and a JSONB array of records as input
CREATE OR REPLACE PROCEDURE raw_data.insert_raw_news(
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
    RAISE NOTICE 'Timezone set to UTC in insert_news procedure.';
    
    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            RAISE NOTICE 'Processing element: %', elem;
            -- Insert into raw_data.raw_news table
            INSERT INTO raw_data.raw_news (
                title,
                content,
                published_at,
                source_id,
                url,
                payload,
                coins,
                crypto_ids,
                job_id,
                created_at,
                last_updated_at
            )
            VALUES (
                NULLIF(elem->>'title', ''),
                NULLIF(elem->>'news', ''),
                NULLIF(elem->>'publishedAt', '')::timestamptz,
                _source_id,
                NULLIF(elem->>'url', ''),
                elem,
                NULLIF(elem->>'coins', ''),
                NULLIF(elem->>'crypto_id', ''),
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
        RAISE NOTICE 'Error in insert_raw_news procedure: %', SQLERRM;
        RAISE;
END;
$$;

-- Economics events
CREATE OR REPLACE PROCEDURE reference.upsert_economic_events(
    _source_id BIGINT,
    _job_id UUID,
    _records JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    elem JSONB;
    _importance event_importance;
BEGIN
    PERFORM set_config('timezone', 'UTC', true);
    RAISE NOTICE 'Timezone set to UTC in insert_economic_events procedure.';

    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            _importance := COALESCE(LOWER(NULLIF(elem->>'importance',''))::event_importance, 'medium');
            -- Insert into reference.economic_events table
            INSERT INTO reference.economic_events (
                event_id,
                title,
                country,
                currency,
                category,
                event_date,
                importance,
                previous_value,
                forecast_value,
                actual_value,
                is_high_impact,
                source_id
            )
            VALUES (
                NULLIF(elem->>'event_id', '')::BIGINT,
                NULLIF(elem->>'title', ''),
                NULLIF(elem->>'country', ''),
                COALESCE(NULLIF(elem->>'currency',''),'USD'),
                NULLIF(elem->>'category', ''),
                NULLIF(elem->>'event_date', '')::timestamptz,
                NULLIF(elem->>'importance', ''),
                NULLIF(elem->>'previous_value', ''),
                NULLIF(elem->>'forecast_value', ''),
                NULLIF(elem->>'actual_value', ''),
                COALESCE(NULLIF(elem->>'is_high_impact', '')::BOOLEAN, FALSE),
                _source_id
            ) ON CONFLICT (event_id) DO UPDATE SET
                title = EXCLUDED.title,
                country = EXCLUDED.country,
                currency = EXCLUDED.currency,
                category = EXCLUDED.category,
                event_date = EXCLUDED.event_date,
                importance = EXCLUDED.importance,
                previous_value = EXCLUDED.previous_value,
                forecast_value = EXCLUDED.forecast_value,
                actual_value = EXCLUDED.actual_value,
                is_high_impact = EXCLUDED.is_high_impact,
                last_updated_at = now();
        EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
            CONTINUE;
        END;
    END LOOP;
END;
$$;

--Stock market
CREATE OR REPLACE PROCEDURE clean_data.upsert_stock_market_data(
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
    RAISE NOTICE 'Timezone set to UTC in upsert_stock_market_data procedure.';

    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            RAISE NOTICE 'Processing element: %', elem;
            -- Insert into clean_data.stock_market_data table
            INSERT INTO clean_data.stock_market_data (
                time_key,
                ticker,
                name,
                price,
                change_percent,
                volume,
                source_id
            )
            VALUES (
                NULLIF(elem->>'time_key', '')::timestamptz,
                NULLIF(elem->>'ticker', ''),
                NULLIF(elem->>'name', ''),
                ROUND(NULLIF(elem->>'price', '')::numeric, 10),
                ROUND(NULLIF(elem->>'change_percent', '')::numeric, 10),
                ROUND(NULLIF(elem->>'volume', '')::BIGINT, 10),
                _source_id
            ) ON CONFLICT (time_key, ticker) DO UPDATE SET
                name = EXCLUDED.name,
                price = EXCLUDED.price,
                change_percent = EXCLUDED.change_percent,
                volume = EXCLUDED.volume,
                last_updated_at = now();
        EXCEPTION
        WHEN OTHERS THEN
            RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
            CONTINUE;
        END;
    END LOOP;
END;
$$;

-- crypto transactions
CREATE OR REPLACE PROCEDURE raw_data.ingest_crypto_transactions(
    _source_id BIGINT,
    _job_id UUID,
    _records JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    elem JSONB;
    s RECORD;
    r RECORD;
BEGIN
    PERFORM set_config('timezone', 'UTC', true);
    RAISE NOTICE 'Timezone set to UTC in ingest_crypto_transactions procedure.';

    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            RAISE NOTICE 'Processing element: %', elem;
            -- Insert into raw_data.crypto_transactions table
            INSERT INTO raw_data.crypto_transactions (
                hash,
                total,
                fee,
                "timestamp",
                source_id,
                job_id,
                created_at,
                last_updated_at
            )
            VALUES (
                NULLIF(elem->>'hash', ''),
                ROUND(NULLIF(elem->>'total', '')::numeric, 10),
                ROUND(NULLIF(elem->>'fee', '')::numeric, 10),
                NULLIF(elem->>'timestamp', '')::timestamptz,
                _source_id,
                _job_id,
                now(),
                now()
            ) 
            ON CONFLICT (hash) DO UPDATE SET
                total = EXCLUDED.total,
                fee = EXCLUDED.fee,
                "timestamp" = EXCLUDED."timestamp",
                last_updated_at = now();
            FOR s IN 
                SELECT value 
                FROM json_array_elements(COALESCE(elem->'senders', '[]'::jsonb))
            LOOP
                BEGIN
                    INSERT INTO raw_data.crypto_tx_senders (transaction_hash, address, output_value, source_id, created_at, last_updated_at)
                    VALUES (NULLIF(elem->>'hash', ''), s.value->>'address', ROUND(NULLIF(s.value->>'output_value', '')::numeric, 10), _source_id,now(), now())
                    ON CONFLICT DO NOTHING;
                EXCEPTION
                WHEN OTHERS THEN
                    RAISE NOTICE 'Sender now skipped: %', SQLERRM;
                    CONTINUE;
                END;
            END LOOP;
            FOR r IN 
                SELECT value 
                FROM json_array_elements(COALESCE(elem->'receivers', '[]'::jsonb))
            LOOP
                BEGIN
                    INSERT INTO raw_data.crypto_tx_receivers (transaction_hash, address, value, source_id, created_at, last_updated_at)
                    VALUES (NULLIF(elem->>'hash', ''), r.value->>'address', ROUND(NULLIF(r.value->>'value', '')::numeric, 10), _source_id, now(), now())
                    ON CONFLICT DO NOTHING;
                EXCEPTION
                WHEN OTHERS THEN
                    RAISE NOTICE 'Receiver now skipped: %', SQLERRM;
                    CONTINUE;
                END;
            END LOOP;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
                CONTINUE;
        END;
    END LOOP;
END;
$$;

-- news sentiment
CREATE OR REPLACE PROCEDURE analytics.upsert_news_sentiment(
    _source_id BIGINT,
    _job_id UUID,
    _records JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    elem JSONB;
    _authors JSONB;
    _topics JSONB;
    _ticker JSONB;
    _label sentiment_label;
BEGIN
    PERFORM set_config('timezone', 'UTC', true);
    RAISE NOTICE 'Timezone set to UTC in upsert_news_sentiment procedure.';

    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            _authors := COALESCE(
                CASE WHEN NULLIF(elem->>'authors','') IS NULL THEN NULL ELSE (elem->>'authors')::jsonb END,
                '[]'::jsonb
            );
            _topics := COALESCE(
                CASE WHEN NULLIF(elem->>'topics','') IS NULL THEN NULL ELSE (elem->>'topics')::jsonb END,
                '[]'::jsonb
            );
            _ticker := COALESCE(
                CASE WHEN NULLIF(elem->>'ticker_sentiment','') IS NULL THEN NULL ELSE(elem->>'ticker_sentiment')::jsonb END,
                '{}'::jsonb
            );
            _label := NULLIF(elem->>'overall_sentiment_label','')::sentiment_label;

            RAISE NOTICE 'Processing element: %', elem;
            -- Insert into clean_data.news_sentiment table
            INSERT INTO analytics.news_sentiment (
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
                ticker_sentiment,
                source_id,
                job_id,
                created_at,
                last_updated_at
            )
            VALUES (
                NULLIF(elem->>'news_id', '')::BIGINT,
                NULLIF(elem->>'title', ''),
                NULLIF(elem->>'summary', ''),
                NULLIF(elem->>'source', ''),
                _authors,
                ROUND(NULLIF(elem->>'overall_sentiment_score', '')::numeric, 10),
                _label,
                NULLIF(elem->>'url', ''),
                NULLIF(elem->>'banner_image_url', ''),
                NULLIF(elem->>'time_published', '')::timestamptz,
                _topics,
                _ticker,
                _source_id,
                _job_id,
                now(),
                now()
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
                ticker_sentiment = EXCLUDED.ticker_sentiment,
                last_updated_at = now();
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
            CONTINUE;
        END;
    END LOOP;
END;
$$;

-- sentiment summary
CREATE OR REPLACE PROCEDURE analytics.upsert_sentiment_summary(
    _source_id BIGINT,
    _job_id UUID,
    _records JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
    elem JSONB;
    _dominant sentiment_label;
    _top JSONB;
    _sector JSONB;
BEGIN
    PERFORM set_config('timezone', 'UTC', true);
    RAISE NOTICE 'Timezone set to UTC in upsert_sentiment_summary procedure.';

    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            _dominant := NULLIF(elem->>'dominant_sentiment','')::sentiment_label;
            _top := COALESCE(CASE WHEN NULLIF(elem->>'top_tickers','') IS NULL THEN NULL ELSE(elem->>'top_tickers')::jsonb END, '[]'::jsonb);
            _sector := COALESCE(CASE WHEN NULLIF(elem->>'market_sector','') IS NULL THEN NULL ELSE(elem->>'market_sector')::jsonb END, '[]'::jsonb);
            RAISE NOTICE 'Processing element: %', elem;
            
            INSERT INTO analytics.news_sentiment_summary (
                summary_date,
                period_type,
                total_news_count,
                bullish_count,
                somewhat_bullish_count,
                neutral_count,
                somewhat_bearish_count,
                bearish_count,
                average_sentiment_score,
                dominant_sentiment,
                top_tickers,
                market_sectors,
                source_id,
                created_at,
                last_updated_at
            )
            VALUES (
                NULLIF(elem->>'summary_date', '')::date,
                COALESCE(NULLIF(elem->>'period_type', ''),'daily')::period_type,
                NULLIF(elem->>'total_news_count', '')::INT,
                NULLIF(elem->>'bullish_count', '')::INT,
                NULLIF(elem->>'somewhat_bullish_count', '')::INT,
                NULLIF(elem->>'neutral_count', '')::INT,
                NULLIF(elem->>'somewhat_bearish_count', '')::INT,
                NULLIF(elem->>'bearish_count', '')::INT,
                ROUND(NULLIF(elem->>'average_sentiment_score', '')::numeric, 10),
                _dominant,
                _top,
                _sector,
                _source_id,
                now(),
                now()
            ) ON CONFLICT (summary_date, period_type) DO UPDATE SET
                total_news_count = EXCLUDED.total_news_count,
                bullish_count = EXCLUDED.bullish_count,
                somewhat_bullish_count = EXCLUDED.somewhat_bullish_count,
                neutral_count = EXCLUDED.neutral_count,
                somewhat_bearish_count = EXCLUDED.somewhat_bearish_count,
                bearish_count = EXCLUDED.bearish_count,
                average_sentiment_score = EXCLUDED.average_sentiment_score,
                dominant_sentiment = EXCLUDED.dominant_sentiment,
                top_tickers = EXCLUDED.top_tickers,
                market_sector = EXCLUDED.market_sector,
                last_updated_at = now();
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
            CONTINUE;
        END;
    END LOOP;
END;
$$;

-- market movers
CREATE OR REPLACE PROCEDURE analytics.upsert_market_movers(
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
    RAISE NOTICE 'Timezone set to UTC in upsert_market_movers procedure.';
    FOR elem IN SELECT * FROM jsonb_array_elements(_records)
    LOOP
        BEGIN
            RAISE NOTICE 'Processing element: %', elem;
            
            INSERT INTO analytics.market_movers (
                ticker,
                name,
                price,
                change_percent,
                volume,
                market_cap,
                sector,
                industry,
                mover_type,
                reason,
                news_count,
                sentiment_score,
                ranking,
                data_date,
                source_id,
                created_id,
                last_updated_at
            )
            VALUES (
                NULLIF(elem->>'ticker', ''),
                NULLIF(elem->>'name', ''),
                ROUND(NULLIF(elem->>'price', '')::numeric, 10),
                ROUND(NULLIF(elem->>'change_percent', '')::numeric, 10),
                ROUND(NULLIF(elem->>'volume', '')::BIGINT, 10),
                ROUND(NULLIF(elem->>'market_cap', '')::BIGINT, 10),
                NULLIF(elem->>'sector', ''),
                NULLIF(elem->>'industry', ''),
                NULLIF(elem->>'mover_type', ''),
                NULLIF(elem->>'reason', ''),
                NULLIF(elem->>'news_count', '')::INT,
                ROUND(NULLIF(elem->>'sentiment_score', '')::numeric, 10),
                NULLIF(elem->>'ranking', '')::INT,
                NULLIF(elem->>'data_date', '')::date,
                _source_id,
                now(),
                now()
            ) ON CONFLICT DO NOTHING;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Skipping row due to error: %', SQLERRM;
            CONTINUE;
        END;
    END LOOP;
END;
$$;