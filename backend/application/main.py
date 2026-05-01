from fastapi import FastAPI, HTTPException, Query, Body, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, Optional
from pydantic import BaseModel
import json
from pathlib import Path
import os
from dotenv import load_dotenv
from datetime import datetime, timedelta, timezone
import asyncio
import re
from presentation import routes
import psycopg2
from psycopg2.extras import RealDictCursor
import httpx
from database.scripts import influencer_commission
from database.scripts import user_auth
import time
import uuid
import os
from application.helper.logging import setup_logging, log_request, log_response, log_error
from database.db_pool import init_pool
from application.clients.polygon_client import PolygonClient
from application.clients.twelvedata_client import TwelveDataClient
from application.clients.correlation import CorrelationAnalyzer
from application.clients.chatgpt_client import ChatGPTClient, ChatGPTRequest, ChatMessagesRequest
from application.clients.chat_logic import generate_chat_reply_new, handle_landing_chat
from application.clients.deepseek_client import DeepSeekClient
from application.clients.whale_tracking import BlockCypherClient
from application.clients.news_sentiment import NewsSentimentClient
from application.clients.social_sentiment import SocialSentimentClient, _score_text
from application.clients.reddit import RedditAPIClient
from application.clients.government_client import get_government_client
from database.scripts import data_request


from application.services.market_shake import MarketShakeService
from application.services import stress_engine
from application.cache.price_cache import price_cache, PriceEntry
from application.cache.price_queue import PriceRefreshQueue

logger = setup_logging()
load_dotenv(dotenv_path='../../.env')

tags_metadata = [
    {"name": "Chat AI Models", "description": "AI models for chat, sentiment analysis and forecasting."},
    {"name": "Whale", "description": "Whale tracking and large transaction analytics."},
    {"name": "News", "description": "News sentiment and analytics for all asset types."},
    {"name": "Reddit", "description": "Reddit data ingestion and analytics."},
]

app = FastAPI(title="Safeguard AI Investment Assistant API", version="1.0", openapi_tags=tags_metadata)

@app.on_event("startup")
async def on_startup():
    init_pool()
    ensure_disclaimer_table_exists()
    ensure_user_portfolio_assets_table_exists()
    # Initialize price cache (connect to Redis; falls back to in-process L1-only mode if unavailable)
    await price_cache.initialize()
    # Start price refresh queue (3 worker coroutines)
    await refresh_queue.start()
    # Warm up social sentiment cache in the background at startup to avoid timeout on first request
    asyncio.create_task(_warmup_social_sentiment_cache())


@app.on_event("shutdown")
async def on_shutdown():
    await refresh_queue.stop()
    await price_cache.close()


async def _warmup_social_sentiment_cache():
    """Pre-compute social sentiment once in the background at startup and store the result in cache.
    This ensures the first user request hits the cache instead of timing out."""
    try:
        await asyncio.sleep(5)  # Wait for the database connection to be ready
        logger.info("🔥 [Warmup] Starting social sentiment cache warmup...")
        now = datetime.now(timezone.utc)
        start_dt = now - timedelta(hours=24)
        end_dt = now
        effective_limit = 100
        posts_df = await asyncio.to_thread(
            data_request.get_social_posts,
            start_time=start_dt,
            end_time=end_dt,
            limit=effective_limit
        )
        if posts_df is not None and not posts_df.empty:
            posts = posts_df.to_dict(orient="records")
            cache_key = (start_dt.isoformat(), end_dt.isoformat(), effective_limit, len(posts))
            await asyncio.to_thread(
                social_sentiment_client.summarize_posts,
                posts,
                cache_key
            )
            logger.info(f"✅ [Warmup] Social sentiment cache warmed up with {len(posts)} posts.")
        else:
            logger.warning("⚠️ [Warmup] No social posts found for warmup window.")
    except Exception as e:
        logger.warning(f"⚠️ [Warmup] Social sentiment warmup failed (non-critical): {e}")
    
origins_env = os.getenv("FRONTEND_ORIGINS", "")
origins = [origin.strip() for origin in origins_env.split(",") if origin.strip()]
if not origins:
    origins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
    ]
USE_STRIPE_MOCK = os.getenv("STRIPE_MOCK", "FALSE").lower() == "true"



@app.middleware("http")
async def log_all_requests(request: Request, call_next):
    start_time = time.time()

    # Log incoming request
    logger.info(
        f"🌐 REQUEST → {request.method} {request.url.path}"
        f" | query={dict(request.query_params)}"
    )

    response = await call_next(request)

    duration = round((time.time() - start_time) * 1000, 2)

    # Log response
    logger.info(
        f"✅ RESPONSE ← {request.method} {request.url.path}"
        f" | status={response.status_code}"
        f" | {duration}ms"
    )

    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=r"^https?://(localhost|127\\.0\\.0\\.1)(:\\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

polygon_client = PolygonClient()
twelvedata_client = TwelveDataClient()
correlation_analyzer = CorrelationAnalyzer()
chatgpt_client = ChatGPTClient()
deepseek_client = DeepSeekClient()
blockcypher_client = BlockCypherClient()
news_client = NewsSentimentClient()
social_sentiment_client = SocialSentimentClient()
reddit_client = RedditAPIClient()
market_shake_service = MarketShakeService()

DATABASE_URL = os.getenv("DATABASE_URL")
USING_MOCK_DATA = os.getenv('USING_MOCK_DATA', 'FALSE').upper() == 'TRUE'

# ── Asset-type mapping (cache key prefix → asset_type) ────────────────────
_MARKET_TO_ASSET_TYPE = {
    "crypto":  "crypto",
    "stocks":  "stock",
    "forex":   "forex",
    "fx":      "forex",
    "futures": "futures",
}


# ── Background refresh function (called by queue workers) ─────────────────
async def _refresh_price_fn(cache_key: str) -> None:
    """
    Dispatch a refresh task for the given cache_key.
    Cache key conventions:
        market_list:{market}                         – top-50 list for a market
        market_summary:{ticker}:{market}:{days}      – single-ticker indicators
    Always releases the refresh lock in a finally block.
    """
    try:
        if cache_key.startswith("market_list:"):
            market = cache_key.split(":", 1)[1]
            if market == "futures":
                futures_data_path = os.path.join(
                    os.path.dirname(__file__), "../_lib/mock_list_futures.json"
                )
                with open(futures_data_path, "r", encoding="utf-8") as f:
                    futures_data = json.load(f)
                futures_list = futures_data.get("futures", [])
                items = await twelvedata_client.process_futures_list(futures_list)
                data = {"success": True, "market": market, "count": len(items), "data": items}
            else:
                market_mapping = {"crypto": "crypto", "forex": "fx", "stocks": "stocks"}
                api_market = market_mapping.get(market, market)
                data = await polygon_client.get_comprehensive_market_data(api_market, limit=50)

        elif cache_key.startswith("market_summary:"):
            _, ticker, market, days_str = cache_key.split(":", 3)
            api_market = "forex" if market == "futures" else market
            data = await polygon_client.get_market_summary_with_indicators(
                ticker=ticker, market=api_market, days=int(days_str)
            )
        else:
            logger.warning(f"[PriceRefresh] Unknown cache_key pattern: '{cache_key}'")
            return

        asset_type = _MARKET_TO_ASSET_TYPE.get(
            cache_key.split(":")[1] if ":" in cache_key else "default", "default"
        )
        await price_cache.set(cache_key, asset_type, data)

        # Persist to L3 (PostgreSQL cache.price_snapshot) in a thread
        await asyncio.to_thread(_upsert_price_snapshot, cache_key, asset_type, data)
        logger.info(f"[PriceRefresh] Refreshed '{cache_key}'")

    except Exception as exc:
        logger.error(f"[PriceRefresh] Error refreshing '{cache_key}': {exc}")
    finally:
        await price_cache.release_refresh(cache_key)


def _upsert_price_snapshot(cache_key: str, asset_type: str, data: Any) -> None:
    """Write/update L3 price snapshot in PostgreSQL (blocking, run in thread)."""
    try:
        with get_cursor() as cur:
            cur.execute(
                """
                INSERT INTO cache.price_snapshot (cache_key, asset_type, data, last_updated_at)
                VALUES (%s, %s, %s::jsonb, NOW())
                ON CONFLICT (cache_key) DO UPDATE
                    SET data = EXCLUDED.data,
                        last_updated_at = EXCLUDED.last_updated_at
                """,
                (cache_key, asset_type, json.dumps(data)),
            )
    except Exception as exc:
        logger.warning(f"[PriceRefresh] L3 DB write failed for '{cache_key}': {exc}")


async def _read_l3_snapshot(cache_key: str) -> Optional[dict]:
    """Read from PostgreSQL cache.price_snapshot (cold-start fallback)."""
    def _query():
        try:
            with get_cursor() as cur:
                cur.execute(
                    "SELECT data, last_updated_at FROM cache.price_snapshot WHERE cache_key = %s",
                    (cache_key,),
                )
                return cur.fetchone()
        except Exception:
            return None

    row = await asyncio.to_thread(_query)
    return row  # (data_dict, last_updated_at) or None


# ── Cache-first helper ─────────────────────────────────────────────────────
async def _cache_first(cache_key: str, asset_type: str, fetch_fn) -> Any:
    """
    Universal cache-first read with background refresh.

    Flow:
      1. L1/L2 fresh hit  → return immediately
      2. L1/L2 stale      → enqueue refresh (if not already running)
                            → return stale data
      3. Cold start        → try L3 (DB snapshot)
                            → if still nothing, call fetch_fn() directly
    """
    entry = await price_cache.get(cache_key)

    if entry and price_cache.is_fresh(entry):
        return entry.data

    # Enqueue background refresh (deduplicated)
    if not price_cache.is_refreshing(cache_key):
        claimed = await price_cache.claim_refresh(cache_key)
        if claimed:
            await refresh_queue.enqueue(cache_key)

    # Return stale L1/L2 data while refresh runs
    if entry:
        return entry.data

    # Cold start: try L3 DB snapshot first
    row = await _read_l3_snapshot(cache_key)
    if row:
        data, updated_at = row
        await price_cache.set(cache_key, asset_type, data)
        return data

    # Truly cold: block on a direct API call
    data = await fetch_fn()
    await price_cache.set(cache_key, asset_type, data)
    return data


