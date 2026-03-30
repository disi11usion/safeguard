import os
import psycopg2
from psycopg2.pool import ThreadedConnectionPool
from contextlib import contextmanager
from application.helper.logging import setup_logging

logger = setup_logging()
pool = None

def init_pool():
    global pool
    if pool is None:
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            raise RuntimeError("DATABASE_URL environment variable is not set")
        
        # Adjust min connection and max connection as needed based on environment
        minconn = int(os.getenv("DB_POOL_MINCONN", "1"))
        maxconn = int(os.getenv("DB_POOL_MAXCONN", "20"))
        
        pool = ThreadedConnectionPool(minconn, maxconn, dsn=database_url)
        logger.info(f"✅ Initialized ThreadedConnectionPool (min={minconn}, max={maxconn})")

def get_pool():
    if pool is None:
        init_pool()
    return pool

def get_conn():
    p = get_pool()
    return p.getconn()

def release_conn(conn):
    if pool and conn:
        pool.putconn(conn)

@contextmanager
def get_cursor(cursor_factory=None):
    """
    Context manager that yields a database cursor.
    Usage:
        with get_cursor() as cur:
            cur.execute(...)
            # changes are automatically committed if no exception occurs
    """
    conn = get_conn()
    try:
        # yield cursor
        cur = conn.cursor(cursor_factory=cursor_factory)
        try:
            yield cur
        finally:
            cur.close()
        # commit if no exceptions
        conn.commit()
    except Exception:
        # rollback on exception
        conn.rollback()
        raise
    finally:
        release_conn(conn)
