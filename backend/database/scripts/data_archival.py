"""
# file: data_archival.py
# description: This script archives data from the raw and clean data tables.
# Date: 02-08-2025
"""

from database.utils.db_pool import get_db_connection
import psycopg2
import os

# Archival rules for raw and clean data
ARCHIVAL_RULES = [
    ("raw_data.raw_prices_historic", "archive.raw_prices_historic", "recorded_at", 420),
    ("raw_data.raw_news", "archive.raw_news", "published_at", 180),
    ("raw_data.raw_social", "archive.raw_social", "posted_at", 180),
    #("raw_data.crypto_transactions", "archive.crypto_transactions", "timestamp", 180),
    ("clean_data.clean_prices_historic", "archive.clean_prices_historic", "recorded_at", 420),
    ("clean_data.clean_prices_realtime", "archive.clean_prices_realtime", "recorded_at", 30),
    ("clean_data.clean_news", "archive.clean_news", "published_at", 180),
    ("clean_data.clean_social", "archive.clean_social", "posted_at", 180),
    ("clean_data.stock_market_data", "archive.stock_market_data", "time_key", 120),
    #("analytics.news_sentiment", "archive.news_sentiment", "time_published", 180),
    ("analytics.finbert_coin_sentiment", "archive.finbert_coin_sentiment", "created_at", 180),
    ("analytics.market_level_sentiment", "archive.market_level_sentiment", "created_at", 180),
    ("analytics.forecasts", "archive.forecasts", "created_at", 180),
    #("analytics.sentiment_summary", "archive.news_sentiment_summary", "summary_date", 365),
    #("analytics.market_movers", "archive.market_movers", "data_date", 120),
]
TX_LEG_TABLES = {
    "senders": ("raw_data.crypto_tx_senders", "archive.crypto_tx_senders"),
    "receivers": ("raw_data.crypto_tx_receivers", "archive.crypto_tx_receivers"),
}

def _get_conn():
    return get_db_connection()

def _fetchone_bool(cur, query, params = None):
    cur.execute(query, params or ())
    row = cur.fetchone()
    if not row:
        return False
    val = list(row.values())[0] if isinstance(row, dict) else row[0]
    return bool(val)

def _has_timescaledb(cur):
    cur.execute("SELECT EXISTS (SELECT 1 FROEM pg_extension WHERE extname='timescaledb);")
    return cur.fetchone()[0]

def _is_hypertable(cur, schema, table):
    if not _has_timescaledb:
        return False
    cur.execute("""SELECT EXISTS (SELECT 1 FROM timescaledb_information.hypertables WHERE hypertable_schema = %s AND hypertable_name = %s); """, (schema, table))
    return cur.fetchone()[0]

def _split_qualified(name):
    parts = name.split(".")
    if len(parts) != 2:
        raise ValueError(f"Invalid qualified name:{name}")
    return parts[0], parts[1]

def _archive_standard(cur, source_table, archive_table, time_column, retention_days):
    insert_sql = f"""INSERT INTO {archive_table} SELECT * FROM {source_table} WHERE {time_column} < NOW() - INTERVAL '{retention_days} days'; """
    cur.execute(insert_sql)
    inserted = cur.rowcount

    delete_sql = f"""DELETE FROM {source_table} WHERE {time_column} <NOW()- INTERVAL'{retention_days} days';"""
    cur.execute(delete_sql)
    deleted = cur.rowcount
    return inserted, deleted

def _compress_archive(cur, archive_table):
    if not _has_timescaledb:
        return 0
    schema,table = _split_qualified(archive_table)
    if not _is_hypertable(cur, schema, table):
        return 0
    cur.execute(f"""SELECT compress_chunk(i) FROM show_chunk('{archive_table}', older_than => INTERVAL '7 days') i;""")    
    return cur.rowcount


# Function to archive and compress data
def archive_and_compress():
    conn = None
    cursor = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        #to find out the retention
        retention_map = {src: (arch, col, days) for src, arch, col, days in ARCHIVAL_RULES}

        # Iterate through archival rules
        for source_table, archive_table, time_column, retention_days in ARCHIVAL_RULES:
            try:
                print(f"Archiving {source_table} to {archive_table}")
                # Insert data into archive table
                insert_query = f"""
                    INSERT INTO {archive_table}
                    SELECT * FROM {source_table}
                    WHERE {time_column} < NOW() - INTERVAL '{retention_days} days';
                """
                cursor.execute(insert_query)
                print(f"Inserted {cursor.rowcount} rows into {archive_table}")

                print(f"Deleting data from {source_table}")
                # Delete data from source table
                delete_query = f"""
                    DELETE FROM {source_table}
                    WHERE {time_column} < NOW() - INTERVAL '{retention_days} days';
                """
                cursor.execute(delete_query)
                print(f"Deleted {cursor.rowcount} rows from {source_table}")

                print(f"Compressing chunks in {archive_table}")
                # Compress chunks
                compress_query = f"""
                    SELECT compress_chunk(i)
                    FROM show_chunks('{archive_table}', older_than => INTERVAL '7 days') i;
                """
                cursor.execute(compress_query)
                print(f"Compressed {cursor.rowcount} chunks in {archive_table}")

            except Exception as e:
                print(f"Error archiving {source_table}: {e}")
                conn.rollback()

        # Commit changes
        conn.commit()
        
        # tx_src = "raw_data.crypto_transaction"
        # if tx_src in retention_map:
        #     _, _, tx_time_col, tx_retention = retention_map[tx_src]
        #     print(f"Archicing crypto transaction leg using {tx_src}.{tx_time_col} retention {tx_retention}d")
        #     for label, (leg_src, leg_arc) in TX_LEG_TABLES.items():
        #         try:
        #             insert_leg_sql = f"""INSERT INTO {leg_arc} (id, transaction_hash, address, {'output_value' if 'senders' in leg_src else 'value'}) SELECT 1.id, 1.transaction_hash, 1.address, {'1.output_value' if 'senders' in leg_src else '1.value'} FROM {leg_src} 1 JOIN raw_data.crypto_transactions t ON t.hash = 1.transaction_hash WHERE t."{tx_time_col}" < NOW() - INTERVAL '{tx_retention} days';"""
        #             cursor.execute(insert_leg_sql)
        #             print(f" [{label}] inserted {cursor.rowcount} rows into {leg_arc}")

        #             delete_leg_sql = f"""DELETE FROM {leg_src} 1 USING raw_data.crypto_transactions t WHERE t.hash = 1.transaction_hash AND t."{tx_time_col}"< NOW() - INTERVAL '{tx_retention} days;'"""
        #             cursor.execute(delete_leg_sql)
        #             print(f" [{label}] deleted {cursor.rowcount} rows from {leg_src}")
        #         except Exception as e:
        #             print(f"[ERROR] legs {label}: {e}")
        #             conn.rollback()
        #         else:
        #             conn.commit()

        print("All archival and compression operations completed successfully.")

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

if __name__ == '__main__':
    archive_and_compress()