# ── Refresh queue (forward-declared here; started in on_startup) ───────────
refresh_queue = PriceRefreshQueue(refresh_fn=_refresh_price_fn, num_workers=3)


def classify_social_item_sentiment(score: float) -> str:
    if score > 0.15:
        return "positive"
    if score < -0.15:
        return "negative"
    return "neutral"

from database.db_pool import get_conn, release_conn, get_cursor

def get_db_conn():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL not set")
    return get_conn()

DISCLAIMER_ACCEPTANCES_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS disclaimer_acceptances (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL,
  disclaimer_version TEXT NOT NULL,
  disclaimer_hash TEXT NOT NULL,
  country TEXT,
  accepted BOOLEAN DEFAULT TRUE,
  accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_id INTEGER NULL
);
"""

def ensure_disclaimer_table_exists():
    conn = None
    cur = None
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(DISCLAIMER_ACCEPTANCES_TABLE_SQL)
        conn.commit()
        logger.info("✅ Ensured disclaimer_acceptances table exists")
    except Exception as e:
        logger.error(f"❌ Failed ensuring disclaimer_acceptances table: {e}")
        # Don’t crash startup; but you can choose to raise if you want hard-fail
    finally:
        if cur:
            cur.close()
        if conn:
            release_conn(conn)


USER_PORTFOLIO_ASSETS_TABLE_SQL = """
CREATE TABLE IF NOT EXISTS auth.user_portfolio_assets (
    asset_id      BIGSERIAL PRIMARY KEY,
    user_id       BIGINT NOT NULL REFERENCES auth.users(user_id) ON DELETE CASCADE,
    symbol        TEXT NOT NULL,
    name          TEXT,
    category      TEXT NOT NULL DEFAULT 'stock',
    weight        NUMERIC(8, 4) NOT NULL DEFAULT 0,
    entry_price   NUMERIC(18, 6),
    current_price NUMERIC(18, 6),
    risk          TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_portfolio_assets_user_id
    ON auth.user_portfolio_assets(user_id);
ALTER TABLE auth.user_portfolio_assets
    DROP CONSTRAINT IF EXISTS user_portfolio_assets_weight_range;
ALTER TABLE auth.user_portfolio_assets
    ADD CONSTRAINT user_portfolio_assets_weight_range
    CHECK (weight >= 0 AND weight <= 100);
"""

def ensure_user_portfolio_assets_table_exists():
    conn = None
    cur = None
    try:
        conn = get_db_conn()
        cur = conn.cursor()
        cur.execute(USER_PORTFOLIO_ASSETS_TABLE_SQL)
        conn.commit()
        logger.info("✅ Ensured auth.user_portfolio_assets table exists")
    except Exception as e:
        logger.error(f"❌ Failed ensuring auth.user_portfolio_assets table: {e}")
    finally:
        if cur:
            cur.close()
        if conn:
            release_conn(conn)


@app.get("/")
async def root():
    endpoint = "GET /"
    log_request(logger, endpoint, {})
    response = {"message": "Stock Correlation API", "version": "1.0", "timestamp": datetime.now().isoformat()}
    log_response(logger, endpoint, response)
    return response


@app.get("/api/market-shake/summary")
async def get_market_shake_summary():
    endpoint = "GET /api/market-shake/summary"
    log_request(logger, endpoint, {})
    try:
        result = market_shake_service.get_summary()
        log_response(logger, endpoint, {"assets_count": len(result.get("assets", []))}, success=True)
        return result
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/market-shake/events")
async def get_market_shake_events(
    scope: str = Query("single", description="single | combined"),
    asset: str = Query("Bitcoin", description="Asset name. Used only in single mode."),
    topN: int = Query(5, ge=1, le=50),
    window: int = Query(126, ge=5, le=1000),
    mergeGap: int = Query(180, ge=0, le=2000),
    combinedBaseline: str = Query("normalized", description="combined baseline: normalized | geomean"),
):
    endpoint = "GET /api/market-shake/events"
    params = {
        "scope": scope,
        "asset": asset,
        "topN": topN,
        "window": window,
        "mergeGap": mergeGap,
        "combinedBaseline": combinedBaseline,
    }
    log_request(logger, endpoint, params)
    try:
        normalized_scope = scope.lower()
        if normalized_scope not in {"single", "combined"}:
            raise HTTPException(status_code=400, detail="Invalid scope. Must be 'single' or 'combined'.")
        baseline = combinedBaseline.lower()
        if baseline not in {"normalized", "geomean"}:
            raise HTTPException(status_code=400, detail="Invalid combinedBaseline. Must be 'normalized' or 'geomean'.")

        result = market_shake_service.get_events(
            scope=normalized_scope,
            asset=asset if normalized_scope == "single" else "Bitcoin",
            top_n=topN,
            window=window,
            merge_gap=mergeGap,
            combined_baseline=baseline,
        )
        log_response(
            logger,
            endpoint,
            {"series_count": len(result.get("series", [])), "events_count": len(result.get("events", []))},
            success=True,
        )
        return result
    except ValueError as ve:
        log_error(logger, endpoint, ve)
        raise HTTPException(status_code=400, detail=str(ve))
    except HTTPException:
        raise
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/correlation")
async def calculate_correlation(request: Dict[str, Any] = Body(...)):
    """
    Calculate correlation matrix for given symbols with pre-fetched stock data
    """
    endpoint = "POST /api/correlation"
    params = {
        "symbols": request.get("symbols", []),
        "start_date": request.get("start_date"),
        "end_date": request.get("end_date"),
        "data_points": sum(len(data) for data in request.get("stock_data", {}).values())
    }
    log_request(logger, endpoint, params)
    
    try:
        symbols = request.get("symbols", [])
        raw_stock_data = request.get("stock_data", {})
        start_date = request.get("start_date")
        end_date = request.get("end_date")
        
        if not symbols or not raw_stock_data:
            raise HTTPException(status_code=400, detail="symbols and stock_data are required")
        
        formatted_stock_data = {}
        for symbol, data_points in raw_stock_data.items():
            formatted_data = []
            for item in data_points:
                formatted_data.append({
                    'date': datetime.fromtimestamp(item['t'] / 1000).strftime('%Y-%m-%d') if 't' in item else item.get('timestamp'),
                    'open': item.get('o', item.get('open')),
                    'high': item.get('h', item.get('high')),
                    'low': item.get('l', item.get('low')),
                    'close': item.get('c', item.get('close', item.get('price'))),
                    'volume': item.get('v', item.get('volume')),
                    'timestamp': item.get('t', item.get('timestamp'))
                })
            formatted_stock_data[symbol] = formatted_data
        
        # Calculate correlation matrix
        correlation_result = correlation_analyzer.calculate_correlation_matrix(formatted_stock_data)
        correlation_result["symbols"] = symbols
        correlation_result["period"] = f"{start_date} to {end_date}" if start_date and end_date else "N/A"
        
        log_response(logger, endpoint, correlation_result, success=True)
        return correlation_result
    except HTTPException:
        raise
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/stock/{symbol}")
async def get_stock_data(symbol: str, start_date: str, end_date: str):
    """Get historical data for a single stock"""
    endpoint = f"GET /api/stock/{symbol}"
    params = {"symbol": symbol, "start_date": start_date, "end_date": end_date}
    log_request(logger, endpoint, params)
    
    try:
        data = await polygon_client.get_single_stock_data(symbol, start_date, end_date)
        response = {"symbol": symbol, "data": data}
        log_response(logger, endpoint, response)
        return response
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/historical/ticker")
async def get_unified_historical_data(
    ticker: str = Query(..., description="Ticker symbol (e.g., BTCUSD, X:BTCUSD, AAPL, C:EURUSD)"),
    start_date: str = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: str = Query(..., description="End date (YYYY-MM-DD)"),
    market: str = Query(..., description="Market type: crypto, stocks, forex"),
    timespan: str = Query("day", description="Time interval (default: day)")
):
    """
    Get unified historical OHLCV data for crypto/stock/forex.
    Automatically adds market-specific prefixes (X: for crypto, C: for forex) if not present.
    """
    endpoint = "GET /api/historical/ticker"
    log_request(logger, endpoint, {"ticker": ticker, "start_date": start_date, "end_date": end_date, "market": market})
    
    try:
        if market not in ["crypto", "stocks", "forex"]:
            raise HTTPException(status_code=400, detail="Invalid market type. Must be 'crypto', 'stocks', or 'forex'")
        
        result = await polygon_client.get_unified_historical_data(ticker, start_date, end_date, market, timespan)
        log_response(logger, endpoint, result, success=result.get("success", False))
        
        if not result.get("success"):
            raise HTTPException(status_code=404, detail=result.get("error", "Failed to fetch historical data"))
        
        return result
    
    except HTTPException:
        raise
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/mock/scenarios")
async def get_mock_scenarios():
    endpoint = "GET /api/mock/scenarios"
    log_request(logger, endpoint, {})
    
    try:
        if not USING_MOCK_DATA:
            return {
                "success": False,
                "message": "Mock data mode is not enabled. Set USING_MOCK_DATA=TRUE in .env",
                "scenarios": []
            }
        
        mock_data_dir = Path(__file__).parent.parent / "_lib"
        index_path = mock_data_dir / "mock_data_index.json"
        
        if not index_path.exists():
            raise HTTPException(status_code=404, detail="Mock data index not found")
        
        with open(index_path, 'r', encoding='utf-8') as f:
            index_data = json.load(f)
        
        log_response(logger, endpoint, {"scenarios_count": len(index_data.get("scenarios", []))}, success=True)
        
        return {
            "success": True,
            "using_mock_data": USING_MOCK_DATA,
            "info": index_data.get("mock_data_info", ""),
            "usage": index_data.get("usage", ""),
            "total_datasets": index_data.get("total_datasets", 0),
            "scenarios": index_data.get("scenarios", [])
        }
    
    except HTTPException:
        raise
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))

class TickerNormalizerRequest(BaseModel):
    text: str

@app.post("/api/deepseek/tickernormalizer", tags=["Chat AI Models"])
async def normalize_tickers(request: TickerNormalizerRequest):
    """
    Extract and normalize stock/crypto tickers from natural language text
    """
    endpoint = "POST /api/deepseek/tickernormalizer"
    params = {"text": request.text[:100] + "..." if len(request.text) > 100 else request.text}
    log_request(logger, endpoint, params)
    
    try:
        result = await deepseek_client.normalize_tickers(request.text)
        log_response(logger, endpoint, {"tickers": result["tickers"], "count": result["count"]}, success=True)
        return result
        
    except httpx.HTTPStatusError as e:
        error_msg = f"Third-party API error: {e.response.status_code}"
        log_error(logger, endpoint, error_msg)
        raise HTTPException(status_code=502, detail=error_msg)
    except httpx.TimeoutException:
        error_msg = "Third-party API timeout"
        log_error(logger, endpoint, error_msg)
        raise HTTPException(status_code=504, detail=error_msg)
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))
    

@app.post("/api/deepseek/correlationsummary", tags=["Chat AI Models"])
async def correlation_summary(correlation_data: Dict[str, Any] = Body(...)):
    """
    Generate AI-powered correlation analysis summary using DeepSeek API
    """
    endpoint = "POST /api/deepseek/correlationsummary"
    log_request(logger, endpoint, {"data_keys": list(correlation_data.keys()) if isinstance(correlation_data, dict) else []})
    
    try:
        # Validate input
        if not correlation_data or not isinstance(correlation_data, dict):
            raise HTTPException(status_code=400, detail="correlation_data must be a non-empty dictionary")
        
        # Use mock data if USING_MOCK_DATA is enabled
        if USING_MOCK_DATA:
            import asyncio
            logger.info("[MOCK MODE] Using mock DeepSeek analysis data")
            
            # Sleep for 2 seconds to simulate API call
            await asyncio.sleep(2)
            
            # Load mock data
            mock_file = Path(__file__).parent.parent / "_lib" / "mock_deepseek_analysis.json"
            
            if not mock_file.exists():
                raise HTTPException(status_code=404, detail="Mock DeepSeek analysis file not found")
            
            with open(mock_file, 'r', encoding='utf-8') as f:
                result = json.load(f)
            
            return result
        
        # Call DeepSeek client for real API mode
        result = await deepseek_client.generate_correlation_summary(correlation_data)
        
        # Log response
        log_response(
            logger, 
            endpoint, 
            {
                "source": result.get("source", "api"),
                "has_title": bool(result.get("title")),
                "has_summary": bool(result.get("summary"))
            }, 
            success=True
        )
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        log_error(logger, endpoint, f"Failed to generate correlation summary: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate correlation summary")
    
    
@app.get("/api/market-summary/technical-indicators")
async def get_market_summary_with_technical_indicators(
    ticker: str = Query(..., description="Ticker symbol (e.g., BTC, AAPL, EUR/USD)"),
    market: str = Query(..., description="Market type: crypto, stock, forex, futures"),
    days: int = Query(12, ge=5, le=30, description="Number of days for historical data (5-30)")
):
    """
    Get market summary with technical indicators for the last N days
    Returns: 24h High/Low, Volume, SMA, EMA, MACD, RSI, 24h Change, N-day Change
    """
    endpoint = f"GET /api/market-summary/technical-indicators"
    log_request(logger, endpoint, {"ticker": ticker, "market": market, "days": days})
    
    try:
        # Validate market type
        valid_markets = ["crypto", "stock", "forex", "futures"]
        if market not in valid_markets:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid market type. Must be one of: {', '.join(valid_markets)}"
            )

        api_market = "forex" if market == "futures" else market
        cache_key = f"market_summary:{ticker}:{market}:{days}"
        asset_type = _MARKET_TO_ASSET_TYPE.get(market, "default")

        async def _fetch():
            return await polygon_client.get_market_summary_with_indicators(
                ticker=ticker, market=api_market, days=days
            )

        result = await _cache_first(cache_key, asset_type, _fetch)

        if not result.get("success"):
            raise HTTPException(status_code=404, detail=result.get("error", "Failed to fetch market data"))

        log_response(logger, endpoint, result)
        return result

    except HTTPException:
        raise
    except Exception as e:
        log_error(logger, endpoint, str(e))
        raise HTTPException(status_code=500, detail=str(e))
    
@app.get("/api/comprehensive/top_list")   
async def get_comprehensive_top_list(
    market: str = Query("stocks", description="Market type: stocks, forex, futures, crypto")
):
    endpoint = f"GET /api/comprehensive/top_list?market={market}"
    log_request(logger, endpoint, {"market": market})
    
    try:
        valid_markets = ["stocks", "forex", "futures", "crypto"]
        if market not in valid_markets:
            raise HTTPException(status_code=400, detail=f"Invalid market type. Must be one of: {', '.join(valid_markets)}")

        cache_key = f"market_list:{market}"
        asset_type = _MARKET_TO_ASSET_TYPE.get(market, "default")

        async def _fetch():
            if market in ["crypto", "forex", "stocks"]:
                market_mapping = {"crypto": "crypto", "forex": "fx", "stocks": "stocks"}
                api_market = market if USING_MOCK_DATA else market_mapping[market]
                return await polygon_client.get_comprehensive_market_data(api_market, limit=50)

            # futures
            if USING_MOCK_DATA:
                return await polygon_client.get_comprehensive_market_data(market, limit=50)

            futures_data_path = os.path.join(os.path.dirname(__file__), "../_lib/mock_list_futures.json")
            with open(futures_data_path, "r", encoding="utf-8") as f:
                futures_data = json.load(f)
            futures_list = futures_data.get("futures", [])
            items = await twelvedata_client.process_futures_list(futures_list)
            return {"success": True, "market": market, "count": len(items), "data": items}

        result = await _cache_first(cache_key, asset_type, _fetch)
        log_response(logger, endpoint, {"count": result.get("count", 0)}, success=result.get("success", False))
        return result

        raise HTTPException(status_code=400, detail=f"Unsupported market type: {market}")
        
    except HTTPException:
        raise
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))
    


@app.post("/api/ai/generate-report", tags=["Chat AI Models"])
async def generate_ai_report(request: ChatGPTRequest):
    """Generate AI research report based on user query"""
    endpoint = "POST /api/ai/generate-report"
    params = {
        "query": request.query[:100] + "..." if len(request.query) > 100 else request.query,
        "model": request.model,
        "max_tokens": request.max_tokens,
        "temperature": request.temperature
    }
    log_request(logger, endpoint, params)
    
    try:
        result = await chatgpt_client.generate_report(
            query=request.query,
            model=request.model,
            max_tokens=request.max_tokens,
            temperature=request.temperature
        )
        log_response(logger, endpoint, result, success=result.get("success", True))
        return result
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/chat", tags=["Chat AI Models"])
async def chat_with_ai(request: ChatMessagesRequest):
    """Chat with AI assistant with conversation context"""
    endpoint = "POST /api/ai/chat"
    params = {
        "model": request.model,
        "messages_count": len(request.messages),
        "max_tokens": request.max_tokens,
        "temperature": request.temperature
    }
    log_request(logger, endpoint, params)
    
    try:
        # Convert Pydantic models to dict for the rule-based chat logic.
        messages_dict = [{"role": msg.role, "content": msg.content} for msg in request.messages]

        result = generate_chat_reply_new(messages_dict)
        if result is None:
            result = {
                "success": False,
                "error": "No response generated by chat logic.",
                "content": None,
            }
        log_response(logger, endpoint, result, success=result.get("success", True))
        return result
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/ai/landing-chat", tags=["Chat AI Models"])
async def landing_chat(request: ChatMessagesRequest):
    """
    Landing chat flow endpoint.
    Business logic is delegated to application.clients.chat_logic.
    """
    endpoint = "POST /api/ai/landing-chat"
    params = {
        "model": request.model,
        "messages_count": len(request.messages),
        "max_tokens": request.max_tokens,
        "temperature": request.temperature,
    }
    log_request(logger, endpoint, params)

    try:
        messages_dict = [{"role": msg.role, "content": msg.content} for msg in request.messages]
        result = await handle_landing_chat(
            messages=messages_dict,
            model=request.model,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
        )
        log_response(logger, endpoint, result, success=result.get("success", True))
        return result
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/whale/btc", tags=["Whale"])
async def get_btc_whale_transactions(
    limit: int = 50,
    min_value: int = 100000000
):
    """Get large BTC transactions (whale activity)"""
    endpoint = "GET /api/whale/btc"
    params = {"limit": limit, "min_value": min_value}
    log_request(logger, endpoint, params)
    
    try:
        result = await blockcypher_client.get_large_transactions(
            limit=limit,
            min_value=min_value
        )
        log_response(logger, endpoint, result, success=result.get("success", True))
        return result
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))
    

@app.get("/api/news/sentiment",tags=["News"])
async def get_news_sentiment(
    tickers: Optional[str] = None,
    topics: Optional[str] = None,
    time_from: Optional[str] = None,
    time_to: Optional[str] = None,
    sort: str = "LATEST",
    limit: int = 50,
    market: Optional[str] = None
):
    endpoint = "GET /api/news/sentiment"
    log_request(logger, endpoint, {
        "tickers": tickers,
        "topics": topics,
        "time_from": time_from,
        "time_to": time_to,
        "sort": sort,
        "limit": limit,
        "market": market
    })
    
    try:
        if USING_MOCK_DATA:
            if market == "crypto":
                mock_file = Path(__file__).parent.parent / "_lib" / "mock_news_sentiment_crypto.json"
            elif market == "forex":
                mock_file = Path(__file__).parent.parent / "_lib" / "mock_news_sentiment_forex.json"
            else:
                mock_file = Path(__file__).parent.parent / "_lib" / "mock_news_sentiment_stocks.json"
            
            logger.info(f"[MOCK MODE] Loading mock data from: {mock_file}")
            if not mock_file.exists():
                logger.warning(f"[MOCK MODE] Mock file not found: {mock_file}; returning empty feed")
                mock_data = {"feed": []}
            else:
                with open(mock_file, 'r') as f:
                    mock_data = json.load(f)
            
            articles = mock_data.get("feed") or mock_data.get("items", [])
            logger.info(f"[MOCK MODE] Mock data loaded: {len(articles)} articles")
            
            news_items = []
            for article in articles:
                ticker_sentiments = []
                raw_sentiments = article.get("ticker_sentiments") or article.get("ticker_sentiment", [])
                
                for ts in raw_sentiments:
                    ticker_sentiments.append({
                        "ticker": ts.get("ticker"),
                        "relevance_score": float(ts.get("relevance_score", 0)),
                        "sentiment_score": float(ts.get("sentiment_score") or ts.get("ticker_sentiment_score", 0)),
                        "sentiment_label": ts.get("sentiment_label") or ts.get("ticker_sentiment_label", "Neutral")
                    })
                
                topics_list = []
                for topic in article.get("topics", []):
                    topics_list.append({
                        "topic": topic.get("topic"),
                        "relevance_score": float(topic.get("relevance_score", 0))
                    })
                
                news_items.append({
                    "title": article.get("title"),
                    "url": article.get("url"),
                    "time_published": article.get("time_published"),
                    "authors": article.get("authors", []),
                    "summary": article.get("summary"),
                    "banner_image": article.get("banner_image"),
                    "source": article.get("source"),
                    "category": article.get("category") or article.get("category_within_source"),
                    "source_domain": article.get("source_domain"),
                    "overall_sentiment_score": float(article.get("overall_sentiment_score", 0)),
                    "overall_sentiment_label": article.get("overall_sentiment_label", "Neutral"),
                    "ticker_sentiments": ticker_sentiments,
                    "topics": topics_list
                })
            
            if tickers:
                requested_tickers = [t.strip().upper() for t in tickers.split(",")]
                logger.info(f"[MOCK MODE] Market: {market}, Filtering for tickers: {requested_tickers}")
                
                filtered_items = []
                for item in news_items:
                    item_tickers = []
                    for ts in item.get("ticker_sentiments", []):
                        ticker = ts.get("ticker", "")
                        if market == "forex" and ticker.startswith("FOREX:"):
                            item_tickers.append(ticker.replace("FOREX:", ""))
                        elif market == "crypto" and ticker.startswith("CRYPTO:"):
                            item_tickers.append(ticker.replace("CRYPTO:", ""))
                        else:
                            item_tickers.append(ticker)
                    
                    if any(rt in item_tickers for rt in requested_tickers):
                        filtered_items.append(item)
                
                news_items = filtered_items
                logger.info(f"[MOCK MODE] After filtering: {len(news_items)} articles")
            
            news_items = news_items[:limit]
            logger.info(f"[MOCK MODE] Returning {len(news_items)} articles")
            
            return {
                "success": True,
                "provider": "Mock Data",
                "items": news_items,
                "count": len(news_items),
                "sentiment_score_definition": mock_data.get("sentiment_score_definition")
            }
        
        else:
            logger.info(f"[API MODE] Calling AlphaVantage API for market: {market}")
            
            formatted_tickers = tickers
            if tickers:
                prefix = "CRYPTO:" if market == "crypto" else "FOREX:" if market == "forex" else ""
                if prefix:
                    formatted_tickers = ",".join([
                        f"{prefix}{t.strip().upper()}" if not t.strip().startswith(prefix) else t.strip().upper()
                        for t in tickers.split(",")
                    ])
            
            logger.info(f"[API MODE] Formatted tickers: {formatted_tickers}")
            
            result = await news_client.get_news_sentiment(
                tickers=formatted_tickers,
                topics=topics,
                time_from=time_from,
                time_to=time_to,
                sort=sort,
                limit=limit,
                market=market,
            )
            
            log_response(logger, endpoint, result, success=result.get("success", True))
            return result
        
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/news/sentiment/summary", tags=["News"])
async def get_news_sentiment_summary(
    tickers: Optional[str] = None,
    topics: Optional[str] = None,
    time_from: Optional[str] = None,
    time_to: Optional[str] = None,
    sort: str = "LATEST",
    limit: int = 1000,
    market: Optional[str] = None,
    window_hours: int = 24
):
    endpoint = "GET /api/news/sentiment/summary"
    log_request(logger, endpoint, {
        "tickers": tickers,
        "topics": topics,
        "time_from": time_from,
        "time_to": time_to,
        "sort": sort,
        "limit": limit,
        "market": market,
        "window_hours": window_hours
    })

    try:
        now = datetime.utcnow()
        if not time_to:
            time_to = now.strftime("%Y%m%dT%H%M")
        if not time_from:
            time_from = (now - timedelta(hours=window_hours)).strftime("%Y%m%dT%H%M")

        if USING_MOCK_DATA:
            if market == "crypto":
                mock_file = Path(__file__).parent.parent / "_lib" / "mock_news_sentiment_crypto.json"
            elif market == "forex":
                mock_file = Path(__file__).parent.parent / "_lib" / "mock_news_sentiment_forex.json"
            else:
                mock_file = Path(__file__).parent.parent / "_lib" / "mock_news_sentiment_stocks.json"

            logger.info(f"[MOCK MODE] Loading mock data from: {mock_file}")
            if not mock_file.exists():
                logger.warning(f"[MOCK MODE] Mock file not found: {mock_file}; returning empty feed")
                mock_data = {"feed": []}
            else:
                with open(mock_file, 'r') as f:
                    mock_data = json.load(f)

            articles = mock_data.get("feed") or mock_data.get("items", [])
            logger.info(f"[MOCK MODE] Mock data loaded: {len(articles)} articles")

            news_items = []
            for article in articles:
                ticker_sentiments = []
                raw_sentiments = article.get("ticker_sentiments") or article.get("ticker_sentiment", [])

                for ts in raw_sentiments:
                    ticker_sentiments.append({
                        "ticker": ts.get("ticker"),
                        "relevance_score": float(ts.get("relevance_score", 0)),
                        "sentiment_score": float(ts.get("sentiment_score") or ts.get("ticker_sentiment_score", 0)),
                        "sentiment_label": ts.get("sentiment_label") or ts.get("ticker_sentiment_label", "Neutral")
                    })

                topics_list = []
                for topic in article.get("topics", []):
                    topics_list.append({
                        "topic": topic.get("topic"),
                        "relevance_score": float(topic.get("relevance_score", 0))
                    })

                news_items.append({
                    "title": article.get("title"),
                    "url": article.get("url"),
                    "time_published": article.get("time_published"),
                    "authors": article.get("authors", []),
                    "summary": article.get("summary"),
                    "banner_image": article.get("banner_image"),
                    "source": article.get("source"),
                    "category": article.get("category") or article.get("category_within_source"),
                    "source_domain": article.get("source_domain"),
                    "overall_sentiment_score": float(article.get("overall_sentiment_score", 0)),
                    "overall_sentiment_label": article.get("overall_sentiment_label", "Neutral"),
                    "ticker_sentiments": ticker_sentiments,
                    "topics": topics_list
                })

            if tickers:
                requested_tickers = [t.strip().upper() for t in tickers.split(",")]
                logger.info(f"[MOCK MODE] Market: {market}, Filtering for tickers: {requested_tickers}")

                filtered_items = []
                for item in news_items:
                    item_tickers = []
                    for ts in item.get("ticker_sentiments", []):
                        ticker = ts.get("ticker", "")
                        if market == "forex" and ticker.startswith("FOREX:"):
                            item_tickers.append(ticker.replace("FOREX:", ""))
                        elif market == "crypto" and ticker.startswith("CRYPTO:"):
                            item_tickers.append(ticker.replace("CRYPTO:", ""))
                        else:
                            item_tickers.append(ticker)

                    if any(rt in item_tickers for rt in requested_tickers):
                        filtered_items.append(item)

                news_items = filtered_items
                logger.info(f"[MOCK MODE] After filtering: {len(news_items)} articles")

            news_items = news_items[:min(limit, 1000)]

            summary = NewsSentimentClient.summarize_general_items(news_items)
            summary.update({
                "success": True,
                "provider": "Mock Data",
                "count": len(news_items),
                "time_from": time_from,
                "time_to": time_to,
                "market": market,
                "sentiment_score_definition": mock_data.get("sentiment_score_definition")
            })

            log_response(logger, endpoint, summary, success=True)
            return summary

        formatted_tickers = tickers
        if tickers:
            prefix = "CRYPTO:" if market == "crypto" else "FOREX:" if market == "forex" else ""
            if prefix:
                formatted_tickers = ",".join([
                    f"{prefix}{t.strip().upper()}" if not t.strip().startswith(prefix) else t.strip().upper()
                    for t in tickers.split(",")
                ])

        effective_limit = min(limit, 200)
        result = await news_client.analyze_general_sentiment(
            tickers=formatted_tickers,
            topics=topics,
            time_from=time_from,
            time_to=time_to,
            sort=sort,
            limit=effective_limit,
            market=market,
        )

        if result.get("success"):
            result.update({
                "time_from": time_from,
                "time_to": time_to,
                "market": market,
                "count": result.get("total_articles", 0),
                "limit": effective_limit
            })

        log_response(logger, endpoint, result, success=result.get("success", True))
        return result

    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/social/sentiment/summary", tags=["News"])
async def get_social_sentiment_summary(
    time_from: Optional[str] = None,
    time_to: Optional[str] = None,
    window_hours: int = 24,
    limit: int = 1000,
    market: Optional[str] = None
):
    endpoint = "GET /api/social/sentiment/summary"
    log_request(logger, endpoint, {
        "time_from": time_from,
        "time_to": time_to,
        "window_hours": window_hours,
        "limit": limit,
        "market": market
    })

    def parse_time(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        if re.match(r"^\d{8}T\d{6}$", value):
            return datetime.strptime(value, "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
        if re.match(r"^\d{8}T\d{4}$", value):
            return datetime.strptime(value, "%Y%m%dT%H%M").replace(tzinfo=timezone.utc)
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None

    try:
        now = datetime.now(timezone.utc)
        start_dt = parse_time(time_from)
        end_dt = parse_time(time_to)

        if end_dt is None:
            end_dt = now
        if start_dt is None:
            start_dt = end_dt - timedelta(hours=window_hours)

        effective_limit = min(limit, 100)
        posts_df = await asyncio.to_thread(
            data_request.get_social_posts,
            start_time=start_dt,
            end_time=end_dt,
            limit=effective_limit,
            market=market
        )
        fallback_used = False
        if posts_df is None or posts_df.empty:
            # Real-time Reddit fallback instead of returning error
            FALLBACK_SUBREDDITS = {
                "crypto":  ["CryptoCurrency", "bitcoin", "ethereum"],
                "stock":   ["stocks", "wallstreetbets", "investing"],
                "forex":   ["Forex"],
                "gold":    ["Gold", "commodities"],
                "futures": ["FuturesTrading"],
            }
            subs = FALLBACK_SUBREDDITS.get(market, ["CryptoCurrency", "stocks", "Forex", "Gold"])
            live_posts = []
            for sub in subs:
                try:
                    resp = await reddit_client.get_subreddit_posts(sub, sort="hot", limit=15, timeframe="day")
                    if resp.get("success") and resp.get("posts"):
                        for p in resp["posts"]:
                            live_posts.append({
                                "title": p.get("title", ""),
                                "content": p.get("content", ""),
                                "comments": p.get("comments", []),
                                "posted_at": p.get("created_utc", ""),
                            })
                except Exception as sub_err:
                    logger.warning(f"Reddit fallback failed for r/{sub}: {sub_err}")

            if not live_posts:
                return {
                    "success": False,
                    "message": "No social data found for the requested window",
                    "time_from": start_dt.isoformat(),
                    "time_to": end_dt.isoformat()
                }
            posts = live_posts
            fallback_used = True
        else:
            posts = posts_df.to_dict(orient="records")

        cache_key = (start_dt.isoformat(), end_dt.isoformat(), effective_limit, len(posts), market or "all")
        try:
            summary = await asyncio.to_thread(
                social_sentiment_client.summarize_posts,
                posts,
                cache_key
            )
        except Exception as e:
            return {
                "success": False,
                "error": f"Social sentiment unavailable: {e}",
                "time_from": start_dt.isoformat(),
                "time_to": end_dt.isoformat()
            }

        result = {
            "success": True,
            "time_from": start_dt.isoformat(),
            "time_to": end_dt.isoformat(),
            "window_hours": window_hours,
            "limit": effective_limit,
            "market": market,
            "provider": "Reddit Live Fallback" if fallback_used else "Database"
        }
        result.update(summary)

        log_response(logger, endpoint, result, success=True)
        return result

    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/preference_list")
async def get_preference_list(
    category: Optional[str] = Query(None, description="Filter by category: crypto, stock, forex, futures. If not provided, returns all.")
):
    """
    Get available assets for user preference selection from database.
    """
    endpoint = f"GET /api/preference_list?category={category}"
    log_request(logger, endpoint, {"category": category})

    conn = None
    cursor = None
    try:
        conn = get_db_conn()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        # Build query based on category filter
        if category:
            # Validate category
            valid_categories = ['crypto', 'stock', 'forex', 'futures']
            if category not in valid_categories:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid category. Must be one of: {', '.join(valid_categories)}"
                )
            
            query = """
                SELECT crypto_id, name, symbol_binance, category
                FROM reference.cryptocurrencies
                WHERE category = %s AND is_active = TRUE
                ORDER BY name ASC
            """
            cursor.execute(query, (category,))
        else:
            query = """
                SELECT crypto_id, name, symbol_binance, category
                FROM reference.cryptocurrencies
                WHERE is_active = TRUE
                ORDER BY category ASC, name ASC
            """
            cursor.execute(query)

        assets = cursor.fetchall()

        # Group assets by category
        grouped = {
            "cryptocurrencies": [],
            "us_stocks": [],
            "forex_pairs": [],
            "metal_futures": []
        }

        category_map = {
            "crypto": "cryptocurrencies",
            "stock": "us_stocks",
            "forex": "forex_pairs",
            "futures": "metal_futures"
        }

        for asset in assets:
            group_key = category_map.get(asset['category'])
            if group_key:
                grouped[group_key].append({
                    "crypto_id": asset['crypto_id'],  # Keep using crypto_id for consistency
                    "name": asset['name'],
                    "symbol": asset['symbol_binance'],
                    "category": asset['category']
                })

        result = {
            "total_count": len(assets),
            "assets": grouped
        }

        log_response(logger, endpoint, {"total_count": len(assets)}, success=True)
        return result

    except HTTPException:
        raise
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cursor:
            cursor.close()
        if conn:
            release_conn(conn)


# Include presentation routes with /v1 prefix
app.include_router(routes.router, prefix="/v1")
# Compatibility mount for clients that call /api/v1/*
app.include_router(routes.router, prefix="/api/v1")

def _enrich_reddit_posts(posts: list) -> list:
    """Score each post with sentiment — runs in a thread pool (blocking NLP call)."""
    enriched = []
    for post in posts:
        item = dict(post)
        combined_text = " ".join(
            part.strip()
            for part in [item.get("title"), item.get("content")]
            if isinstance(part, str) and part.strip()
        )
        sentiment_score = round(float(_score_text(combined_text)), 4) if combined_text else 0.0
        item["sentiment_score"] = sentiment_score
        item["sentiment_label"] = classify_social_item_sentiment(sentiment_score)
        enriched.append(item)
    return enriched


# ========== Reddit API Endpoints ==========
@app.get("/api/reddit/subreddit/{subreddit}", tags=["Reddit"])
async def get_reddit_posts(
    subreddit: str,
    sort: str = Query("hot", description="Sort method: hot, new, top, rising"),
    limit: int = Query(25, description="Number of posts to fetch"),
    timeframe: str = Query("day", description="Timeframe: hour, day, week, month, year, all")
):
    """Get posts from a specific subreddit"""
    endpoint = f"GET /api/reddit/subreddit/{subreddit}"
    params = {"subreddit": subreddit, "sort": sort, "limit": limit, "timeframe": timeframe}
    log_request(logger, endpoint, params)
    
    try:
        result = await reddit_client.get_subreddit_posts(
            subreddit=subreddit,
            sort=sort,
            limit=limit,
            timeframe=timeframe
        )

        if result.get("success") and isinstance(result.get("posts"), list):
            result["posts"] = await asyncio.to_thread(_enrich_reddit_posts, result["posts"])

        log_response(logger, endpoint, result, success=result.get("success", True))
        return result
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))
    
class RecordPurchaseBody(BaseModel):
    provider: str
    provider_payment_id: Optional[str] = None
    amount_cents: int
    currency: str = "USD"
    influencer_code: Optional[str] = None

# @app.post("/api/billing/record-purchase")
# async def record_purchase(
#     body: RecordPurchaseBody,
#     user_id: str = Depends(user_auth.get_current_user_id_from_cookie),
# ):
#     """
#     Call this AFTER payment success.
#     Uses buyer's stored auth.users.influencer_code to decide commission.
#     """
#     buyer_user_id = int(user_id)

#     result = influencer_commission.record_paid_order_and_apply_commission(
#         buyer_user_id=buyer_user_id,
#         provider=body.provider,
#         provider_payment_id=body.provider_payment_id,
#         amount_cents=body.amount_cents,
#         currency=body.currency,
#         commission_rate=0.30,
#         activation_sales_threshold_cents=0,  # set e.g. 10000 for $100 threshold if you want
#     )

#     if not result.get("success"):
#         raise HTTPException(status_code=400, detail=result.get("message", "Failed to record purchase"))

#     return result
@app.post("/api/billing/record-purchase")
async def record_purchase(
    body: RecordPurchaseBody,
    user_id: str = Depends(user_auth.get_current_user_id_from_cookie),
):
    buyer_user_id = int(user_id)

    # ---- OPTION A: FORCE A UNIQUE PAYMENT ID IN MOCK MODE ----
    if USE_STRIPE_MOCK:
        # if frontend didn't send one, generate one
        if not body.provider_payment_id or body.provider_payment_id.strip() == "":
            body.provider_payment_id = f"mock_pi_{int(time.time())}_{uuid.uuid4().hex[:8]}"
    else:
        # in real mode, don't allow blank ids (kills idempotency + tracing)
        if not body.provider_payment_id or body.provider_payment_id.strip() == "":
            raise HTTPException(status_code=400, detail="provider_payment_id is required")

    # OPTIONAL: allow overriding influencer code in mock mode
    # (Only do this if you WANT to test commission without a full auth flow)
    if USE_STRIPE_MOCK and body.influencer_code:
        influencer_commission.set_user_influencer_code_if_missing(
            buyer_user_id=buyer_user_id,
            influencer_code=body.influencer_code
        )

    result = influencer_commission.record_paid_order_and_apply_commission(
        buyer_user_id=buyer_user_id,
        provider=body.provider,
        provider_payment_id=body.provider_payment_id,
        amount_cents=body.amount_cents,
        currency=body.currency,
        commission_rate=0.30,
        activation_sales_threshold_cents=0,
    )

    if not result.get("success"):
        raise HTTPException(status_code=400, detail=result.get("message", "Failed to record purchase"))

    return result


# ========== Government Module API Endpoints ==========

@app.get("/api/government/global", tags=["Government"])
async def get_government_global_sentiment():
    """Get global macro sentiment (average of all 22 countries)."""
    endpoint = "GET /api/government/global"
    log_request(logger, endpoint, {})
    try:
        # Try mock data first
        mock_file = Path(__file__).parent.parent / "_lib" / "mock_government_data.json"
        if mock_file.exists():
            try:
                gov_client = get_government_client()
                result = gov_client.get_global_sentiment()
                if result.get("analyzed_at"):
                    log_response(logger, endpoint, result, success=True)
                    return result
            except Exception:
                pass
            # Fallback to mock
            with open(mock_file, "r") as f:
                mock_data = json.load(f)
            result = mock_data.get("global_sentiment", {})
            result["is_mock"] = True
            log_response(logger, endpoint, result, success=True)
            return result
        
        gov_client = get_government_client()
        result = gov_client.get_global_sentiment()
        log_response(logger, endpoint, result, success=True)
        return result
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/government/countries", tags=["Government"])
async def get_government_countries_sentiment():
    """Get sentiment overview for all 22 countries."""
    endpoint = "GET /api/government/countries"
    log_request(logger, endpoint, {})
    try:
        # Try live data first
        try:
            gov_client = get_government_client()
            result = gov_client.get_all_countries_sentiment()
            if result.get("countries") and len(result["countries"]) > 0:
                log_response(logger, endpoint, result, success=True)
                return result
        except Exception:
            pass

        # Fallback to mock data
        mock_file = Path(__file__).parent.parent / "_lib" / "mock_government_data.json"
        if mock_file.exists():
            with open(mock_file, "r") as f:
                mock_data = json.load(f)
            result = mock_data.get("countries", {})
            result["is_mock"] = True
            log_response(logger, endpoint, result, success=True)
            return result
        
        return {"success": True, "countries": [], "count": 0}
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/government/country/{country_code}", tags=["Government"])
async def get_government_country_detail(country_code: str):
    """Get detailed metric-level sentiment for a specific country."""
    endpoint = f"GET /api/government/country/{country_code}"
    log_request(logger, endpoint, {"country_code": country_code})
    try:
        # Try live data first
        try:
            gov_client = get_government_client()
            result = gov_client.get_country_detail(country_code)
            if result.get("success") and result.get("metrics"):
                log_response(logger, endpoint, result, success=True)
                return result
        except Exception:
            pass

        # Fallback to mock data
        mock_file = Path(__file__).parent.parent / "_lib" / "mock_government_data.json"
        if mock_file.exists():
            with open(mock_file, "r") as f:
                mock_data = json.load(f)
            country_details = mock_data.get("country_details", {})
            detail = country_details.get(country_code.upper())
            if detail:
                detail["is_mock"] = True
                log_response(logger, endpoint, detail, success=True)
                return detail
            # If specific country not in mock, generate generic mock
            return _generate_generic_country_mock(country_code.upper())
        
        return {"success": False, "error": "Country data not available"}
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))


