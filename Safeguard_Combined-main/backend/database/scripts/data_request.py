"""
# file: data_request.py
# description: This script provides functions to retrieve cryptocurrency market, news, 
# and social data. It includes utilities for fetching raw and cleaned data, 
# current and historical prices, news, social posts, sentiment, and forecasts.
# Date: 01-07-2025
"""

import os
from time import timezone
import psycopg2
from dotenv import load_dotenv
import pandas as pd
from datetime import datetime, timedelta
import calendar

# Load environment variables from .env file
load_dotenv()

def _get_conn():
    return psycopg2.connect(os.getenv("DATABASE_URL"))

def _df_from_cursor(cursor):
    rows = cursor.fetchall()
    if not rows:
        return None
    cols = [d[0] for d in cursor.description] if cursor.description else []
    return pd.DataFrame(rows, columns=cols)

# This function returns cryptocurrency data for both Binance and Coingecko
def get_crypto_data(exchange_name="binance"):
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        # Fetch the all crypto details by market cap
        print("Fetching all crypto details...")
        cursor.execute("""
            SELECT 
                name,
                symbol_binance,
                symbol_coingecko,
                rank,
                crypto_id
            FROM reference.cryptocurrencies
            WHERE is_active = TRUE
            ORDER BY rank
        """)
        
        cryptos = cursor.fetchall()
        
        if not cryptos:
            print("No active cryptos found.")
            return {"success": False, "message": "No active cryptos found."}
        
        # Convert the list of tuples to JSON format
        print("Converting cryptos data to dictionary format...")
        top_cryptos = [
            {
            "name": crypto[0],
            "symbol": crypto[1] if exchange_name == "binance" else crypto[2],
            "rank": crypto[3],
            "crypto_id": crypto[4]
            }
            for crypto in cryptos
        ]
        
        return {"success": True, "data": top_cryptos}

    except Exception as e:
        print(f"Error fetching top 50 cryptos: {e}")
        return {"success": False, "message": str(e)}
    
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# This function returns the raw prices for the last 50 days for all cryptos
def get_raw_prices():
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        cursor.execute("""
            SELECT
                DISTINCT
                ijl.job_id,
                ijl.source_id,
                rph.crypto_id,
                MIN(rph.recorded_at) as min_recorded_at
            FROM 
                metadata.ingestion_job_log ijl,
                metadata.data_sources ds,
                raw_data.raw_prices_historic rph
            WHERE ijl.status = 'staged'
            AND ijl.source_id = ds.source_id
            AND ds.name in ('Binance', 'CoinGecko')
            AND rph.source_id = ds.source_id
            AND rph.job_id = ijl.job_id
            GROUP BY ijl.job_id, ijl.source_id, rph.crypto_id
        """,)
        
        ingestion_jobs = cursor.fetchall()
        if not ingestion_jobs:
            print("Nothing to ingest")
            return None

        
        raw_prices_df = pd.DataFrame()

        for job in ingestion_jobs:
            cursor.execute("""
                SELECT 
                    price_id,
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
                    job_id
                FROM raw_data.raw_prices_historic
                WHERE 
                    recorded_at >= %s - INTERVAL '50 days'
                    AND crypto_id = %s
            """, (job[3], job[2]))
        
            raw_prices = cursor.fetchall()
            if not raw_prices:
                print(f"No raw prices found for job_id: {job[0]}")
                continue
                
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            raw_prices_df = pd.concat([raw_prices_df, pd.DataFrame(raw_prices, columns=columns)])
        
        # Remove duplicate rows based on all columns
        raw_prices_df = raw_prices_df.drop_duplicates()
        return raw_prices_df

    except Exception as e:
        print(f"Error fetching raw prices: {e}")
        return None
    
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# This function returns the raw social posts for the given job_id
def get_raw_social(job_id, source_id):
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        # Fetch raw social posts for the given job_id
        print(f"Fetching raw social posts for job_id: {job_id}...")
        cursor.execute("""
            SELECT 
                post_id,
                platform_id,
                title,
                content,
                posted_at,
                author,
                url,
                comments,
                source_id,
                job_id
            FROM raw_data.raw_social
            WHERE source_id = %s
            AND job_id = %s
        """, (source_id, job_id,))
        
        raw_social = cursor.fetchall()
        
        if not raw_social:
            print(f"No raw social posts found for job_id: {job_id}")
            return None
        
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        raw_social_df = pd.DataFrame(raw_social, columns=columns)
        
        return raw_social_df

    except Exception as e:
        print(f"Error fetching raw social posts: {e}")
        return None
    
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# This function returns the raw news for the given job_id
def get_raw_news(job_id, source_id):
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        # Fetch raw news for the given job_id
        print(f"Fetching raw news for job_id: {job_id}...")
        cursor.execute("""
            SELECT 
                news_id,
                title,
                content,
                published_at,
                url,
                coins,
                crypto_ids,
                source_id,
                job_id
            FROM raw_data.raw_news
            WHERE source_id = %s
            AND job_id = %s
        """, (source_id, job_id,))
        
        raw_news = cursor.fetchall()
        
        if not raw_news:
            print(f"No raw news found for job_id: {job_id}")
            return None
        
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        raw_news_df = pd.DataFrame(raw_news, columns=columns)
        
        return raw_news_df

    except Exception as e:
        print(f"Error fetching raw news: {e}")
        return None
    
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# This function returns the current prices for the given exchange
def get_curr_prices(exchange="Binance"):
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        # Helper functions
        def get_label_from_days_ago(days_ago):
            return "Today" if days_ago == 0 else f"{days_ago}d ago"

        def get_month_label(month):
            return calendar.month_abbr[month]

        now = datetime.now()
        today = now.date()
        results = []
        
        # SQL query to get the current prices for the given exchange
        cursor.execute("""
            WITH latest_prices AS (
                SELECT DISTINCT ON (crypto_id, source_id)
                    crypto_id,
                    source_id,
                    price,
                    market_cap,
                    recorded_at
                FROM clean_data.clean_prices_realtime
                ORDER BY crypto_id, source_id, recorded_at DESC
            )
            SELECT
                cr.symbol_binance AS symbol,
                cr.name,
                cr.rank,
                lp.price AS current_price,
                COALESCE(lp.market_cap, 0) AS market_cap,
                lp.crypto_id,
                lp.source_id,
                lp.recorded_at
            FROM latest_prices lp
            JOIN reference.cryptocurrencies cr ON cr.crypto_id = lp.crypto_id
            JOIN metadata.data_sources ds ON ds.source_id = lp.source_id
            WHERE 
                ds.name = %s
                AND cr.is_active = TRUE
            ORDER BY cr.rank ASC
            LIMIT 50
        """, (exchange,))

        rows = cursor.fetchall()

        if not rows:
            print("No current prices found.")
            return None

        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        current_prices_df = pd.DataFrame(rows, columns=columns)
        
        # Iterate through the current prices dataframe
        for _, row in current_prices_df.iterrows():
            coin_data = {
                "symbol": row['symbol'][:-4],
                "name": row['name'],
                "rank": row['rank'],
                "current_price": float(row['current_price']),
                "market_cap": float(row['market_cap']),
                "price_history": {
                    "7d": [],
                    "14d": [],
                    "30d": [],
                    "6m": [],
                    "1y": []
                },
                "indicators": {
                    "sma_20": None,
                    "sma_50": None,
                    "rsi": None,
                    "volume_color": None,
                    "price_change_24h": None,
                    "price_change_7d": None,
                }
            }

            # SQL query to get the price history for the given crypto_id
            cursor.execute("""
                SELECT
                    recorded_at,
                    price,
                    volume,
                    volume_color,
                    percentage_change,
                    percentage_change_7d,
                    sma_20,
                    sma_50,
                    rsi
                FROM clean_data.clean_prices_historic
                WHERE crypto_id = %s
                AND recorded_at >= %s - INTERVAL '50 days'
                ORDER BY recorded_at ASC
            """, (row['crypto_id'], row['recorded_at'],))

            price_history = cursor.fetchall()
            if not price_history:
                print(f"No price history found for crypto_id: {row['crypto_id']}")
                continue
            
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            price_history_df = pd.DataFrame(price_history, columns=columns)
            
            price_history_df.sort_values(by="recorded_at", inplace=True)
            price_history_df["date"] = price_history_df["recorded_at"].dt.date

            latest_row = price_history_df[price_history_df["date"] == today].tail(1)

            coin_data["indicators"]["price_change_24h"] = float(latest_row["percentage_change"].values[0])
            coin_data["indicators"]["price_change_7d"] = float(latest_row["percentage_change_7d"].values[0])
            coin_data["indicators"]["sma_20"] = float(latest_row["sma_20"].values[0])
            coin_data["indicators"]["sma_50"] = float(latest_row["sma_50"].values[0])
            coin_data["indicators"]["rsi"] = float(latest_row["rsi"].values[0])
            
            for period in [7, 14, 30]:
                for days_ago in reversed(range(period)):
                    target_date = today - timedelta(days=days_ago)
                    target_row = price_history_df[price_history_df["date"] == target_date]
                    price = None
                    volume = None
                    volume_color = None

                    if not target_row.empty:
                        price = float(target_row.iloc[0]["price"])
                        volume = float(target_row.iloc[0]["volume"])
                        volume_color = target_row.iloc[0]["volume_color"]
                        

                    coin_data["price_history"][f"{period}d"].append({
                        "label": get_label_from_days_ago(days_ago),
                        "price": price,
                        "volume": volume,
                        "volume_color": volume_color
                    })

            
            # SQL query to get the monthly data for the given crypto_id
            cursor.execute("""
                SELECT
                    DISTINCT
                    month,
                    year,
                    price,
                    volume
                FROM clean_data.clean_prices_monthly
                WHERE crypto_id = %s
            """, (row['crypto_id'],))
            
            monthly_data = cursor.fetchall()
            if not monthly_data:
                print(f"No monthly data found for crypto_id: {row['crypto_id']}")
                continue
            
            columns = [desc[0] for desc in cursor.description] if cursor.description else []
            monthly_data_df = pd.DataFrame(monthly_data, columns=columns)
            monthly_data_df.sort_values(by=["year", "month"], inplace=True)

            # Iterate through the monthly data dataframe
            for label, df_slice in {
                "6m": monthly_data_df.tail(7),
                "1y": monthly_data_df.tail(13)
            }.items():
                for _, row in df_slice.iterrows():
                    coin_data["price_history"][label].append({
                        "label": f'{get_month_label(row["month"])} {row["year"]}',
                        "price": float(row["price"]),
                        "volume": float(row["volume"]),
                        "volume_color": ""
                    })
            
            results.append(coin_data)
        
        return {"success": True, "data": results}
    
    except Exception as e:
        print(f"Error fetching current prices: {e}")
        return {"success": False, "message": str(e)}
    
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()



