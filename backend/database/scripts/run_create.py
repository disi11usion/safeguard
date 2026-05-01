"""
# file: run_create.py
# description: This script connects to a PostgreSQL database and 
# runs a series of SQL scripts to create the necessary schema, 
# tables, hypertables, and indexes.
# Date: 26-06-2025
"""

import os
import psycopg2
import subprocess
import sys
from dotenv import load_dotenv
from urllib.parse import urlparse
from pathlib import Path
from training_data_news import data_insert


def _parse_admin_allowlist() -> list[str]:
    raw = os.getenv("ADMIN_USERS_ALLOWLIST", "")
    return [item.strip().lower() for item in raw.split(",") if item.strip()]


def apply_admin_allowlist_roles(conn):
    """
    Promote allowlisted usernames/emails to admin after schema init/migrations.
    """
    allowlist = _parse_admin_allowlist()
    if not allowlist:
        print("No ADMIN_USERS_ALLOWLIST configured; skipping admin role bootstrap.")
        return

    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE auth.users
            SET role = 'admin'
            WHERE role IS DISTINCT FROM 'admin'
              AND (
                LOWER(username) = ANY(%s)
                OR LOWER(email) = ANY(%s)
              )
            """,
            (allowlist, allowlist),
        )
    conn.commit()
    print(f"Applied admin allowlist bootstrap. Updated users: {len(allowlist)} key(s) checked.")

# Connect to the PostgreSQL database using the DATABASE_URL from .env file
def connect_db():
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    try:
        result = urlparse(database_url)
        conn = psycopg2.connect(
            host=result.hostname,
            port=result.port,
            dbname=str(result.path).lstrip('/'),
            user=result.username,
            password=result.password
        )
        print("Database connection established.")
        return conn
    except Exception as e:
        print(f"Error connecting to the database:\n{e}")
        return None

def _run_sql(cur, sql_text:str, fname: str):
    if not sql_text.strip():
        return
    print(f"Running {fname}...")
    cur.execute(sql_text)

def _read_file(path: Path) -> str:
    with path.open("r", encoding="utf-8") as f:
        return f.read()
    
def _ensure_extensions(conn):
    print(f"Ensuring required extensions...")
    with conn.cursor() as cur:
        try:
            cur.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
            cur.execute("CREATE EXTENSION IF NOT EXISTS timescaledb;")
            conn.commit()
            print(f"Extension ensured (pgcrypto, timescaledb).")
        except Exception as e:
            conn.rollback()
            print(f"Error ensuring extensions: \n{e}")
            raise
def _schema_exists(conn) -> bool:
    print(f"Checking if baseline schame exists...")
    with conn.cursor() as cur:
        try:
            cur.execute("""SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'auth' AND table_name = 'users');""")
            return cur.fetchone()[0]
        except Exception as e:
            conn.rollback()
            print(f"Error during schema check:\n{e}")
            return False

# Run the SQL scripts to create schema, tables, hypertables, and indexes
# Checks if the schema already exists before running the scripts
def run_schema(conn):

    base_dir = Path(__file__).resolve().parent
    schema_dir = (base_dir/ "../schema").resolve()

    if not schema_dir.exists():
        print(f"Schema directory not found: {schema_dir}")
        return
    if _schema_exists(conn):
        print("Schema already exists.")
        update_files = [
            "update_payment_plans.sql",
            "alter_20260117_influencer_admin.sql",
            "alter_20260216_referral_tracking.sql",
            "alter_20260216_influencer_codes.sql",
            "create_cache_schema.sql",       # L3 price snapshot table (idempotent)
            "alter_otp_persistence.sql",     # OTP/2FA persistence table (idempotent)
        ]
        for update_name in update_files:
            update_path = schema_dir / update_name
            if not update_path.exists():
                continue
            print(f"Applying update: {update_name}...")
            with conn.cursor() as cur:
                try:
                    _run_sql(cur, _read_file(update_path), update_path.name)
                    conn.commit()
                    print(f"Update applied: {update_name}.")
                except Exception as e:
                    conn.rollback()
                    print(f"Error applying update {update_name}:\n{e}")
        return
    _ensure_extensions(conn)
# Prepare the list of SQL files to run. Done manually so that order of execution is preserved
    ordered_core_files = [
        "create_schema.sql",
        "create_tables.sql",
        "alter_20260117_influencer_admin.sql",
        "alter_20260216_referral_tracking.sql",
        "alter_20260216_influencer_codes.sql",
        "create_cache_schema.sql",       # L3 price snapshot table (idempotent)
        "alter_otp_persistence.sql",     # OTP/2FA persistence table (idempotent)
        "create_hypertables.sql",
        "archive_schema.sql",
        "create_index.sql",
        "insert_data.sql",
    ]

    sql_paths = []
    for fname in ordered_core_files:
        p = schema_dir / fname
        if not p.exists():
            print(f"WARNING: expected core schema file not found: {p}")
        sql_paths.append(p)           
   
    # Execute each SQL file in a single transaction
    print("Executing create scripts...")
    with conn.cursor() as cur:
        try:
            for file_path in sql_paths:
                if not file_path.exists():
                    print(f"Skipping missing file: {file_path.name}")
                    continue
                _run_sql(cur, _read_file(file_path), file_path.name)

            data_insert(conn)
            conn.commit()
            print("All create scripts executed successfully in one transaction.")
        except Exception as e:
            conn.rollback()
            print(f"Error during script execution. Rolled back.\n{e}")


def run_procedures(conn):
    base_dir = Path(__file__).resolve().parent
    proc_dir = (base_dir/ "../procedures").resolve()

    if not proc_dir.exists():
        print(f"Procedure directory not found: {proc_dir}")
        return
    # Running the stored procedures to create the necessary functions
    print("Running stored procedures...")
    sql_files = sorted([p for p in proc_dir.iterdir() if p.suffix.lower() == ".sql"], key = lambda p: p.name)

    with conn.cursor() as cur:
        try:
            for p in sql_files:
                _run_sql(cur, _read_file(p), p.name)
            conn.commit()
            print("All stored procedures executed successfully.")
        except Exception as e:
            conn.rollback()
            print(f"Error during stored procedure execution. Rolled back.\n{e}")


def run_asset_preference_scripts():
    """
    Run asset preference initialization scripts to extend cryptocurrencies table
    and populate with default assets (15 cryptos + stocks/forex/futures)
    """
    base_dir = Path(__file__).resolve().parent
    
    # Define the scripts to run in order
    scripts = [
        "migrate_asset_preferences.py",
        "clean_and_reset_assets.py"
    ]
    
    print("\n" + "="*60)
    print("Running asset preference initialization scripts...")
    print("="*60)
    
    for script_name in scripts:
        script_path = base_dir / script_name
        
        if not script_path.exists():
            print(f"WARNING: Script not found: {script_path}")
            continue
        
        try:
            print(f"\nExecuting {script_name}...")
            # Run the script using subprocess
            result = subprocess.run(
                [sys.executable, str(script_path)],
                capture_output=True,
                text=True,
                cwd=str(base_dir)
            )
            
            # Print the output
            if result.stdout:
                print(result.stdout)
            
            if result.returncode != 0:
                print(f"ERROR: {script_name} failed with exit code {result.returncode}")
                if result.stderr:
                    print(f"Error output:\n{result.stderr}")
            else:
                print(f"✓ {script_name} completed successfully")
                
        except Exception as e:
            print(f"ERROR: Exception while running {script_name}:\n{e}")
    
    print("\n" + "="*60)
    print("Asset preference initialization completed")
    print("="*60 + "\n")

def ensure_influencer_support(conn):
    """
    Ensures influencer-related tables/columns exist even if DB was already initialized.
    Safe to run repeatedly.
    """
    with conn.cursor() as cur:
        cur.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM information_schema.tables
                WHERE table_schema='auth' AND table_name='influencer_codes'
            ) THEN
                CREATE TABLE auth.influencer_codes (
                    code TEXT PRIMARY KEY,
                    influencer_name TEXT,
                    is_active BOOLEAN DEFAULT TRUE,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW()
                );
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='auth' AND table_name='users' AND column_name='user_type'
            ) THEN
                ALTER TABLE auth.users ADD COLUMN user_type TEXT;
                UPDATE auth.users SET user_type='normal' WHERE user_type IS NULL;
                ALTER TABLE auth.users ALTER COLUMN user_type SET DEFAULT 'normal';
                ALTER TABLE auth.users ALTER COLUMN user_type SET NOT NULL;
                ALTER TABLE auth.users ADD CONSTRAINT users_user_type_check
                    CHECK (user_type IN ('normal','special'));
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.columns
                WHERE table_schema='auth' AND table_name='users' AND column_name='influencer_code'
            ) THEN
                ALTER TABLE auth.users ADD COLUMN influencer_code TEXT;
            END IF;

            IF NOT EXISTS (
                SELECT 1 FROM information_schema.table_constraints
                WHERE table_schema='auth' AND table_name='users'
                  AND constraint_type='FOREIGN KEY'
                  AND constraint_name='fk_users_influencer_code'
            ) THEN
                ALTER TABLE auth.users
                    ADD CONSTRAINT fk_users_influencer_code
                    FOREIGN KEY (influencer_code) REFERENCES auth.influencer_codes(code);
            END IF;
        END $$;
        """)
    conn.commit()