def _generate_generic_country_mock(country_code: str):
    """Generate generic mock data for countries not in detailed mock file."""
    import random
    random.seed(hash(country_code))

    metrics = []
    metric_names = ["inflation", "interest_rate", "employment", "gdp", "pmi", "bond_yield_10y"]
    metric_display = {
        "inflation": {"unit": "%", "range": (0.5, 8.0)},
        "interest_rate": {"unit": "%", "range": (0.5, 10.0)},
        "employment": {"unit": "%", "range": (3.0, 12.0)},
        "gdp": {"unit": "%", "range": (-1.0, 6.0)},
        "pmi": {"unit": "index", "range": (45.0, 58.0)},
        "bond_yield_10y": {"unit": "%", "range": (0.5, 7.0)},
    }

    for name in metric_names:
        info = metric_display[name]
        value = round(random.uniform(*info["range"]), 2)
        prev_value = round(value + random.uniform(-1, 1), 2)

        # Simple classification
        if name == "gdp":
            label = "positive" if value > 2 else ("negative" if value < 0 else "neutral")
        elif name == "pmi":
            label = "positive" if value > 50 else ("negative" if value < 45 else "neutral")
        elif name == "employment":
            label = "positive" if value < 5 else ("negative" if value > 8 else "neutral")
        elif name == "inflation":
            label = "positive" if 0.5 < value < 3 else ("negative" if value > 5 else "neutral")
        else:
            label = "positive" if 1 < value < 5 else ("negative" if value > 8 else "neutral")

        score = {"positive": 0.5, "neutral": 0.0, "negative": -0.5}[label]

        metrics.append({
            "metric_name": name,
            "sentiment_label": label,
            "sentiment_score": score,
            "analysis_note": f"{name.replace('_', ' ').title()} at {value}{info['unit']}",
            "metric_value": value,
            "previous_value": prev_value,
            "unit": info["unit"],
            "source": "mock_generated",
            "data_date": "2026-02-22"
        })

    scores = [m["sentiment_score"] for m in metrics]
    avg_score = sum(scores) / len(scores) if scores else 0
    overall_label = "positive" if avg_score > 0.1 else ("negative" if avg_score < -0.1 else "neutral")

    return {
        "success": True,
        "is_mock": True,
        "country": {"code": country_code, "name": country_code, "region": "unknown"},
        "overall": {
            "score": round(avg_score, 4),
            "label": overall_label,
            "positive_count": sum(1 for m in metrics if m["sentiment_label"] == "positive"),
            "neutral_count": sum(1 for m in metrics if m["sentiment_label"] == "neutral"),
            "negative_count": sum(1 for m in metrics if m["sentiment_label"] == "negative"),
            "analyzed_at": "2026-02-22T10:00:00"
        },
        "metrics": metrics
    }