# This function returns the current news
def get_curr_news(last_day=False):
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        interval = "1 day" if last_day else "1 hour"

        # SQL query to get the current news
        sql = f"""
            WITH parsed_news AS (
                SELECT
                    cn.title,
                    cn.news_content,
                    cn.published_at,
                    cn.url,
                    cn.crypto_ids,
                    NULLIF(trim(crypto_id), '')::BIGINT AS parsed_crypto_id
                FROM clean_data.clean_news cn
                LEFT JOIN LATERAL unnest(
                    string_to_array(cn.crypto_ids, ',')
                ) AS crypto_id ON TRUE
                WHERE 
                    cn.created_at >= NOW() - INTERVAL '{interval}'
                    OR cn.published_at >= NOW() - INTERVAL '{interval}'
            )
            SELECT
                pn.title,
                pn.news_content,
                pn.published_at,
                pn.url,
                pn.crypto_ids,
                cr.name,
                cr.symbol_binance,
                cr.symbol_coingecko
            FROM parsed_news pn
            LEFT JOIN reference.cryptocurrencies cr ON pn.parsed_crypto_id = cr.crypto_id
            ORDER BY pn.published_at ASC
        """

        cursor.execute(sql)
        news = cursor.fetchall()
        
        if not news:
            print("No news found.")
            return {"success": False, "message": "No news found."}
        else:
            return {"success": True, "message": news}
        
    except Exception as e:
        print(f"Error fetching current news: {e}")
        return {"success": False, "message": str(e)}
    
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# This function returns the current social
def get_curr_social(last_day=False):
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        interval = "1 day" if last_day else "1 hour"
        
        # SQL query to get the current social data
        sql = f"""
            SELECT
                DISTINCT
                cs.title,
                cs.content,
                cs.posted_at,
                cs.author,
                cs.url,
                cs.comments
            FROM clean_data.clean_social cs
            WHERE cs.created_at >= NOW() - INTERVAL '{interval}'
            ORDER BY cs.posted_at ASC
        """

        cursor.execute(sql)

        social = cursor.fetchall()
        if not social:
            print("No social found.")
            return {"success": False, "message": "No social found."}
        else:
            return {"success": True, "message": social}
        
    except Exception as e:
        print(f"Error fetching current social: {e}")
        return {"success": False, "message": str(e)}
    
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()

