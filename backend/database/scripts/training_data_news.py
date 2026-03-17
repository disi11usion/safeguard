"""
# file: training_data_news.py
# description: This script inserts historic news for training into the database 
# Date: 20-08-2025
"""
import os
import sys
import csv

EXPECTED_FIELDS = ["title", "description", "newDatetime", "url","coins","coin"]

def _open_csv_as_dict_rows(csv_path):
    with open(csv_path, "r", encoding="utf-8", newline="") as f:
        sample = f.read(2048)
        f.seek(0)
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
        except Exception:
            dialect = csv.excel
        has_header = False
        try:
            has_header = csv.Sniffer().has_header(sample)
        except Exception:
            pass
        if has_header:
            reader = csv.DictReader(f, dialect=dialect)
            for row in reader:
                yield dict(row)
        else:
            reader = csv.reader(f, dialect=dialect)
            for row in reader:
                row = list(row)
                row += [""] * (len(EXPECTED_FIELDS) - len(row))
                yield {
                    "title": row[0] if len(row) > 0 else "",
                    "description": row[1] if len(row) >1 else "",
                    "newsDatetime": row[2] if len(row) >2 else "",
                    "url": row[3] if len(row) >3 else "",
                    "coins": row[4] if len(row) >4 else "",
                    "coin": row[5] if len(row)>5 else "",
                }

def data_insert(conn):
    
    print("Inserting training news data...")

    # Check if the connection object is valid
    if conn is None:
        print("Invalid conn")
        return
    cursor = None
    try:
        cursor = conn.cursor()

        # Set the timezone to UTC for consistency
        cursor.execute("SET TIME ZONE 'UTC';")

        script_dir = os.path.dirname(os.path.abspath(__file__))
        csv_path = os.path.join(script_dir, 'training_data_news.csv')
        if not os.path.exists(csv_path):
            sys.exit(f"CSV file not found at {csv_path}")

        # sql code to insert data into the table
        insert_sql = """
            INSERT INTO clean_data.training_data_news (
                title, description, news_datetime, url,
                coin_symbol, coin_name
            ) VALUES (
                %(title)s, %(description)s, %(news_datetime)s, %(url)s,
                %(coin_symbol)s, %(coin_name)s
            )
            ON CONFLICT DO NOTHING;
        """
        inserted = 0
        # insert each row into the database
        for row in _open_csv_as_dict_rows(csv_path):
            title = (row.get("title") or "").strip()
            url = (row.get("url") or "").strip()
            if not title or not url:
                continue

            payload = {
                'title':         title,
                'description':   (row.get("description") or "").strip() or None,
                'news_datetime': (row.get("newsDatetime") or row.get("news_datetime") or "").strip() or None,
                'url':           url,
                'coin_symbol':   (row.get("coins") or row.get("coin_symbol") or "").strip() or None,
                'coin_name':     (row.get("coin") or row.get("coin_name") or "").strip() or None,
            }

            try:
                # Using savepoint for each row to allow partial success
                cursor.execute("SAVEPOINT row_sp;")
                cursor.execute(insert_sql, payload)
                cursor.execute("RELEASE SAVEPOINT row_sp;")
                inserted += cursor.rowcount if cursor.rowcount else 0
            except Exception as e:
                # Rollback to the savepoint if an error occurs for current row
                print(e)
                cursor.execute("ROLLBACK TO SAVEPOINT row_sp;")
        conn.commit()
        print(f"Training news seed completed. Inserted/kept rows: {inserted}")

    except Exception as e:
        if conn:
            conn.rollback()
        # Print any errors that occur during the process
        print(f"Error inserting training news data: {e}")
    finally:
        if cursor:
            cursor.close()