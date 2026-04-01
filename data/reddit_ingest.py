"""
Daily Reddit ingestion (UTC):
fetch → normalize → insert via the stored proc raw_data.insert_raw_social.
- Use UTC to determine whether the data has been run today to avoid duplicate writes
- Robust field mapping (selftext/permalink) and idempotent deduplication
- Safe handling of null data
"""

import os
import sys
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Dict, Any

import pandas as pd
import psycopg2
from dotenv import load_dotenv

HERE = Path(__file__).resolve()
BACKEND_ROOT = HERE.parents[1]  # .../backend
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from backend.database.scripts.data_ingestion import (  # noqa: E402
    clean_social_ingestion,
    log_ingestion_job,
    update_ingestion_job,
    social_ingestion,
)
from backend.application.clients.reddit import RedditAPIClient  # noqa: E402
from data_cleaning_pipeline import social_data_cleaning  # noqa: E402

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")


SUBREDDITS = [
    s.strip() for s in os.getenv(
        "REDDIT_SUBREDDITS",
        # --- crypto subreddits ---
        "CryptoCurrency,bitcoin,ethereum,CryptoMarkets,CryptoCurrencyTrading,"
        "BitcoinMarkets,solana,CryptoMoonShots,CryptoTechnology,"
        # --- crypto tickers ---
        "ETH,BTC,XRP,SOL,USDC,TRX,DOGE,ADA,WBTC,WBETH,LINK,BCH,USDE,XLM,SUI,HBAR,"
        "ZEC,AVAX,LTC,XMR,SHIB,TON,DOT,TAO,WLFI,UNI,AAVE,USD1,ICP,ENA,PEPE,NEAR,"
        "ETC,ASTER,ONDO,APT,POL,WLD,DASH,ARB,TRUMP,BNSOL,PUMP,ALGO,BFUSD,PAXG,ATOM,VET,"
        "SKY,JUP,QNT,NEXO,SEI,FDUSD,FIL,BONK,RENDER,PENGU,VIRTUAL,MORPHO,IMX,CAKE,OP,TIA,"
        "LDO,STX,INJ,DCR,CRV,GRT,FLOKI,XTZ,FET,2Z,PYTH,IOTA,XPL,KAIA,ETHFI,TUSD,TWT,STRK,"
        "S,CFX,PENDLE,SAND,SYRUP,ENS,ZK,ARK,WIF,JASMY,THETA,SUN,HNT,GALA,A,MANA,FLOW,"
        # --- stocks subreddits ---
        "stocks,wallstreetbets,investing,stockmarket,StockMarket,"
        "AAPL,NVDA_Stock,teslainvestorsclub,SecurityAnalysis,"
        # --- forex subreddits ---
        "Forex,ForexTrading,"
        # --- gold / commodities subreddits ---
        "Gold,commodities,wallstreetsilver,"
        # --- futures subreddits ---
        "FuturesTrading"
    ).split(",") if s.strip()
]
SORT = os.getenv("REDDIT_SORT", "top")             # hot/new/top/rising
TIMEFRAME = os.getenv("REDDIT_TIMEFRAME", "day")   # sort=top 可用：hour/day/week/month/year/all
LIMIT = int(os.getenv("REDDIT_LIMIT", "50"))

def _get_conn():
    return psycopg2.connect(DATABASE_URL)

def _today_has_reddit_job() -> bool:

    sql = """
        SELECT 1
        FROM metadata.ingestion_job_log j
        JOIN metadata.data_sources s ON s.source_id = j.source_id
        WHERE UPPER(s.name) = 'REDDIT'
          AND (j.start_time AT TIME ZONE 'UTC')::date = (now() AT TIME ZONE 'UTC')::date
          AND j.status IN ('started','staged','completed')
        LIMIT 1;
    """
    with _get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchone() is not None

def _normalize_url(permalink: str | None, url: str | None) -> str | None:
    if url:
        return url
    if permalink:
        if permalink.startswith("http"):
            return permalink
        return "https://www.reddit.com" + permalink
    return None

def _to_records(posts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for p in posts:
        created_utc = p.get("created_utc")
        if created_utc is None:
            continue
        posted_at = datetime.fromtimestamp(float(created_utc), tz=timezone.utc).isoformat()

        content = p.get("content") or p.get("selftext") or ""
        url = _normalize_url(p.get("permalink"), p.get("url"))

        out.append({
            "platform_id": p.get("id"),       
            "title":       p.get("title"),
            "content":     content,
            "posted_at":   posted_at,         
            "author":      p.get("author"),
            "url":         url,
            "comments":    [],               
        })
    
    seen = set()
    deduped = []
    for r in out:
        key = (r["platform_id"], r["posted_at"])
        if key in seen:
            continue
        seen.add(key)
        deduped.append(r)
    return deduped

async def _fetch_all() -> List[Dict[str, Any]]:
    client = RedditAPIClient()
    async def fetch_one(sub: str) -> List[Dict[str, Any]]:
        res = await client.get_subreddit_posts(
            subreddit=sub, sort=SORT, limit=LIMIT, timeframe=TIMEFRAME
        )
        return res.get("posts", [])
    results = await asyncio.gather(*[fetch_one(s) for s in SUBREDDITS], return_exceptions=False)
    posts: List[Dict[str, Any]] = []
    for lst in results:
        posts.extend(lst)
    return posts

def main():
    # 1) Guard
    if _today_has_reddit_job():
        print("[reddit_ingest] Already ingested Reddit today (UTC). Skip.")
        return

    # 2) Record job begining
    source_id, job_id = log_ingestion_job(
        source="Reddit",
        start_time=datetime.now(timezone.utc),
        status="started",
        records_processed=0,
    )
    if not source_id or not job_id:
        print("[reddit_ingest] Failed to log job. Abort.")
        return

    try:
        # 3) Scrap Reddit
        posts = asyncio.run(_fetch_all())
        records = _to_records(posts)
        print(f"[reddit_ingest] fetched posts after normalize/dedupe: {len(records)}")

        # 4) record
        if not records:
            update_ingestion_job(job_id=job_id, end_time=datetime.now(timezone.utc),
                                 status="completed", record_count=0)
            print("[reddit_ingest] no posts, job completed with 0 records.")
            return

        df = pd.DataFrame(records)
        resp = social_ingestion(source_id=source_id, job_id=job_id, records=df.to_dict("records"))
        print(f"[reddit_ingest] ingestion resp: {resp}")

        clean_df = social_data_cleaning(df.copy())
        clean_df = clean_df[clean_df["title"].astype(str).str.strip() != ""]
        clean_df = clean_df[
            ~clean_df[["title", "author", "content", "comments"]].apply(
                lambda row: all(str(x).strip().lower() in ("", "nan") for x in row),
                axis=1,
            )
        ]
        print(f"[reddit_ingest] clean rows: {len(clean_df)}")

        if clean_df.empty:
            update_ingestion_job(
                job_id=job_id,
                end_time=datetime.now(timezone.utc),
                status="completed",
                record_count=0,
            )
            print("[reddit_ingest] no clean rows, job completed with 0 records.")
            return

        clean_resp = clean_social_ingestion(source_id=source_id, job_id=job_id, records=clean_df)
        print(f"[reddit_ingest] clean ingestion resp: {clean_resp}")
        if not clean_resp.get("success"):
            raise RuntimeError(f"clean ingestion failed: {clean_resp}")

        print("[reddit_ingest] done.")
    except Exception as e:
        update_ingestion_job(job_id=job_id, end_time=datetime.now(timezone.utc),
                             status="failed", error_message=str(e))
        raise

if __name__ == "__main__":
    main()