def get_social_posts(start_time=None, end_time=None, limit=1000):
    conn = None
    cursor = None
    try:
        conn = _get_conn()
        cursor = conn.cursor()
        where = []
        params = []

        if start_time:
            where.append("posted_at >= %s")
            params.append(start_time)
        if end_time:
            where.append("posted_at <= %s")
            params.append(end_time)

        sql = f"""
            SELECT
                title,
                content,
                comments,
                posted_at
            FROM clean_data.clean_social
            {"WHERE " + " AND ".join(where) if where else ""}
            ORDER BY posted_at DESC
        """

        if limit:
            sql += " LIMIT %s"
            params.append(limit)

        cursor.execute(sql, tuple(params))
        return _df_from_cursor(cursor)
    except Exception as e:
        print(f"Error fetching social posts: {e}")
        return None
    finally:
        if cursor:
            cursor.close()
        if conn:
            conn.close()


# This function returns the last historic run
def get_last_historic_run():
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        # SQL query to get the last historic run
        cursor.execute("""
            WITH latest_prices AS (
                SELECT DISTINCT ON (crypto_id)
                    crypto_id,
                    recorded_at AS last_recorded_at
                FROM clean_data.clean_prices_historic cp
                JOIN metadata.data_sources ds ON cp.source_id = ds.source_id
                WHERE ds.name = 'Binance'
                ORDER BY crypto_id, recorded_at DESC
            )
            SELECT
                cr.name,
                cr.symbol_binance,
                cr.symbol_coingecko,
                cr.rank,
                cr.crypto_id,
                lp.last_recorded_at
            FROM reference.cryptocurrencies cr
            LEFT JOIN latest_prices lp ON cr.crypto_id = lp.crypto_id
            WHERE cr.is_active = TRUE
            ORDER BY cr.rank ASC
        """)
        
        last_historic_runs = cursor.fetchall()

        if not last_historic_runs:
            print("No last historic runs found.")
            return {"success": False, "message": "No last historic runs found."}
        
        historic_cryptos = [
            {
            "name": crypto[0],
            "symbol": crypto[1],
            "rank": crypto[3],
            "crypto_id": crypto[4],
            "last_recorded_at": crypto[5]
            }
            for crypto in last_historic_runs
        ]
        
        return {"success": True, "data": historic_cryptos}

    except Exception as e:
        print(f"Error fetching last historic run: {e}")
        return {"success": False, "message": str(e)}
    
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# This function returns the prices and news for the given date range
def get_prices_news(start_date=None, end_date=None):
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()
        
        # Update start and end dates if not passed.
        if start_date is None:
            start_date = datetime.now() - timedelta(hours=1)
        if end_date is None:
            end_date = datetime.now()

        # SQL query to get the prices and news for the given date range
        cursor.execute("""
            SELECT
                DISTINCT
                cr.name,
                cr.symbol_binance,
                cr.symbol_coingecko,
                cr.rank,
                cr.crypto_id,
                cp.price,
                cp.price_open,
                cp.price_high,
                cp.price_low,
                cp.volume,
                cp.quote_asset_volume,
                cp.price_change,
                cp.percentage_change,
                cp.recorded_at
            FROM
                clean_data.clean_prices_realtime cp,
                reference.cryptocurrencies cr,
                metadata.data_sources ds
            WHERE
                cp.crypto_id = cr.crypto_id
                AND cr.is_active = TRUE
                AND ds.name = 'Binance'
                AND cp.source_id = ds.source_id
                AND cp.recorded_at >= %s
                AND cp.recorded_at <= %s
            ORDER BY cr.rank ASC
        """, (start_date, end_date,))

        prices_historic = cursor.fetchall()
        if not prices_historic:
            print("No prices and news found.")
            return None, None
        
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        prices_df = pd.DataFrame(prices_historic, columns=columns)

        # SQL query to get the news for the given date range
        cursor.execute("""
            WITH parsed_news AS (
                SELECT
                    cn.title,
                    cn.news_content,
                    cn.published_at,
                    cn.url,
                    cn.crypto_ids,
                    NULLIF(trim(crypto_id), '')::BIGINT AS parsed_crypto_id
                FROM clean_data.clean_news cn
                LEFT JOIN LATERAL unnest(
                    string_to_array(cn.crypto_ids, ',')
                ) AS crypto_id ON TRUE
                WHERE cn.published_at >= %s
                AND cn.published_at <= %s
            )
            SELECT DISTINCT
                pn.title,
                pn.news_content,
                pn.published_at,
                pn.url,
                pn.parsed_crypto_id AS crypto_id,
                cr.name,
                cr.symbol_binance,
                cr.symbol_coingecko
            FROM parsed_news pn
            LEFT JOIN reference.cryptocurrencies cr ON pn.parsed_crypto_id = cr.crypto_id
            ORDER BY pn.published_at ASC
        """, (start_date, end_date,))
        
        news = cursor.fetchall()
        if not news:
            print("No news found.")
            return prices_df, None
        
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        news_df = pd.DataFrame(news, columns=columns)
        
        return prices_df, news_df

    except Exception as e:
        print(f"Error fetching prices and news: {e}")
        return None, None
    
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# This function returns the news for the given date range
def get_news_for_training(last_hour=False):
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        if last_hour:
            # Get recent news from clean_news table
            sql = """
                WITH parsed_news AS (
                    SELECT
                        cn.title,
                        cn.news_content,
                        cn.published_at,
                        cn.url,
                        NULLIF(trim(crypto_id), '')::BIGINT AS parsed_crypto_id
                    FROM clean_data.clean_news cn
                    LEFT JOIN LATERAL unnest(
                        string_to_array(cn.crypto_ids, ',')
                    ) AS crypto_id ON TRUE
                    WHERE cn.created_at >= NOW() - INTERVAL '1 hour'
                )
                SELECT DISTINCT
                    pn.title,
                    pn.news_content,
                    pn.published_at AS news_date,
                    pn.url,
                    '' AS coin_symbol,
                    cr.name,
                    cr.symbol_binance,
                    cr.symbol_coingecko,
                    pn.parsed_crypto_id AS crypto_id
                FROM parsed_news pn
                LEFT JOIN reference.cryptocurrencies cr ON pn.parsed_crypto_id = cr.crypto_id
                ORDER BY pn.published_at ASC
            """
        else:
            # Get historical training data
            sql = """
                SELECT DISTINCT
                    tn.title,
                    tn.description AS news_content,
                    tn.news_datetime AS news_date,
                    tn.url,
                    tn.coin_symbol,
                    cr.name,
                    cr.symbol_binance,
                    cr.symbol_coingecko,
                    cr.crypto_id
                FROM clean_data.training_data_news tn
                JOIN reference.cryptocurrencies cr ON (
                    LOWER(cr.symbol_binance) IN (LOWER(tn.coin_symbol), LOWER(tn.coin_name))
                    OR LOWER(cr.symbol_coingecko) IN (LOWER(tn.coin_symbol), LOWER(tn.coin_name))
                )
            """

        cursor.execute(sql)
        news = cursor.fetchall()
        
        if not news:
            print("No news found.")
            return None
        
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        news_df = pd.DataFrame(news, columns=columns)

        return news_df

    except Exception as e:
        print(f"Error fetching news for training: {e}")
        return None, None
    
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# This function returns the prices for the given date range
def get_prices_for_training(last_hour=False):
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        if last_hour:
            # Get recent prices from clean_prices_realtime table
            sql = """
                SELECT
                    DISTINCT
                    cr.name,
                    cr.symbol_binance,
                    cr.symbol_coingecko,
                    cr.crypto_id,
                    cp.price,
                    cp.price_open,
                    cp.price_high,
                    cp.price_low,
                    cp.volume,
                    cp.quote_asset_volume,
                    cp.price_change,
                    cp.percentage_change,
                    cp.market_cap,
                    cp.recorded_at
                FROM clean_data.clean_prices_realtime cp
                    JOIN reference.cryptocurrencies AS cr
                        ON cp.crypto_id = cr.crypto_id
                    JOIN metadata.data_sources ds
                        ON ds.source_id = cp.source_id
                        AND ds.name = 'Binance'
                WHERE cp.recorded_at >= NOW() - INTERVAL '1 hour'
                ORDER BY cn.published_at ASC
            """

        else:
            # Get historical training data
            sql = """
                SELECT
                    DISTINCT
                    cr.name,
                    cr.symbol_binance,
                    cr.symbol_coingecko,
                    cr.crypto_id,
                    ch.price,
                    ch.price_open,
                    ch.price_high,
                    ch.price_low,
                    ch.volume,
                    ch.quote_asset_volume,
                    ch.price_change,
                    ch.percentage_change,
                    ch.market_cap,
                    ch.recorded_at
                FROM clean_data.clean_prices_historic ch
                    JOIN reference.cryptocurrencies AS cr
                        ON ch.crypto_id = cr.crypto_id
            """

        cursor.execute(sql)
        news = cursor.fetchall()
        
        if not news:
            print("No news found.")
            return None
        
        columns = [desc[0] for desc in cursor.description] if cursor.description else []
        news_df = pd.DataFrame(news, columns=columns)

        return news_df

    except Exception as e:
        print(f"Error fetching prices for training: {e}")
        return None, None
    
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# This function returns the sentiment for the each crypto_id and the market level sentiment
def get_sentiment():
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        # Get the latest sentiment for each crypto_id
        cursor.execute("""
            WITH latest_sentiment AS (
                SELECT DISTINCT ON (crypto_id)
                    crypto_id,
                    sentiment_score,
                    sentiment_label,
                    created_at
                FROM analytics.finbert_coin_sentiment
                ORDER BY crypto_id, created_at DESC
            )

            SELECT 
                ls.crypto_id,
                ls.sentiment_score,
                ls.sentiment_label,
                cr.name,
                cr.symbol_binance,
                cr.symbol_coingecko
            FROM latest_sentiment ls
            JOIN reference.cryptocurrencies cr
                ON ls.crypto_id = cr.crypto_id
        """)

        coin_sent = cursor.fetchall()

        if not coin_sent:
            print('Coin level sentiment not found')
            return {"success": False, "message": 'Coin level sentiment not found'}
        
        # Get the latest market level sentiment
        cursor.execute("""
            SELECT 
                sentiment_score,
                sentiment_label
            FROM
                analytics.market_level_sentiment
            ORDER BY 
                last_updated_at DESC
            LIMIT 1
        """)

        market_sent = cursor.fetchone()

        if not market_sent:
            print('Market sentiment not found')
            return {"success": False, "message": 'Market sentiment not found'}

        return {"success": True, "coin_sentiment": coin_sent, "market_sentiment" : market_sent }
    
    except Exception as e:
        print(f"Error fetching sentiment: {e}")
        return {"success": False, "message": str(e)}
    
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# This function returns the forecast for the given user
def get_forecast(user_id):
    conn = None
    cursor = None
    try:
        conn = psycopg2.connect(os.getenv("DATABASE_URL"))
        cursor = conn.cursor()

        # Get the latest forecast for the given user
        cursor.execute("""
            WITH latest_forecasts AS (
                SELECT DISTINCT ON (profile_id, crypto_id)
                    forecast_id,
                    profile_id,
                    crypto_id,
                    volatility,
                    trend,
                    risk_message,
                    recommendation,
                    created_at
                FROM analytics.forecasts
                ORDER BY profile_id, crypto_id, created_at DESC
            )

            SELECT 
                ur.profile_id,
                cr.crypto_id,
                cr.name,
                cr.symbol_binance,
                cr.symbol_coingecko,
                lf.volatility,
                lf.trend,
                lf.risk_message,
                lf.recommendation
            FROM auth.user_risk_profiles ur
            JOIN latest_forecasts lf
                ON ur.profile_id = lf.profile_id
            JOIN reference.cryptocurrencies cr
                ON lf.crypto_id = cr.crypto_id
            WHERE ur.user_id = %s
        """, (user_id,))

        forecast = cursor.fetchall()

        if not forecast:
            print('Forecasts not found')
            return {"success": False, "message": 'Forecasts not found'}
        
        
        return {"success": True, "forecast": forecast }
    
    except Exception as e:
        print(f"Error fetching sentiment: {e}")
        return {"success": False, "message": str(e)}
    
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()

