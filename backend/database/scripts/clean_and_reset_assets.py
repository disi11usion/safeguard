#!/usr/bin/env python3
"""
Script to clean up and reset asset preferences
docker compose -f docker-compose.dev.yml exec backend python3 /app/database/scripts/clean_and_reset_assets.py
"""
import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def clean_and_reset_assets():
    """Clean old crypto assets and insert the predefined 15 cryptos"""
    
    # Get database URL from environment
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set in environment")
        return False
    
    try:
        print("Connecting to database...")
        conn = psycopg2.connect(db_url)
        conn.autocommit = False
        cursor = conn.cursor()
        
        # Step 1: Check current counts
        print("\n=== Current Asset Counts ===")
        cursor.execute("""
            SELECT category, COUNT(*) as count 
            FROM reference.cryptocurrencies 
            GROUP BY category 
            ORDER BY category
        """)
        for category, count in cursor.fetchall():
            print(f"{category}: {count} assets")
        
        # Step 2: Deactivate all existing crypto assets (don't delete due to foreign key constraints)
        print("\n  Deactivating all existing crypto assets...")
        cursor.execute("""
            UPDATE reference.cryptocurrencies 
            SET is_active = FALSE,
                last_updated_at = NOW()
            WHERE category = 'crypto'
        """)
        deactivated_count = cursor.rowcount
        print(f"✓ Deactivated {deactivated_count} old crypto assets")
        
        # Step 3: Activate/Insert the 15 predefined cryptocurrencies from mock_preference_list.json
        print("\n Activating 15 predefined cryptocurrencies...")
        
        crypto_data = [
            ('BTC', 'bitcoin', 'Bitcoin'),
            ('ETH', 'ethereum', 'Ethereum'),
            ('USDT', 'tether', 'Tether'),
            ('BNB', 'binancecoin', 'BNB'),
            ('SOL', 'solana', 'Solana'),
            ('XRP', 'ripple', 'XRP'),
            ('USDC', 'usd-coin', 'USD Coin'),
            ('ADA', 'cardano', 'Cardano'),
            ('DOGE', 'dogecoin', 'Dogecoin'),
            ('TRX', 'tron', 'TRON'),
            ('TON', 'the-open-network', 'Toncoin'),
            ('LINK', 'chainlink', 'Chainlink'),
            ('AVAX', 'avalanche-2', 'Avalanche'),
            ('SHIB', 'shiba-inu', 'Shiba Inu'),
            ('DOT', 'polkadot', 'Polkadot'),
        ]
        
        for symbol_binance, symbol_coingecko, name in crypto_data:
            # Check if exists first
            cursor.execute("""
                SELECT crypto_id, is_active 
                FROM reference.cryptocurrencies 
                WHERE symbol_coingecko = %s OR symbol_binance = %s
            """, (symbol_coingecko, symbol_binance))
            
            existing = cursor.fetchone()
            
            if existing:
                # Update existing record
                crypto_id, is_active = existing
                if not is_active:
                    cursor.execute("""
                        UPDATE reference.cryptocurrencies
                        SET is_active = TRUE,
                            category = 'crypto',
                            name = %s,
                            symbol_binance = %s,
                            symbol_coingecko = %s,
                            last_updated_at = NOW()
                        WHERE crypto_id = %s
                    """, (name, symbol_binance, symbol_coingecko, crypto_id))
                    print(f"  ✓ Activated: {name} ({symbol_binance})")
                else:
                    print(f"  → Already active: {name} ({symbol_binance})")
            else:
                # Insert new record
                cursor.execute("""
                    INSERT INTO reference.cryptocurrencies 
                    (symbol_binance, symbol_coingecko, name, category, is_active)
                    VALUES (%s, %s, %s, 'crypto', TRUE)
                """, (symbol_binance, symbol_coingecko, name))
                print(f"  ✓ Inserted: {name} ({symbol_binance})")
        
        # Step 4: Verify final counts (active only)
        print("\n=== Final Active Asset Counts ===")
        cursor.execute("""
            SELECT category, COUNT(*) as count 
            FROM reference.cryptocurrencies 
            WHERE is_active = TRUE
            GROUP BY category 
            ORDER BY category
        """)
        
        results = cursor.fetchall()
        for category, count in results:
            print(f"{category}: {count} assets")
        
        # Show inactive count
        cursor.execute("""
            SELECT COUNT(*) as count 
            FROM reference.cryptocurrencies 
            WHERE is_active = FALSE
        """)
        inactive_count = cursor.fetchone()[0]
        print(f"\nInactive (historical): {inactive_count} assets")
        
        # Step 5: Ensure stocks, forex, and futures are active
        print("\n Ensuring stocks, forex, and futures are active...")
        cursor.execute("""
            UPDATE reference.cryptocurrencies
            SET is_active = TRUE,
                last_updated_at = NOW()
            WHERE category IN ('stock', 'forex', 'futures')
            AND is_active = FALSE
        """)
        activated_count = cursor.rowcount
        if activated_count > 0:
            print(f"✓ Activated {activated_count} stock/forex/futures assets")
        else:
            print("✓ All stock/forex/futures assets already active")
        
        # Step 6: Show summary by category
        print("\n=== Asset Summary by Category ===")
        cursor.execute("""
            SELECT category, COUNT(*) as count
            FROM reference.cryptocurrencies
            WHERE is_active = TRUE
            GROUP BY category
            ORDER BY category
        """)
        for category, count in cursor.fetchall():
            print(f"  {category}: {count} assets")
        
        conn.commit()
        print("\n Asset cleanup and reset completed successfully!")
        
        cursor.close()
        conn.close()
        return True
        
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
    print("=" * 60)
    print("Asset Cleanup and Reset Script")
    print("=" * 60)
    print("This will:")
    print("1. Deactivate all existing crypto assets")
    print("2. Activate 15 predefined cryptocurrencies from mock list")
    print("3. Ensure stocks (15), forex (15), and futures (1) are active")
    print("\nNote: Old crypto data is kept for historical records but marked inactive")
    print("\n" + "=" * 60)
    
    success = clean_and_reset_assets()
    exit(0 if success else 1)