# ─────────────────────────────────────────────────────────────────────────────
# Stress Engine — Historical Crisis Replay & Proxy Stress Modeling
# ─────────────────────────────────────────────────────────────────────────────

class StressPortfolioAsset(BaseModel):
    symbol: str
    name: Optional[str] = None
    category: Optional[str] = "stock"
    weight: float


class StressApplyRequest(BaseModel):
    portfolio: list[StressPortfolioAsset]
    module: str
    scenario_id: str


class StressApplyAllRequest(BaseModel):
    portfolio: list[StressPortfolioAsset]
    module: str


class StressReverseRequest(BaseModel):
    portfolio: list[StressPortfolioAsset]
    threshold_pct: float  # NEGATIVE number, e.g., -25.0 = "lose 25% or more"


@app.get("/api/stress/modules", tags=["Stress Engine"])
async def stress_list_modules():
    """List the 6 stress modules (including Factor Shock Simulation)."""
    return {
        "success": True,
        "modules": [
            {
                "id": m,
                "name": {
                    "historical_replay": "Historical Crisis Replay",
                    "market_shock":      "Market Shock",
                    "rate_shock":        "Rate Shock",
                    "liquidity_shock":   "Liquidity Shock",
                    "black_swan_proxy":  "Black Swan Proxy Mode",
                    "factor_shock":      "Factor Shock Simulation",
                }.get(m, m),
            }
            for m in stress_engine.list_modules()
        ],
    }