def get_economic_events(start_date=None, end_date=None, coutries = None, importance=None):
    conn = None
    cursor = None
    try:
        conn = _get_conn()
        cursor = conn.cursor()
        where = []
        params = []
        if start_date:
            where.append("event_date >= %s")
            params.append(start_date)
        if end_date:
            where.append("event_date <= %s")
            params.append(end_date)
        if coutries:
            where.append("(LOWER(country) = ANY(%s) OR LOWER(country_name) = ANY(%s))")
            lc = [c.lower() for c in coutries]
            params.extend([lc, lc])
        if importance:
            where.append("LOWER(importance) = ANY(%s)")
            params.append([i.lower() for i in importance])
        
        sql = f"""
            SELECT
                event_id,
                event_date,
                country,
                country_name,
                event_name,
                importance,
                actutal,
                forecast,
                previous
            FROM reference.economic_events
            {"WHERE" + "AND".join(where) if where else ""}
            ORDER BY event_date ASC
        """
        cursor.execute(sql, tuple(params))
        return _df_from_cursor(cursor)
    except Exception as e:
        print(f"Error fetching economic events: {e}")
        return None
    finally:
        if cursor: cursor.close()
        if conn: conn.close()


def get_stock_market_data(symbols=None, start_time=None, end_time=None, limit=500):
    conn = None
    cursor = None
    try:
        conn = _get_conn()
        cursor = conn.cursor()
        where = []
        params = []
        if symbols:
            where.append("LOWER(symbols) = ANY(%s)")
            params.append([s.lower() for s in symbols])
        if start_time:
            where.append("time_key >= %s")
            params.append(start_time)
        if end_time:
            where.append("time_key <= %s")
            params.append(end_time)
        sql = f"""
            SELECT
                id,
                symbol,
                time_key,
                open,
                high,
                low,
                close,
                volume,
                adjusted_close,
            FROM clean_data.stock_market_data
            {"WHERE" + "AND".join(where) if where else ""}
            ORDER BY time_key ASC
            LIMIT %s
        """
        params.append(limit)
        cursor.execute(sql, tuple(params))
        return _df_from_cursor(cursor)
    except Exception as e:
        print(f"Error fetching stock market data: {e}")
        return None
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

