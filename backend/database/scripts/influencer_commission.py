from database.utils.db_pool import get_db_connection
import os
import psycopg2
from psycopg2.extras import RealDictCursor

DEFAULT_RATE = 0.30

def _conn():
    db = os.getenv("DATABASE_URL")
    if not db:
        raise RuntimeError("DATABASE_URL missing")
    return get_db_connection()

def record_paid_order_and_apply_commission(
    *,
    buyer_user_id: int,
    provider_payment_id: int,   # THIS IS stripe_transactions.id
    amount_cents: int,
    commission_rate: float = 0.30,
):
    conn = _conn()
    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:

            # 1) GET TRANSACTION + CODE
            cur.execute("""
                SELECT id, influencer_code, amount_cents
                FROM payments.stripe_transactions
                WHERE id = %s
            """, (provider_payment_id,))

            tx = cur.fetchone()
            if not tx:
                return {"success": False, "message": "No transaction"}

            code = tx["influencer_code"]
            if not code:
                return {"success": True, "note": "no code"}

            # 2) CALC
            gross = tx["amount_cents"]
            commission_cents = int(round(gross * commission_rate))

            # 3) INSERT COMMISSION
            cur.execute("""
                INSERT INTO payments.influencer_commissions
                (
                  stripe_transaction_id,
                  influencer_code,
                  commission_base_cents,
                  commission_rate,
                  commission_cents,
                  status
                )
                VALUES (%s,%s,%s,%s,%s,'pending')
                ON CONFLICT (stripe_transaction_id)
                DO NOTHING
                RETURNING commission_id;
            """, (
                tx["id"],
                code,
                gross,
                commission_rate,
                commission_cents
            ))

            conn.commit()
            return {"success": True}

    except Exception as e:
        conn.rollback()
        return {"success": False, "message": str(e)}