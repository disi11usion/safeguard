"""
# file: data_ingestion.py
# description: This script provides functions for ingesting data into the database.
# Date: 26-06-2025
"""

from database.utils.db_pool import get_db_connection
import os
import psycopg2
from dotenv import load_dotenv
import json
from datetime import datetime
import pandas as pd
import numpy as np
import decimal
import uuid
import math
from typing import List, Dict
from psycopg2.extras import Json

# Load environment variables from .env file
load_dotenv()

def _get_conn(autocommit=True):
    conn = get_db_connection()
    if autocommit:
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
    return conn

def _records_to_jsonb(records):
    if hasattr(records, "to_dict"):
        try:
            records = records.to_dict(orient = "records")
        except Exception:
            pass
    elif isinstance(records, set):
        records = list(records)
    elif isinstance(records, dict):
        records = [records]
    if hasattr(records, "to_json"):
        try:
            records = json.loads(records.to_json(orient="records"))
        except Exception:
            pass
    try:
        records = json.loads(json.dump(records))
    except:
        pass
    if isinstance(records, list):
        return json.dumps(records)
    return json.dumps([records])

def _df_nan_to_none(df: pd.DataFrame) -> pd.DataFrame:
    df = df.where(pd.notnull(df), None)
    df = df.replace({np.nan: None})
    return df

def _prepare_records_for_ingestion(records):
    if records is None:
        return json.dumps([])
    if hasattr(records, "to_dict"):
        records = _df_nan_to_none(records)
        records = records.to_dict(orient="records")
    elif isinstance(records, set):
        records = list(records)
    elif isinstance(records, dict):
        records = [records]
    elif isinstance(records, pd.DataFrame):
        records = _df_nan_to_none(records)
        records = records.to_dict(orient="records")
    try:
        if hasattr(records, "to_json"):
            records = json.loads(records.to_json(orient="records"))
        else:
            records = json.loads(json.dumps(records, default=str))
    except Exception:
        def default_serializer(obj):
            if isinstance(obj, (np.integer, np.floating)):
                return float(obj)
            elif isinstance(obj, np.ndarray):
                return obj.tolist()
            elif isinstance(obj, (datetime, pd.Timestamp)):
                return obj.isoformat()
            elif pd.isna(obj):
                return None
            elif isinstance(obj, (decimal.Decimal)):
                return float(obj)
            else:
                return str(obj)
        if isinstance(records, list):
            records = [{
                k: default_serializer(v)
                for k,v in item.items()
                if not k.startswith('_')
            } for item in records]
        elif isinstance(records, dict):
            records = [{
                k: default_serializer(v)
                for k, v in records.items()
                if not k.startswith('_')
            }]
    if isinstance(records, list):
        return json.dumps(records)
    return json.dumps(records)

# Function to log start of an ingestion job into the database
def log_ingestion_job(source, start_time, status='started',records_processed=0):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        # Set the timezone to UTC
        cursor.execute("SET TIME ZONE 'UTC';")
 
        # Check if the source exists in the database
        cursor.execute("""
            SELECT source_id FROM metadata.data_sources
            WHERE UPPER(name) = UPPER(%s)
        """, (source,))

        source_id = cursor.fetchone()
        if not source_id:
            print(f"Source '{source}' not found in the database. Inserting new source.")
            cursor.execute("""
                INSERT INTO metadata.data_sources(name)
                VALUES (%s)
                RETURNING source_id
            """, (source,))
            source_id = cursor.fetchone()
            if not source_id:
                raise RuntimeError("Failed to insert data source.")
        source_id = source_id[0]  # type: ignore

        # Log the ingestion job
        
        print(f"Logging ingestion job for source ID: {source_id}, start time: {start_time}, status: {status}")
        cursor.execute("""
            INSERT INTO metadata.ingestion_job_log (source_id, start_time, status, record_count)
            VALUES (%s, %s, %s,%s)
            RETURNING job_id
        """, (source_id, start_time, status,records_processed))

        job_id = cursor.fetchone()[0]  # type: ignore
        print(f"Ingestion job logged with ID: {job_id}")

        conn.commit()
        print("Ingestion job logged successfully.")

        return source_id, job_id

    except Exception as e:
        print(f"Error logging ingestion job: {e}")
        if conn:
            conn.rollback()
        return None, None
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()