def get_crypto_transactions(start_time=None, end_time=None, limit=1000):
    conn = None
    cursor = None
    try:
        conn = _get_conn()
        cursor = conn.cursor()
        where = []
        params = []
        if start_time:
            where.append("t.timestamp >= %s")
            params.append(start_time)
        if end_time:
            where.append("t.timestamp <= %s")
            params.append(end_time)
        
        sql = f"""
            WITH tx AS (
                SELECT
                    t.id,
                    t.hash,
                    t.block_number,
                    t.blockchain,
                    t.timestamp,
                    t.fee,
                    t.amount,
                    t.token_symbol,
                    t.token_address
                FROM raw_data.crypto_transactions t
                {"WHERE" + "AND".join(where) if where else ""}
                ORDER BY t.timestamp DESC
                LIMIT %s
            ),
            senders AS (
                SELECT s.transaction_hash,
                jsonb_agg(json_build_object('address', s.address, 'value', s.output_value) ORDER BY s.id) AS senders
                FROM raw_data.crypto_tx_senders s
                JOIN tx ON s.transaction_hash = tx.hash
                GROUP BY s.transaction_hash
            ),
            receivers AS (
                SELECT r.transaction_hash, jsonb_agg(jsonb_build_object('address', r.address, 'value', r.value) ORDER BY r.id) AS receivers
                FROM raw_data.crypto_tx_receivers r
                JOIN tx ON r.transaction_hash = tx.hash
                GROUP BY r.transaction_hash
            )
            SELECT
                tx.*, COALESCE(snd.senders, '[]'::jsonb) AS senders,
                COALESCE(rcv.receivers, '[]':jsonb) AS receivers
            FROM tx
            LEFT JOIN senders snd ON snd.transaction_hash = tx.hash
            LFET JOIN receivers rcv ON rcv.transaction_hash = tx_hash
            ORDER BY tx.timestamp DESC
        """
        params.append(limit)
        cursor.execute(sql, tuple(params))
        return _df_from_cursor(cursor)
    except Exception as e:
        print(f"Error fetching crypto transaction: {e}")
        return None
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