@app.get("/api/stress/{module_id}/scenarios", tags=["Stress Engine"])
async def stress_list_scenarios(module_id: str):
    """List scenarios available within a stress module."""
    try:
        scs = stress_engine.list_scenarios(module_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {
        "success": True,
        "module": module_id,
        "scenarios": [
            {"id": s.id, "name": s.name, "description": s.description, "period": s.period}
            for s in scs
        ],
    }


@app.post("/api/stress/apply", tags=["Stress Engine"])
async def stress_apply(req: StressApplyRequest):
    """Apply a single (module, scenario) to a user portfolio."""
    endpoint = "POST /api/stress/apply"
    log_request(logger, endpoint, {"module": req.module, "scenario_id": req.scenario_id, "n_assets": len(req.portfolio)})
    try:
        portfolio_dicts = [a.model_dump() for a in req.portfolio]
        result = stress_engine.apply_module(portfolio_dicts, req.module, req.scenario_id)
        body = {"success": True, "result": stress_engine.result_to_dict(result)}
        log_response(logger, endpoint, body, success=True)
        return body
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/stress/apply_all", tags=["Stress Engine"])
async def stress_apply_all(req: StressApplyAllRequest):
    """Apply every scenario in a module to a user portfolio (batch convenience for the UI)."""
    endpoint = "POST /api/stress/apply_all"
    log_request(logger, endpoint, {"module": req.module, "n_assets": len(req.portfolio)})
    try:
        portfolio_dicts = [a.model_dump() for a in req.portfolio]
        results = []
        for sc in stress_engine.list_scenarios(req.module):
            result = stress_engine.apply_module(portfolio_dicts, req.module, sc.id)
            results.append(stress_engine.result_to_dict(result))
        body = {"success": True, "module": req.module, "count": len(results), "results": results}
        log_response(logger, endpoint, {"module": req.module, "count": len(results)}, success=True)
        return body
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Portfolio Assets — per-user CRUD
# ─────────────────────────────────────────────────────────────────────────────

class PortfolioAssetIn(BaseModel):
    symbol: str
    name: Optional[str] = None
    category: str = "stock"
    weight: float = 0
    entry_price: Optional[float] = None
    current_price: Optional[float] = None
    risk: Optional[str] = None


def _row_to_asset(row) -> Dict[str, Any]:
    """Postgres row → frontend-friendly dict."""
    return {
        "id": row["asset_id"],
        "symbol": row["symbol"],
        "name": row["name"],
        "category": row["category"],
        "weight": float(row["weight"]) if row["weight"] is not None else 0,
        "entryPrice": float(row["entry_price"]) if row["entry_price"] is not None else None,
        "currentPrice": float(row["current_price"]) if row["current_price"] is not None else None,
        "risk": row["risk"],
    }


@app.get("/api/portfolio/assets", tags=["Portfolio"])
async def list_portfolio_assets(
    user_id: str = Depends(user_auth.get_current_user_id_from_cookie),
):
    """List the authenticated user's portfolio assets."""
    endpoint = "GET /api/portfolio/assets"
    log_request(logger, endpoint, {"user_id": user_id})
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            SELECT asset_id, symbol, name, category, weight, entry_price, current_price, risk
            FROM auth.user_portfolio_assets
            WHERE user_id = %s
            ORDER BY asset_id ASC
            """,
            (user_id,),
        )
        rows = cur.fetchall()
        assets = [_row_to_asset(r) for r in rows]
        log_response(logger, endpoint, {"count": len(assets)}, success=True)
        return {"success": True, "assets": assets}
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cur:
            cur.close()
        if conn:
            release_conn(conn)


@app.post("/api/portfolio/assets", tags=["Portfolio"])
async def add_portfolio_asset(
    payload: PortfolioAssetIn,
    user_id: str = Depends(user_auth.get_current_user_id_from_cookie),
):
    """Add an asset to the authenticated user's portfolio."""
    endpoint = "POST /api/portfolio/assets"
    log_request(logger, endpoint, {"user_id": user_id, "symbol": payload.symbol})
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            INSERT INTO auth.user_portfolio_assets
                (user_id, symbol, name, category, weight, entry_price, current_price, risk)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            RETURNING asset_id, symbol, name, category, weight, entry_price, current_price, risk
            """,
            (user_id, payload.symbol, payload.name, payload.category, payload.weight,
             payload.entry_price, payload.current_price, payload.risk),
        )
        row = cur.fetchone()
        conn.commit()
        return {"success": True, "asset": _row_to_asset(row)}
    except Exception as e:
        if conn:
            conn.rollback()
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cur:
            cur.close()
        if conn:
            release_conn(conn)


@app.put("/api/portfolio/assets/{asset_id}", tags=["Portfolio"])
async def update_portfolio_asset(
    asset_id: int,
    payload: PortfolioAssetIn,
    user_id: str = Depends(user_auth.get_current_user_id_from_cookie),
):
    """Update an asset owned by the authenticated user."""
    endpoint = f"PUT /api/portfolio/assets/{asset_id}"
    log_request(logger, endpoint, {"user_id": user_id, "asset_id": asset_id})
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor(cursor_factory=RealDictCursor)
        cur.execute(
            """
            UPDATE auth.user_portfolio_assets
            SET symbol = %s, name = %s, category = %s, weight = %s,
                entry_price = %s, current_price = %s, risk = %s,
                updated_at = NOW()
            WHERE asset_id = %s AND user_id = %s
            RETURNING asset_id, symbol, name, category, weight, entry_price, current_price, risk
            """,
            (payload.symbol, payload.name, payload.category, payload.weight,
             payload.entry_price, payload.current_price, payload.risk,
             asset_id, user_id),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Asset not found or not owned by user")
        conn.commit()
        return {"success": True, "asset": _row_to_asset(row)}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cur:
            cur.close()
        if conn:
            release_conn(conn)


@app.delete("/api/portfolio/assets/{asset_id}", tags=["Portfolio"])
async def delete_portfolio_asset(
    asset_id: int,
    user_id: str = Depends(user_auth.get_current_user_id_from_cookie),
):
    """Delete an asset owned by the authenticated user."""
    endpoint = f"DELETE /api/portfolio/assets/{asset_id}"
    log_request(logger, endpoint, {"user_id": user_id, "asset_id": asset_id})
    conn = None
    cur = None
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM auth.user_portfolio_assets WHERE asset_id = %s AND user_id = %s",
            (asset_id, user_id),
        )
        deleted = cur.rowcount
        conn.commit()
        if not deleted:
            raise HTTPException(status_code=404, detail="Asset not found or not owned by user")
        return {"success": True, "deleted_id": asset_id}
    except HTTPException:
        if conn:
            conn.rollback()
        raise
    except Exception as e:
        if conn:
            conn.rollback()
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if cur:
            cur.close()
        if conn:
            release_conn(conn)


# ─────────────────────────────────────────────────────────────────────────────
# Live price endpoint — used by AddAssetModal autofill and Portfolio page polling
# ─────────────────────────────────────────────────────────────────────────────

# In-memory cache: shields Polygon's free tier (5 req/min) from frontend polling.
# 60s TTL means each (symbol,category) hits Polygon at most once per minute, no matter
# how many users poll. Stale-served cache values keep the UI populated even when the
# upstream provider rate-limits us.
_price_cache: Dict[str, Dict[str, Any]] = {}
_PRICE_CACHE_TTL_SEC = 60
_PRICE_CACHE_STALE_FALLBACK_SEC = 600  # serve stale up to 10min if Polygon is unavailable


def _cache_get(key: str, allow_stale: bool = False):
    entry = _price_cache.get(key)
    if not entry:
        return None
    age = time.time() - entry["ts"]
    if age > _PRICE_CACHE_TTL_SEC:
        if allow_stale and age <= _PRICE_CACHE_STALE_FALLBACK_SEC:
            stale_data = dict(entry["data"])
            stale_data["stale"] = True
            stale_data["age_seconds"] = round(age, 1)
            return stale_data
        return None
    return entry["data"]


def _cache_put(key: str, data: Dict[str, Any]):
    _price_cache[key] = {"ts": time.time(), "data": data}


def _format_polygon_ticker(symbol: str, category: str) -> Optional[str]:
    """
    Map (symbol, category) → Polygon-prefixed ticker, or None if unsupported.

    Polygon prefix conventions:
      X: → cryptocurrency pair
      C: → currency / forex pair (also used for spot precious metals)
      no prefix → US-listed equity

    Limitations on Polygon's free tier:
      - Real futures (CL=oil, HG=copper, ZC=corn, ZW=wheat) are NOT available;
        callers requesting category=futures with non-precious symbols get None
        and the UI falls back to manual entry / no live price.
      - Forex pairs limited to G10 majors via /v2/aggs.
      - Most US equities and major cryptos are supported.
    """
    s = (symbol or "").strip().upper()
    c = (category or "").strip().lower()
    if not s:
        return None
    if c == "crypto":
        return s if s.startswith("X:") else f"X:{s}USD"
    if c == "forex":
        return s if s.startswith("C:") else f"C:{s}"
    if c == "stock":
        return s
    if c == "futures":
        # Precious metals: Polygon free tier exposes XAU/XAG/XPT/XPD as currencies (C: prefix).
        # These are spot prices in USD, NOT actual futures contracts; downstream
        # consumers should treat them as spot estimates of the underlying metal.
        precious_metal_aliases = {
            "GOLD": "C:XAUUSD",
            "GC": "C:XAUUSD",
            "XAU": "C:XAUUSD",
            "SILVER": "C:XAGUSD",
            "SI": "C:XAGUSD",
            "XAG": "C:XAGUSD",
            "PLATINUM": "C:XPTUSD",
            "PT": "C:XPTUSD",
            "XPT": "C:XPTUSD",
            "PALLADIUM": "C:XPDUSD",
            "PD": "C:XPDUSD",
            "XPD": "C:XPDUSD",
        }
        if s in precious_metal_aliases:
            return precious_metal_aliases[s]
        # Real futures contracts (CL, HG, ZC, ZW, NG, etc.) — not available on free tier.
        return None
    return None


@app.get("/api/price/latest", tags=["Portfolio"])
async def get_latest_price(
    symbol: str = Query(..., description="Asset symbol e.g. BTC, AAPL, EURUSD, GOLD"),
    category: str = Query("stock", description="crypto / stock / forex / futures"),
):
    """
    Return the latest available price for a single asset.
    Uses Polygon previous-close for stable free-tier behavior; values refresh
    once per trading session for stocks, intraday for crypto. Cached for 60s,
    with stale fallback up to 10min if Polygon is rate-limiting.
    """
    cache_key = f"{(category or '').lower()}::{(symbol or '').upper()}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    ticker = _format_polygon_ticker(symbol, category)
    if not ticker:
        body = {"success": False, "symbol": symbol, "category": category,
                "price": None, "error": f"Unsupported symbol/category: {symbol} / {category}"}
        return body

    try:
        data = await polygon_client.get_previous_close(ticker)
        if not data:
            # Upstream returned nothing — fall back to stale cache if any
            stale = _cache_get(cache_key, allow_stale=True)
            if stale:
                return stale
            return {"success": False, "symbol": symbol, "category": category,
                    "price": None, "error": "No data from price provider"}
        price = data.get("c")  # close
        body = {
            "success": True,
            "symbol": symbol,
            "category": category,
            "polygon_ticker": ticker,
            "price": float(price) if price is not None else None,
            "previous_close": float(price) if price is not None else None,
            "open": data.get("o"),
            "high": data.get("h"),
            "low": data.get("l"),
            "volume": data.get("v"),
            "timestamp": data.get("t"),
            "stale": False,
        }
        _cache_put(cache_key, body)
        return body
    except Exception as e:
        # Network/rate-limit error — serve stale if we have it
        stale = _cache_get(cache_key, allow_stale=True)
        if stale:
            return stale
        return {"success": False, "symbol": symbol, "category": category,
                "price": None, "error": str(e)}


@app.post("/api/stress/reverse", tags=["Stress Engine"])
async def stress_reverse(req: StressReverseRequest):
    """
    Reverse stress: scan all 21 scenarios, return those whose modeled portfolio
    drawdown breaches the user's loss threshold (e.g., threshold_pct=-25 means
    'lose 25% or more').

    Compliance: surfaces existing scenario outputs ranked by severity.
    Does not estimate likelihood, recommend action, or constitute investment advice.
    """
    endpoint = "POST /api/stress/reverse"
    log_request(logger, endpoint, {
        "n_assets": len(req.portfolio),
        "threshold_pct": req.threshold_pct,
    })
    try:
        if req.threshold_pct >= 0:
            raise HTTPException(
                status_code=400,
                detail="threshold_pct must be a negative number (e.g., -25 for 'lose 25% or more')",
            )
        portfolio_dicts = [a.model_dump() for a in req.portfolio]
        result = stress_engine.find_breach_scenarios(portfolio_dicts, req.threshold_pct)
        body = {
            "success": True,
            "threshold_pct": req.threshold_pct,
            **result,
        }
        log_response(logger, endpoint, {"breach_count": result["breach_count"]}, success=True)
        return body
    except HTTPException:
        raise
    except Exception as e:
        log_error(logger, endpoint, e)
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
# Symbol search — Polygon ticker autocomplete for AddAssetModal
# ─────────────────────────────────────────────────────────────────────────────

# Cache search responses 10 minutes; same query won't re-hit Polygon for 10 min.
_SYMBOL_SEARCH_CACHE: Dict[str, Dict[str, Any]] = {}
_SYMBOL_SEARCH_CACHE_TTL_SEC = 600


def _category_to_polygon_market(category: str) -> Optional[str]:
    """Map our category names to Polygon /v3/reference/tickers `market` param."""
    c = (category or "").lower()
    return {
        "stock": "stocks",
        "crypto": "crypto",
        "forex": "fx",
        "futures": None,  # Polygon free tier: no futures market exposed
    }.get(c)


@app.get("/api/symbols/search", tags=["Portfolio"])
async def search_symbols(
    q: str = Query(..., min_length=1, max_length=20, description="Partial symbol or name to match"),
    category: str = Query("stock", description="stock / crypto / forex / futures"),
    limit: int = Query(8, ge=1, le=20),
):
    """
    Autocomplete-style symbol search backed by Polygon /v3/reference/tickers.
    Returns up to `limit` candidates matching `q` within the chosen category.

    Cached server-side for 10 minutes per (q, category, limit) to shield the
    Polygon free-tier rate limits from frontend keystroke typing.

    For category='futures' Polygon free tier has no futures coverage; we return
    an empty list rather than 5xx so the UI degrades gracefully.
    """
    cache_key = f"{category}::{q.lower()}::{limit}"
    cached = _SYMBOL_SEARCH_CACHE.get(cache_key)
    if cached and (time.time() - cached["ts"] <= _SYMBOL_SEARCH_CACHE_TTL_SEC):
        return cached["data"]

    market = _category_to_polygon_market(category)
    if market is None:
        body = {"success": True, "category": category, "results": [],
                "note": "Symbol search not available for this category on the current data plan."}
        _SYMBOL_SEARCH_CACHE[cache_key] = {"ts": time.time(), "data": body}
        return body

    api_key = os.getenv("POLYGON_API_KEY")
    if not api_key:
        return {"success": False, "error": "POLYGON_API_KEY not configured"}

    url = "https://api.polygon.io/v3/reference/tickers"
    params = {
        "search": q,
        "active": "true",
        "market": market,
        "limit": limit,
        "apiKey": api_key,
    }
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, params=params)
            if resp.status_code != 200:
                return {"success": False, "error": f"Polygon returned {resp.status_code}",
                        "results": []}
            payload = resp.json()
            raw_results = payload.get("results", []) or []
            simplified = [
                {
                    "ticker": r.get("ticker"),
                    "name": r.get("name"),
                    "market": r.get("market"),
                    "locale": r.get("locale"),
                    "type": r.get("type"),
                }
                for r in raw_results
            ]
            body = {"success": True, "category": category, "results": simplified}
            _SYMBOL_SEARCH_CACHE[cache_key] = {"ts": time.time(), "data": body}
            return body
    except Exception as e:
        # Don't 500 on upstream failure — return empty list with error note
        return {"success": False, "error": str(e), "results": []}


# ─────────────────────────────────────────────────────────────────────────────
# Correlation Stress (Optional ② Tier C) — pairwise correlation of user portfolio
# ─────────────────────────────────────────────────────────────────────────────

from application.services import correlation_engine

# Per-ticker historical close cache: keyed by f"{ticker}::{window_days}"
# 1-hour TTL — correlations don't shift much in an hour.
_HISTORY_CACHE: Dict[str, Dict[str, Any]] = {}
_HISTORY_CACHE_TTL_SEC = 3600


class CorrelationRequest(BaseModel):
    portfolio: list[StressPortfolioAsset]
    window_days: int = 180


def _portfolio_ticker_pairs(portfolio: list) -> list[tuple[str, str, str]]:
    """
    Map portfolio entries to (user_symbol, polygon_ticker, category) tuples.
    Filters out anything Polygon can't serve (returns None ticker).
    """
    pairs = []
    for a in portfolio:
        sym = a.symbol if hasattr(a, "symbol") else a.get("symbol")
        cat = a.category if hasattr(a, "category") else a.get("category")
        ticker = _format_polygon_ticker(sym, cat)
        if ticker:
            pairs.append((sym, ticker, cat or "stock"))
    return pairs


async def _fetch_history_with_cache(
    ticker: str, start_date: str, end_date: str, window_days: int,
) -> list[dict]:
    """
    Fetch daily close history with 1-hour cache. Returns list of dicts
    with at minimum {date, close}. Empty list if Polygon returns nothing.
    """
    cache_key = f"{ticker}::{window_days}"
    cached = _HISTORY_CACHE.get(cache_key)
    if cached and (time.time() - cached["ts"] <= _HISTORY_CACHE_TTL_SEC):
        return cached["data"]

    # Use PolygonClient with format_for_charts=False to get {date, close, ...} dicts
    raw = await polygon_client.get_historical_data(
        symbols=[ticker],
        start_date=start_date,
        end_date=end_date,
        timespan="day",
        format_for_charts=False,
    )
    series = raw.get(ticker, []) or []
    _HISTORY_CACHE[cache_key] = {"ts": time.time(), "data": series}
    return series


@app.post("/api/portfolio/correlation", tags=["Portfolio"])
async def portfolio_correlation(req: CorrelationRequest):
    """
    Pairwise correlation matrix of a portfolio's daily returns.

    Returns a symbol × symbol matrix where matrix[i][j] is the Pearson
    correlation of (symbol_i daily returns, symbol_j daily returns) over
    a trailing window. Date alignment is by intersection (all symbols
    must have prices on the same trading days).

    Compliance: snapshot of past co-movement only. Does not predict
    future correlations.
    """
    endpoint = "POST /api/portfolio/correlation"
    log_request(logger, endpoint, {
        "n_assets": len(req.portfolio),
        "window_days": req.window_days,
    })

    if req.window_days < 30 or req.window_days > 730:
        raise HTTPException(status_code=400,
                            detail="window_days must be between 30 and 730")

    pairs = _portfolio_ticker_pairs(req.portfolio)
    if not pairs:
        raise HTTPException(status_code=400,
                            detail="No tradeable symbols in portfolio (none mappable to a Polygon ticker).")

    # Compute date window
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=req.window_days + 7)  # +7d buffer for weekends/holidays
    start_str = start.strftime("%Y-%m-%d")
    end_str = today.strftime("%Y-%m-%d")

    # Fetch each ticker's history (parallel via asyncio.gather)
    fetch_tasks = [
        _fetch_history_with_cache(ticker, start_str, end_str, req.window_days)
        for (_sym, ticker, _cat) in pairs
    ]
    histories = await asyncio.gather(*fetch_tasks, return_exceptions=True)

    # Build prices_by_symbol — {user_symbol: [(date, close), ...]}
    prices_by_symbol: Dict[str, list] = {}
    skipped: list[str] = []
    for (sym, ticker, _cat), hist in zip(pairs, histories):
        if isinstance(hist, Exception) or not hist:
            skipped.append(sym)
            continue
        try:
            series = sorted(
                [(item["date"], float(item["close"])) for item in hist if item.get("close") is not None],
                key=lambda x: x[0],
            )
            if len(series) < 3:
                skipped.append(sym)
                continue
            prices_by_symbol[sym] = series
        except Exception:
            skipped.append(sym)

    if not prices_by_symbol:
        body = {
            "success": False,
            "error": "No usable price history for any symbol in portfolio.",
            "skipped_symbols": skipped,
            "window_days": req.window_days,
        }
        log_response(logger, endpoint, body, success=False)
        return body

    result = correlation_engine.compute_correlation_matrix(
        prices_by_symbol, window_days=req.window_days,
    )
    if skipped:
        result["skipped_symbols"] = skipped
        result.setdefault("diagnostics", {})["skipped_count"] = len(skipped)

    log_response(logger, endpoint, {
        "symbols": result.get("symbols", []),
        "n_observations": result.get("n_observations", 0),
        "skipped": skipped,
    }, success=result.get("success", False))
    return result