# Function to update an existing ingestion job in the database
def update_ingestion_job(job_id, end_time=None, record_count=None, status='completed', error_message=None):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

        fields = []
        values = []

        # To only update fields have data.
        if end_time is not None:
            fields.append("end_time = %s")
            values.append(end_time)
        if record_count is not None:
            fields.append("record_count = %s")
            values.append(record_count)
        if status is not None:
            fields.append("status = %s")
            values.append(status)
        if error_message is not None:
            fields.append("error_message = %s")
            values.append(error_message)
        fields.append("last_updated_at = NOW()")

         # Construct the update query
        update_query = f"""
            UPDATE metadata.ingestion_job_log 
            SET {', '.join(fields)} 
            WHERE job_id = %s
        """

        values.append(job_id)

        print("Executing update query...")
        cursor.execute(update_query, tuple(values))

        conn.commit()
        print("Ingestion job updated successfully.")
        return

    except Exception as e:
        print(f"Error updating ingestion job: {e}")
        if conn:
            conn.rollback()
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()

# Function to ingest raw historic prices into the database
def historic_prices_ingestion(source_id, job_id, records):
    conn = None
    cursor = None
    
    try:
        conn = get_db_connection()
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        conn.notices = []
        cursor = conn.cursor()
        
        # Execute the stored procedure to insert historic prices
        print(f"Ingesting historic prices for source ID: {source_id}, job ID: {job_id}, records: {len(records)}")
        if not records:
            print("No records to ingest.")
            return {"success": False, "message": "No records to ingest."}

        record_count = len(records)
        
        # Ensure records is a list of dicts
        if hasattr(records, "to_dict"):
            records = records.to_dict(orient="records")
        elif isinstance(records, set):
            records = list(records)
        elif isinstance(records, dict):
            records = [records]

        # Convert records DataFrame to JSON if it's a DataFrame
        if hasattr(records, "to_json"):
            records = json.loads(records.to_json(orient="records")) # type: ignore

        # Ensure records is a JSON-serializable object (list of dicts)
        records = json.loads(json.dumps(records))

        if isinstance(records, list):
            records = json.dumps(records)
        
        cursor.execute("CALL raw_data.insert_historic_raw_prices(%s, %s, %s)",
                       (source_id, job_id, records))

        print("Historic prices ingested successfully.")

        # Update the ingestion job status to completed
        update_ingestion_job(job_id, end_time=datetime.now(), record_count=record_count, status='staged')

        return {"success": True, "message": "Historic prices ingested successfully."}
    
    except Exception as e:
        print(f"Error ingesting historic prices: {e}")
        # Update the ingestion job status to failed
        update_ingestion_job(job_id, end_time=datetime.now(), status='failed', record_count=record_count, error_message=str(e))
        return {"success": False, "message": str(e)}
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# Function to ingest real-time prices into the database
def realtime_prices_ingestion(source_id, job_id, records):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        conn.notices = []
        cursor = conn.cursor()

        # Execute the stored procedure to insert realtime prices
        print(f"Ingesting realtime prices for source ID: {source_id}, job ID: {job_id}, records: {len(records)}")
        if not records:
            print("No records to ingest.")
            return {"success": False, "message": "No records to ingest."}
        
        record_count = len(records)
        
        # Ensure records is a list of dicts
        if hasattr(records, "to_dict"):
            records = records.to_dict(orient="records")
        elif isinstance(records, set):
            records = list(records)
        elif isinstance(records, dict):
            records = [records]

        # Convert records DataFrame to JSON if it's a DataFrame
        if hasattr(records, "to_json"):
            records = json.loads(records.to_json(orient="records")) # type: ignore

        # Ensure records is a JSON-serializable object (list of dicts)
        records = json.loads(json.dumps(records))

        if isinstance(records, list):
            records = json.dumps(records)

        cursor.execute("CALL clean_data.insert_realtime_clean_prices(%s::BIGINT, %s::UUID, %s::JSONB)",
                       (source_id, job_id, records))
        conn.commit()

        print("Realtime prices ingested successfully.")

        # Update the ingestion job status to completed
        update_ingestion_job(job_id, end_time=datetime.now(), record_count=record_count, status='completed')

        return {"success": True, "message": "Realtime prices ingested successfully."}
    
    except Exception as e:
        print(f"Error ingesting realtime prices: {e}")
        # Update the ingestion job status to failed
        update_ingestion_job(job_id, end_time=datetime.now(), status='failed', record_count=record_count, error_message=str(e))
        return {"success": False, "message": str(e)}
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# Function to ingest raw social posts into the database
def social_ingestion(source_id: int, job_id: str, records) -> Dict:
    """
Batch-store posts scraped from social platforms in raw_data.raw_social.
- Compatible input: pandas.DataFrame or List[Dict]
- Required fields: platform_id, posted_at; optional fields: title, content, author, url, comments
- Mandatory fields: source_id and job_id
- Idempotent: UPSERT (source_id, platform_id, posted_at)
    """

    is_dataframe = hasattr(records, "to_dict") and hasattr(records, "empty") and not isinstance(records, list)
    if is_dataframe:

        if records.empty:
            return {"success": True, "message": "No records to ingest."}
        records = records.to_dict("records")  

    if not records:
        return {"success": True, "message": "No records to ingest."}

    rows = []
    for r in records:
        platform_id = r.get("platform_id")
        posted_at = r.get("posted_at")
        if posted_at is None:

            continue

        title = r.get("title")
        content = r.get("content")
        author = r.get("author")
        url = r.get("url")
        comments = r.get("comments", [])
        payload = r  

        rows.append((
            platform_id,            # %s
            title,                  # %s
            content,                # %s
            posted_at,              # %s (timestamptz 
            author,                 # %s
            source_id,              # %s
            url,                    # %s
            Json(comments),         # %s::jsonb
            Json(payload),          # %s::jsonb
            job_id                  # %s (uuid)
        ))

    if not rows:
        return {"success": True, "message": "No valid records to ingest."}

    sql = """
        INSERT INTO raw_data.raw_social
            (platform_id, title, content, posted_at, author, source_id, url, comments, payload, job_id)
        VALUES
            (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s)
        ON CONFLICT (source_id, platform_id, posted_at)
        DO UPDATE SET
            title = EXCLUDED.title,
            content = EXCLUDED.content,
            author = EXCLUDED.author,
            url = EXCLUDED.url,
            comments = EXCLUDED.comments,
            payload = EXCLUDED.payload,
            last_updated_at = now()
    """

    with _get_conn() as conn:
        with conn.cursor() as cur:
             cur.executemany(sql, rows)

    return {"success": True, "message": "Social posts ingested successfully."}

