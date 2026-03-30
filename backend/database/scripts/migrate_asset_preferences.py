#!/usr/bin/env python3
"""
Script to extend the cryptocurrencies table to support all asset types
Run this script to add stocks, forex, and futures to the database
docker compose -f docker-compose.dev.yml exec backend python3 /app/database/scripts/migrate_asset_preferences.py
"""
import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def run_migration():
    """Execute the SQL migration script"""
    
    # Get database URL from environment
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set in environment")
        return False
    
    # Read the SQL migration file
    sql_file_path = os.path.join(
        os.path.dirname(__file__),
        "../schema/extend_cryptocurrencies_for_assets.sql"
    )
    
    try:
        with open(sql_file_path, 'r') as f:
            sql_script = f.read()
        
        print("Connecting to database...")
        conn = psycopg2.connect(db_url)
        conn.autocommit = False
        cursor = conn.cursor()
        
        print("Executing migration script...")
        cursor.execute(sql_script)
        
        # Verify the results
        cursor.execute("""
            SELECT category, COUNT(*) as count 
            FROM reference.cryptocurrencies 
            GROUP BY category 
            ORDER BY category
        """)
        
        results = cursor.fetchall()
        print("\n=== Migration Results ===")
        for category, count in results:
            print(f"{category}: {count} assets")
        
        conn.commit()
        print("\n✅ Migration completed successfully!")
        
        cursor.close()
        conn.close()
        return True
        
    except FileNotFoundError:
        print(f"ERROR: SQL file not found at {sql_file_path}")
        return False
    except psycopg2.Error as e:
        print(f"ERROR: Database error: {e}")
        if conn:
            conn.rollback()
        return False
    except Exception as e:
        print(f"ERROR: Unexpected error: {e}")
        if conn:
            conn.rollback()
        return False
    finally:
        if 'cursor' in locals() and cursor:
            cursor.close()
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    print("=" * 50)
    print("Asset Preference Migration Script")
    print("=" * 50)
    print("\nThis will extend the cryptocurrencies table to support:")
    print("- Cryptocurrencies (existing)")
    print("- US Stocks (15 items)")
    print("- Forex Pairs (15 items)")
    print("- Metal Futures (1 item)")
    print("\n" + "=" * 50)
    
    success = run_migration()
    exit(0 if success else 1)