def run_stripe_tables(conn):
    """
    Create Stripe payment tables if they don't exist
    This runs independently of the main schema initialization
    """
    print("\n" + "="*60)
    print("Initializing Stripe payment tables...")
    print("="*60)
    
    base_dir = Path(__file__).resolve().parent
    schema_dir = (base_dir / "../schema").resolve()
    
    # Check if Stripe tables already exist
    with conn.cursor() as cur:
        try:
            cur.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'payments' 
                    AND table_name = 'plans'
                );
            """)
            stripe_tables_exist = cur.fetchone()[0]
            
            if stripe_tables_exist:
                print("✓ Stripe tables already exist, skipping creation")
                return
                
        except Exception as e:
            print(f"Error checking Stripe tables: {e}")
            conn.rollback()
    
    # Create Stripe tables
    stripe_sql_path = schema_dir / "stripe_tables.sql"
    
    if not stripe_sql_path.exists():
        print(f"⚠️  WARNING: {stripe_sql_path} not found")
        print("Creating Stripe tables inline...")
        
        # Inline SQL for Stripe tables
        stripe_sql = """
        -- Ensure payments schema exists
        CREATE SCHEMA IF NOT EXISTS payments;
        
        -- Stripe Plans Table
        CREATE TABLE IF NOT EXISTS payments.plans (
            plan_id BIGSERIAL PRIMARY KEY,
            plan_key TEXT UNIQUE NOT NULL,
            tier TEXT NOT NULL CHECK (tier IN ('free', 'basic', 'premium', 'enterprise')),
            billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('none', 'monthly', 'yearly')),
            price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
            currency TEXT NOT NULL DEFAULT 'USD',
            description TEXT,
            news_analysis_limit INTEGER DEFAULT -1,
            social_analysis_limit INTEGER DEFAULT -1,
            data_access TEXT CHECK (data_access IN ('basic', 'limited', 'full')),
            sentiment_analysis TEXT CHECK (sentiment_analysis IN ('none', 'limited', 'full')),
            api_access BOOLEAN DEFAULT FALSE,
            priority_support BOOLEAN DEFAULT FALSE,
            duration_days INTEGER,
            stripe_price_id TEXT,
            stripe_product_id TEXT,
            is_active BOOLEAN DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        
        -- Stripe Subscriptions Table
        CREATE TABLE IF NOT EXISTS payments.subscriptions (
            subscription_id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            plan_key TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled', 'pending', 'past_due')),
            start_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            end_at TIMESTAMPTZ,
            auto_renew BOOLEAN NOT NULL DEFAULT FALSE,
            stripe_subscription_id TEXT UNIQUE,
            stripe_customer_id TEXT,
            provider TEXT CHECK(provider IN ('mock', 'stripe', 'paypal')),
            provider_ref TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT fk_sub_user FOREIGN KEY (user_id) REFERENCES auth.users(user_id) ON DELETE CASCADE,
            CONSTRAINT fk_sub_plan FOREIGN KEY (plan_key) REFERENCES payments.plans(plan_key),
            CONSTRAINT chk_end_after_start CHECK (end_at IS NULL OR end_at > start_at)
        );
        
        -- Stripe Transactions Table
        CREATE TABLE IF NOT EXISTS payments.stripe_transactions (
            transaction_id BIGSERIAL PRIMARY KEY,
            user_id BIGINT NOT NULL,
            subscription_id BIGINT,
            plan_key TEXT,
            stripe_payment_intent_id TEXT UNIQUE,
            stripe_charge_id TEXT,
            amount_cents INTEGER NOT NULL,
            currency TEXT DEFAULT 'USD',
            status TEXT NOT NULL CHECK (status IN ('succeeded', 'pending', 'failed', 'refunded', 'created')),
            payment_method_type TEXT,
            card_brand TEXT,
            card_last4 TEXT,
            receipt_url TEXT,
            description TEXT,
            metadata JSONB,
            paid_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT fk_txn_user FOREIGN KEY (user_id) REFERENCES auth.users(user_id) ON DELETE CASCADE,
            CONSTRAINT fk_txn_subscription FOREIGN KEY (subscription_id) REFERENCES payments.subscriptions(subscription_id)
        );
        
        -- Stripe Webhook Events Table
        CREATE TABLE IF NOT EXISTS payments.stripe_webhook_events (
            event_id BIGSERIAL PRIMARY KEY,
            stripe_event_id TEXT UNIQUE NOT NULL,
            event_type TEXT NOT NULL,
            event_data JSONB NOT NULL,
            processed BOOLEAN DEFAULT FALSE,
            processed_at TIMESTAMPTZ,
            error_message TEXT,
            received_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        
        -- Indexes
        CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON payments.subscriptions(user_id);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON payments.subscriptions(stripe_subscription_id);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON payments.subscriptions(status);
        CREATE INDEX IF NOT EXISTS idx_stripe_txn_user_id ON payments.stripe_transactions(user_id);
        CREATE INDEX IF NOT EXISTS idx_stripe_txn_payment_intent ON payments.stripe_transactions(stripe_payment_intent_id);
        CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON payments.stripe_webhook_events(event_type);
        
        -- Insert default plans
        INSERT INTO payments.plans (
            plan_key, tier, billing_cycle, price_cents, currency, 
            description, news_analysis_limit, social_analysis_limit, 
            data_access, sentiment_analysis, api_access, priority_support, duration_days
        ) VALUES
        ('free', 'free', 'none', 0, 'USD', 
         'Free tier with basic features', 10, 5, 'basic', 'none', FALSE, FALSE, NULL),
        ('basic_monthly', 'basic', 'monthly', 999, 'USD', 
         'Basic Monthly - $9.99/month', 100, 50, 'limited', 'limited', FALSE, FALSE, 30),
        ('basic_yearly', 'basic', 'yearly', 9999, 'USD', 
         'Basic Yearly - $99.99/year (Save 17%)', 100, 50, 'limited', 'limited', FALSE, FALSE, 365),
        ('premium_monthly', 'premium', 'monthly', 1999, 'USD', 
         'Premium Monthly - $19.99/month', -1, -1, 'full', 'full', TRUE, TRUE, 30),
        ('premium_yearly', 'premium', 'yearly', 19999, 'USD', 
         'Premium Yearly - $199.99/year (Save 17%)', -1, -1, 'full', 'full', TRUE, TRUE, 365),
        ('enterprise', 'enterprise', 'monthly', 49999, 'USD', 
         'Enterprise - $499.99/month', -1, -1, 'full', 'full', TRUE, TRUE, 30)
        ON CONFLICT (plan_key) DO NOTHING;
        """
        
        with conn.cursor() as cur:
            try:
                cur.execute(stripe_sql)
                conn.commit()
                print("✓ Stripe tables created successfully")
            except Exception as e:
                conn.rollback()
                print(f"❌ Error creating Stripe tables: {e}")
                raise
    else:
        # Execute stripe_tables.sql from file
        with conn.cursor() as cur:
            try:
                _run_sql(cur, _read_file(stripe_sql_path), stripe_sql_path.name)
                conn.commit()
                print("✓ Stripe tables created from file")
            except Exception as e:
                conn.rollback()
                print(f"❌ Error executing {stripe_sql_path.name}: {e}")
                raise
    
    # Verify tables created
    with conn.cursor() as cur:
        cur.execute("""
            SELECT COUNT(*) FROM information_schema.tables 
            WHERE table_schema = 'payments' 
            AND table_name IN ('plans', 'subscriptions', 'stripe_transactions', 'stripe_webhook_events');
        """)
        table_count = cur.fetchone()[0]
        print(f"✓ Verified: {table_count}/4 Stripe tables created")
        
        # Show plans
        cur.execute("SELECT COUNT(*) FROM payments.plans;")
        plan_count = cur.fetchone()[0]
        print(f"✓ Verified: {plan_count} plans inserted")
    
    print("="*60)
    print("Stripe payment tables initialization completed")
    print("="*60 + "\n")




# Main function to connect to the database and run the scripts
if __name__ == "__main__":
    conn = connect_db()
    if conn:
        print("conn created")
        run_schema(conn)
        ensure_influencer_support(conn)
        apply_admin_allowlist_roles(conn)
        run_procedures(conn)
        data_insert(conn)
        
        # Run asset preference initialization scripts
        run_asset_preference_scripts()
        
        print("Scripts executed successfully.")
        conn.close()