# Function to ingest raw news into the database
def news_ingestion(source_id, job_id, records):
    conn = None
    cursor = None
    record_count = 0
    try:
        conn = get_db_connection()
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        conn.notices = []
        cursor = conn.cursor()

        cursor.execute("SET TIME ZONE 'UTC';")

        # Execute the stored procedure to insert news data
        print(f"Ingesting news for source ID: {source_id}, job ID: {job_id}, records: {len(records)}")

        records = records.where(pd.notnull(records), None)
        records = records.replace({np.nan: None})
        
        # Ensure records is a list of dicts
        if hasattr(records, "to_dict"):
            records = records.to_dict(orient="records")
        elif isinstance(records, set):
            records = list(records)
        elif isinstance(records, dict):
            records = [records]

        # Convert records DataFrame to JSON if it's a DataFrame
        if hasattr(records, "to_json"):
            records = json.loads(records.to_json(orient="records")) # type: ignore

        # Ensure records is a JSON-serializable object (list of dicts)
        records = json.loads(json.dumps(records))

        if isinstance(records, list):
            records = json.dumps(records)
        
        cursor.execute("CALL raw_data.insert_raw_news(%s, %s, %s)",
                       (source_id, str(job_id), records))

        print("News ingested successfully.")

        cursor.execute("""
            SELECT count(1)
            FROM raw_data.raw_news
            WHERE job_id = %s
        """, (str(job_id),))

        record_count = cursor.fetchone()
        if record_count:
            record_count = record_count[0]

        # Update the ingestion job status to completed
        update_ingestion_job(str(job_id), end_time=datetime.now(), record_count=record_count, status='staged')

        return {"success": True, "message": "News ingested successfully."}
    
    except Exception as e:
        print(f"Error ingesting news: {e}")
        # Update the ingestion job status to failed
        update_ingestion_job(str(job_id), end_time=datetime.now(), status='failed', record_count=record_count, error_message=str(e))
        return {"success": False, "message": str(e)}
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# Function to insert and update crypto details in the database
def update_crypto_ranks(data):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

         # Set the timezone to UTC
        cursor.execute("SET TIME ZONE 'UTC';")

        new_coins = set()
        for _, row in data.iterrows():
            cursor.execute("""
                SELECT 
                    crypto_id,
                    is_active,
                    rank
                FROM reference.cryptocurrencies
                WHERE name = %s
            """, (row["name"],))

            crypto = cursor.fetchone()
            # Updating existing coins
            if crypto:
                crypto_id = crypto[0]
                is_active = crypto[1]
                rank = crypto[2]
                # Updating rank if already active and has a change in rank
                if is_active:
                    if row["rank"] != rank:
                        cursor.execute("""
                            UPDATE reference.cryptocurrencies
                            SET rank = %s,
                            last_updated_at = NOW()
                            WHERE crypto_id = %s
                        """, (row["rank"], crypto_id))
                else:
                    # Updating if it is currently inactive
                    cursor.execute("""
                        UPDATE reference.cryptocurrencies
                        SET 
                            rank = %s,
                            is_active = TRUE,
                            last_updated_at = NOW()
                        WHERE crypto_id = %s
                    """, (row["rank"], crypto_id))
                
                new_coins.add(crypto_id)

            else:
                # Inseting new coin data
                cursor.execute("""
                    INSERT INTO reference.cryptocurrencies (name, symbol_coingecko, symbol_binance, icon_path, rank)
                    VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING
                    RETURNING crypto_id
                """, (row["name"], row["symbol_coingecko"], row["symbol_binance"], row["icon_path"], row["rank"]))

                crypto_id = cursor.fetchone()
                if crypto_id:
                    new_coins.add(crypto_id[0])
        
        cursor.execute("""
            SELECT crypto_id
            FROM reference.cryptocurrencies
            WHERE is_active = TRUE
        """)

        # Updating old coins as inactive if no data retrieved for them.
        active_coins = cursor.fetchall()
        if active_coins:
            active_coins = set(coin[0] for coin in active_coins)
            update_coins = active_coins - new_coins

            if update_coins:
                print(f"Updating coins: {update_coins}")
                cursor.execute("""
                    UPDATE reference.cryptocurrencies
                    SET 
                        is_active = FALSE, 
                        last_updated_at = NOW()
                    WHERE crypto_id = ANY(%s)
                """, (list(update_coins),))

        conn.commit()
        print("Crypto ranks updated successfully.")

        return {"success": True, "message": "Crypto ranks updated successfully."}   
            
    except Exception as e:
        print(f"Error updating crypto ranks: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# Function to ingest cleaned historic prices into the database
def clean_historic_prices(historic_records, monthly_records):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        conn.notices = []
        cursor = conn.cursor()

        # Get the latest ingestion job details for the raw prices
        cursor.execute("""
            SELECT
                DISTINCT
                ijl.job_id,
                ijl.source_id
            FROM 
                metadata.ingestion_job_log ijl,
                metadata.data_sources ds
            WHERE ijl.status = 'staged'
            AND ijl.source_id = ds.source_id
            AND ds.name in ('Binance', 'CoinGecko')
        """,)

        ingestion_jobs = cursor.fetchall()
        if not ingestion_jobs:
            print("Nothing to ingest")
            return {"success": False, "message": "Nothing to ingest"}

        if historic_records is not None:

            # Convert DataFrame to list of dicts
            if hasattr(historic_records, "to_dict"):
                historic_records = historic_records.to_dict(orient="records")
            elif isinstance(historic_records, (list, set)):
                historic_records = list(historic_records)
            elif isinstance(historic_records, dict):
                historic_records = [historic_records]
            else:
                historic_records = []

            
            # cleans json to change datatypes for ingestion
            def clean_record_for_json(rec):
                def clean(val):
                    if isinstance(val, float) and math.isnan(val):
                        return None
                    elif isinstance(val, decimal.Decimal):
                        return float(val)
                    elif isinstance(val, pd.Timestamp):
                        return val.isoformat()
                    return val
                return {k: clean(v) for k, v in rec.items()}

            # Clean data
            historic_records = [clean_record_for_json(rec) for rec in historic_records]

            # Normalize types for comparison
            valid_job_source_pairs = set(
                (str(job_id), str(source_id)) for job_id, source_id in ingestion_jobs
            )
            for rec in historic_records:
                rec["job_id"] = str(rec.get("job_id"))
                rec["source_id"] = str(rec.get("source_id"))

            # Filter records as to only insert records which are new
            for job_id, source_id in valid_job_source_pairs:
                filtered_records = [
                    rec for rec in historic_records
                    if rec.get("job_id") == job_id and rec.get("source_id") == source_id
                ]

                if not filtered_records:
                    print(f"No records match the valid {job_id} and {source_id} pair.")
                    continue

                # Serialize
                filtered_records_json = json.dumps(filtered_records)

                cursor.execute(
                    "CALL clean_data.insert_historic_clean_prices(%s::JSONB)",
                    (filtered_records_json,)
                )

                update_ingestion_job(job_id, end_time=datetime.now(), status='completed')
            conn.commit()
            print("Cleaned historic prices ingested successfully.")

        # Update monthly data in database
        if monthly_records is not None:
            monthly_records = monthly_records.dropna(subset=["crypto_id", "month", "year", "source_id"])

            cursor.execute("""
                SELECT
                    DISTINCT
                    crypto_id,
                    month,
                    year,
                    source_id
                FROM
                    clean_data.clean_prices_monthly
            """)

            existing_records = set(cursor.fetchall())
            
            # Remove data which has already been inserted
            if existing_records:
                monthly_records["key"] = list(zip(monthly_records.crypto_id, monthly_records.month, monthly_records.year, monthly_records.source_id))
                monthly_records = monthly_records[~monthly_records["key"].isin(existing_records)]

            if not monthly_records.empty:
                insert_tuples = monthly_records[["crypto_id", "month", "year", "price", "volume", "source_id"]].values.tolist()

                cursor.execute("SET TIME ZONE 'UTC';")

                insert_query = """
                    INSERT INTO clean_data.clean_prices_monthly (crypto_id, month, year, price, volume, source_id)
                    VALUES (%s, %s, %s, %s, %s, %s)
                """
                cursor.executemany(insert_query, insert_tuples)
                conn.commit()

        return {"success": True, "message": "Cleaned Historic prices ingested successfully."}

    except Exception as e:
        print(f"Error updating clean historic prices: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# Function to ingest cleaned social posts into the database
def clean_social_ingestion(source_id, job_id, records):
    conn = None
    cursor = None
    record_count = 0
    try:
        conn = get_db_connection()
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        conn.notices = []
        cursor = conn.cursor()

        # Execute the stored procedure to insert news data
        print(f"Ingesting clean social posts for source ID: {source_id}, job ID: {job_id}, records: {len(records)}")

        # Data preparation for ingestion
        records = records.where(pd.notnull(records), None)
        records = records.replace({np.nan: None})

        if 'posted_at' in records.columns:
            records['posted_at'] = records['posted_at'].astype(str)

        # Ensure records is a list of dicts
        if hasattr(records, "to_dict"):
            records = records.to_dict(orient="records")
        elif isinstance(records, set):
            records = list(records)
        elif isinstance(records, dict):
            records = [records]

        # Convert records DataFrame to JSON if it's a DataFrame
        if hasattr(records, "to_json"):
            records = json.loads(records.to_json(orient="records")) # type: ignore

        # Ensure records is a JSON-serializable object (list of dicts)
        records = json.loads(json.dumps(records))

        if isinstance(records, list):
            records = json.dumps(records)
        
        cursor.execute("CALL clean_data.insert_clean_social(%s, %s, %s)",
                       (source_id, str(job_id), records,))

        print("Social data ingested successfully.")

        cursor.execute("""
            SELECT count(1)
            FROM clean_data.clean_social
            WHERE job_id = %s
        """, (str(job_id),))

        record_count = cursor.fetchone()
        if record_count:
            record_count = record_count[0]
        else:
            record_count = 0

        # Update the ingestion job status to completed
        update_ingestion_job(str(job_id), end_time=datetime.now(), record_count=record_count, status='completed')

        return {"success": True, "message": "Cleaned social posts ingested successfully."}
    
    except Exception as e:
        print(f"Error ingesting cleaned social posts: {e}")
        # Update the ingestion job status to failed
        update_ingestion_job(str(job_id), end_time=datetime.now(), status='failed', error_message=str(e))
        return {"success": False, "message": str(e)}
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# Function to ingest cleaned news into the database
def clean_news_ingestion(source_id, job_id, records):
    conn = None
    cursor = None
    record_count = 0
    try:
        conn = get_db_connection()
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        conn.notices = []
        cursor = conn.cursor()

        # Execute the stored procedure to insert news data
        print(f"Ingesting clean news for source ID: {source_id}, job ID: {job_id}, records: {len(records)}")

        # Data preparation for ingestion
        records = records.where(pd.notnull(records), None)
        records = records.replace({np.nan: None})
        if 'published_at' in records.columns:
            records['published_at'] = records['published_at'].astype(str)

        # Ensure records is a list of dicts
        if hasattr(records, "to_dict"):
            records = records.to_dict(orient="records")
        elif isinstance(records, set):
            records = list(records)
        elif isinstance(records, dict):
            records = [records]

        # Convert records DataFrame to JSON if it's a DataFrame
        if hasattr(records, "to_json"):
            records = json.loads(records.to_json(orient="records")) # type: ignore

        # Ensure records is a JSON-serializable object (list of dicts)
        records = json.loads(json.dumps(records))

        if isinstance(records, list):
            records = json.dumps(records)
        
        cursor.execute("CALL clean_data.insert_clean_news(%s, %s, %s)",
                       (source_id, str(job_id), records,))

        print("Clean News data ingested successfully.")

        cursor.execute("""
            SELECT count(1)
            FROM clean_data.clean_news
            WHERE job_id = %s
        """, (str(job_id),))

        row = cursor.fetchone()
        record_count = row[0] if row and len(row) > 0 else 0

        # Update the ingestion job status to completed
        update_ingestion_job(str(job_id), end_time=datetime.now(), record_count=record_count, status='completed')

        return {"success": True, "message": "Clean News ingested successfully."}
    
    except Exception as e:
        print(f"Error ingesting clean news: {e}")
        # Update the ingestion job status to failed
        update_ingestion_job(str(job_id), end_time=datetime.now(), status='failed', error_message=str(e))
        return {"success": False, "message": str(e)}
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# Function to insert latest coin-level sentiment into the database
def insert_finbert_coin_sentiment(data):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        conn.notices = []
        cursor = conn.cursor()

        data = data.where(pd.notnull(data), None)
        data = data.replace({np.nan: None})

        if len(data) <= 0:
            print("No FinBERT coin-level sentiment data to insert")
            return {"success": False, "message": "No FinBERT coin-level sentiment data to insert"}

        print(f"Inserting FinBERT coin-level sentiment.")

        cursor.execute("SET TIME ZONE 'UTC';")

        insert_query = """
            INSERT INTO analytics.finbert_coin_sentiment (
                crypto_id,
                sentiment_score,
                sentiment_label
            )
            VALUES (%s, %s, %s)
        """

        for _, row in data.iterrows():
            cursor.execute(insert_query, (
                row.get("crypto_id"),
                row.get("sentiment_score"),
                row.get("sentiment_label")
            ))

        print("FinBERT coin-level sentiment inserted successfully.")
        return {"success": True, "message": "Inserted finbert_coin_sentiment successfully."}

    except Exception as e:
        print(f"Error inserting FinBERT coin sentiment: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# Function to insert latest market-level sentiment into the database
def insert_market_level_sentiment(data):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        conn.set_isolation_level(psycopg2.extensions.ISOLATION_LEVEL_AUTOCOMMIT)
        conn.notices = []
        cursor = conn.cursor()

        data = data.where(pd.notnull(data), None)
        data = data.replace({np.nan: None})

        if len(data) <= 0:
            print("No FinBERT market-level sentiment data to insert")
            return {"success": False, "message": "No FinBERT market-level sentiment data to insert"}
        
        
        print(f"Inserting FinBERT market‑level sentiment.")

        cursor.execute("SET TIME ZONE 'UTC';")

        insert_query = """
            INSERT INTO analytics.market_level_sentiment (
                sentiment_score,
                sentiment_label
            )
            VALUES (%s, %s)
        """

        for _,row in data.iterrows():
            cursor.execute(insert_query, (
                row.get("sentiment_score"),
                row.get("sentiment_label")
            ))

        print("Market‑level sentiment ingested successfully.")
        return {"success": True, "message": "Inserted market_level_sentiment successfully."}

    except Exception as e:
        print(f"Error inserting market_level_sentiment: {e}")
        return {"success": False, "message": str(e)}

    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()


# Function to insert latest coin-level, risk profile based forecast into the database
def insert_forecast(data):
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()

         # Set the timezone to UTC
        cursor.execute("SET TIME ZONE 'UTC';")

        for _, row in data.iterrows():

            # Retrieving crypto coin id
            cursor.execute("""
                SELECT crypto_id
                FROM reference.cryptocurrencies
                WHERE lower(name) = lower(%s)
            """, (row["coin"],))

            crypto_id = cursor.fetchone()
            if not crypto_id:
                print("Error inserting row due to crypto id not found")
                continue
            crypto_id = crypto_id[0]

            # Retrieving risk profile id
            cursor.execute("""
                SELECT profile_id
                FROM reference.risk_profiles
                WHERE lower(name) = lower(%s)
            """, (row["profile"],))

            profile_id = cursor.fetchone()
            if not profile_id:
                print("Error inserting row due to profile id not found")
                continue
            profile_id = profile_id[0]

            # Inserting data into forecasts table
            cursor.execute("""
                    INSERT INTO analytics.forecasts (profile_id, crypto_id, volatility, trend, risk_message, recommendation)
                    VALUES (%s, %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING
                """, (profile_id, crypto_id, row["volatility"], row["trend"], row["risk_message"], row["recommendation"]))

        conn.commit()
        print("Forecasts inserted successfully.")

    except Exception as e:
        print(f"Error inserting Forecasts: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if "cursor" in locals() and cursor:
            cursor.close()
        if "conn" in locals() and conn:
            conn.close()

def ingest_economic_events(records):
    conn = None
    cursor = None
    try:
        payload = _records_to_jsonb(records)
        conn = _get_conn(autocommit=True)
        cursor = conn.cursor()
        print(f"Ingesting economic events: {len(json.loads(payload))} rows")
        cursor.execute("CALL reference.upsert_economic_events(%s::JSONB)", (payload,))
        print("Economic events upserted.")
        return {"success": True, "message": "Economic events upserted."}
    except Exception as e:
        print(f"Error ingetsing economic events: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

def ingest_stock_market_data(records):
    conn = None
    cursor = None
    try:
        if isinstance(records, pd.DataFrame):
            records = _df_nan_to_none(records)
        payload = _records_to_jsonb(records)
        conn = _get_conn(autocommit=True)
        cursor = conn.cursor()
        print(f"Ingesting stock market snapshots: {len(json.loads(payload))} rows")
        cursor.execute("CALL clean_data.upsert_stock_market_data(%s::JSONB)", (payload,))
        print(f"Stock market data upserted.")
        return {"success": True, "message": "Stock market data upserted."}
    except Exception as e:
        print(f"Error ingetsing stock market data: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

def ingest_crypto_transactions(records):
    conn = None
    cursor = None
    try:
        payload = _records_to_jsonb(records)
        conn = _get_conn(autocommit=True)
        cursor = conn.cursor()
        print(f"Ingesting crypto transactions: {len(json.loads(payload))} rows")
        cursor.execute("CALL raw_data.ingest_crypto_transactions(%s::JSONB)", (payload,))
        print(f"Crypto transactions ingested(with legs).")
        return {"success":True, "message": "Crypto transactions ingested."}
    except Exception as e:
        print(f"Error ingesting crypto transactions:{e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

def ingest_news_sentiment(records):
    conn = None
    cursor = None
    try:
        if isinstance(records, pd.DataFrame):
            records = _df_nan_to_none(records)
        payload = _records_to_jsonb(records)
        conn = _get_conn(autocommit=True)
        cursor = conn.cursor()
        print(f"Ingesting news sentiment: {len(json.loads(payload))} rows")
        cursor.execute("CALL clean_data.upsert_news_sentiment(%s::JSONB)", (payload,))
        print(f"News sentiment upserted.")
        return{"success": True, "message": "News sentiment upserted."}
    except Exception as e:
        print(f"Error ingesting news sentiment:{e}")
        return {"success":False, "message":str(e)}
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

def ingest_sentiment_summary(records):
    conn = None
    cursor = None
    try:
        if isinstance(records, pd.DataFrame):
            records = _df_nan_to_none(records)
        payload = _records_to_jsonb(records)
        conn = _get_conn(autocommit=True)
        cursor = conn.cursor()
        print(f"Ingesting sentiment summay: {len(json.loads(payload))} rows")
        cursor.execute("CALL analytics.upsert_sentiment_summary(%s::JSONB)", (payload,))
        print(f"Sentiment summay upserted.")
        return {"success": True, "message": "Sentiment summary upserted."}
    except Exception as e:
        print(f"Error ingesting sentiment summary: {e}")
        return {"success": False, "message": str(e)}
    finally:
        if cursor: cursor.close()
        if conn: conn.close()

def ingest_market_movers(records):
    conn = None
    cursor = None
    try:
        if isinstance(records, pd.DataFrame):
            records = _df_nan_to_none(records)
        payload = _records_to_jsonb(records)
        conn = _get_conn(autocommit=True)
        cursor = conn.cursor()
        print(f"Ingetsing market movers {len(json.loads(payload))} rows")
        cursor.execute("CALL analytics.upsert_market_movers(%s::JSONB)", (payload,))
        print(f"Market movers upserted.")
        return {"success":True, "message": "Market movers upserted."}
    except Exception as e:
        print(f"Error ingetsing market movers: {e}")
        return {"success":False, "message": str(e)}
    finally:
        if cursor: cursor.close()
        if conn: conn.close()