def get_news_sentiment(start_time=None, end_time=None, symbols=None):
    conn = None
    cursor = None
    try:
        conn = _get_conn()
        cursor = conn.cursor()
        where = []
        params = []
        if start_time:
            where.append("time_published >= %s")
            params.append(start_time)
        if end_time:
            where.append("time_published <= %s")
            params.append(end_time)
        if symbols:
            where.append("LOWER(symbol) = ANY(%S)")
            params.append([s.lower() for s in symbols])
        sql = f"""
            SELECT
                id,
                symbol,
                time_published,
                sentiment_score,
                sentiment_label,
                source,
                url,
                title
            FROM clean_data.get_news_sentiment
            {"WHERE" + "AND".join(where) if where else ""}
            ORDER BY time_published DESC
        """
        cursor.execute(sql, tuple(params))
        return _df_from_cursor(cursor)
    except Exception as e:
        print(f"Error fetching news sentiment: {e}")
        return None
    finally:
        if cursor: cursor.close()
        if conn: conn.close()
def get_sentiment_summary(start_time=None, end_time=None, symbol=None):
    conn = None
    cursor = None
    try:
        conn = _get_conn()
        cursor = conn.cursor()
        where = []
        params =[]
        if start_time:
            where.append("summary_date >= %s")
            params.append(start_time)
        if end_time:
            where.append("summary_date <= %s")
            params.append(end_time)
        if symbol:
            where.append("LOWER(symbol) = %s")
            params.append(symbol.lower())
        sql = f"""
            SELECT
                id,
                summary_date,
                symbol,
                avg_score,
                positive_count,
                nagetive_count,
                neutral_count
            FROM analytics.get_sentiment_summary
            {"WHERE" + "AND".join(where) if where else ""}
            ORDER BY summary_date ASC
        """
        cursor.execute(sql, tuple(params))
        return _df_from_cursor(cursor)
    except Exception as e:
        print(f"Error fetching sentiment summary: {e}")
        return None
    finally:
        if cursor: cursor.close()
        if conn: conn.close()
    
def get_market_movers(date_from=None, date_to=None, limit=100):
    conn = None
    cursor = None
    try:
        conn = _get_conn()
        cursor = conn.cursor()
        where = []
        params =[]
        if date_from:
            where.append("data_date >= %s")
            params.append(date_from)
        if date_to:
            where.append("data_date <= %s")
            params.append(date_to)
        sql = f"""
            SELECT
                id,
                data_date,
                symbol,
                change_pct,
                volume,
                direction
            FROM analytics.market_movers
            {"WHERE" + "AND".join(where) if where else ""}
            ORDER BY data_date DESC, ABS(change_pct) DESC
            LIMIT %s
        """
        params.append(limit)
        cursor.execute(sql, tuple(params))
        return _df_from_cursor(cursor)
    except Exception as e:
        print(f"Error fetching market movers")
        return None
    finally:
        if cursor: cursor.close()
        if conn: conn.close()
