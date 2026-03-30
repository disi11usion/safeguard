"""
Filename:    coinGeckoHistoricDataOneYear.py
Author:      Suryansh Singh
Created:     2025-08-06
Description:
    Retrieves 365 days of historical OHLC, volume, and market cap data for 
    your top cryptocurrencies from the CoinGecko API, handles rate-limit 
    backoff, and writes a consolidated CSV file.

Functions:
    safe_get(url: str, params: Dict[str, Any]) -> requests.Response
        • Performs GET with retry-on-429 logic and exponential backoff.
    fetch_coin_list() -> Dict[str, str]
        • Fetches CoinGecko’s full coin list and returns a symbol→ID map.
    fetch_market_chart(coin_id: str, days: int = DAYS) -> Dict[str, Any]
        • Retrieves 365-day time series of prices, volumes, and market caps.
    fetch_ohlc(coin_id: str, days: int = DAYS) -> List[List[float]]
        • Retrieves 365-day OHLC arrays for the given coin ID.

Main Workflow (in `main()`):
    1. Load user’s coin list via `get_crypto_data(exchange_name="coingecko")`.
    2. Build a mapping from symbol to CoinGecko ID.
    3. Iterate each coin:
       - Fetch market chart and OHLC data.
       - Compute timestamps, open/high/low/close, volume, price change, pct change.
       - Append each record to `top50_365d_market_chart.csv`.
       - Respect the configured REQUESTS_PER_MIN rate limit.
    4. Log progress and errors via the standard Python logger.

Usage:
    $ python coinGeckoHistoricDataOneYear.py

Configuration:
    • DAYS: number of days of history (default 365).
    • REQUESTS_PER_MIN: rate-limit throttle.
    • CSV_FILE: output path for the consolidated CSV.

Dependencies:
    • requests
    • csv
    • logging
    • get_crypto_data from `backend.database.scripts.data_request`
    • Python 3.8+

Notes:
    - Retries up to `MAX_RETRIES_429` on HTTP 429 responses.
    - Respects `Retry-After` header when provided.
    - CSV includes: coin_id, symbol, open_time, recorded_at, price_open,
      price_high, price_low, price_close, volume, quote_asset_volume,
      price_change, percentage_change, market_cap.
"""

import requests
import time
import csv
import logging
from pathlib import Path
from typing import Any, Dict, List, Tuple
from datetime import datetime
import sys
import os
sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.database.scripts.data_request import get_crypto_data
# optional if you want to ingest back into your DB:
# from backend.database.scripts.data_ingestion import historic_prices_ingestion

# ─── CONFIG ─────────────────────────────────────────────────────────────────────
API_BASE                = "https://api.coingecko.com/api/v3"
DAYS                    = 365
currPath                = os.path.join(os.getcwd(),"data")
CSV_FILE                = os.path.join(currPath,"top50_365d_market_chart.csv")
REQUESTS_PER_MIN        = 30
REQUEST_DELAY           = 60.0 / REQUESTS_PER_MIN  

MAX_RETRIES_429         = 3
MAX_RETRY_AFTER_SECONDS = 10
# ────────────────────────────────────────────────────────────────────────────────

def safe_get(url: str, params: Dict[str, Any]) -> requests.Response:

    backoff = REQUEST_DELAY
    for attempt in range(1, MAX_RETRIES_429 + 1):
        resp = requests.get(url, params=params)
        if resp.status_code == 429:
            ra = resp.headers.get("Retry-After")
            try:
                wait = min(int(ra), MAX_RETRY_AFTER_SECONDS) if ra else backoff
            except ValueError:
                wait = backoff
            logging.warning("429 for %s (try %d/%d); sleeping %ds",
                            url, attempt, MAX_RETRIES_429, wait)
            time.sleep(wait)
            backoff *= 2
            continue
        resp.raise_for_status()
        return resp
    resp.raise_for_status()
    return resp  

def fetch_coin_list() -> Dict[str, str]:
    
    resp = safe_get(f"{API_BASE}/coins/list", {})
    pairs = resp.json() 
    return { c["symbol"].lower(): c["id"] for c in pairs }

def fetch_market_chart(coin_id: str, days: int = DAYS) -> Dict[str, Any]:
    url = f"{API_BASE}/coins/{coin_id}/market_chart"
    params = {"vs_currency": "usd", "days": days}
    return safe_get(url, params).json()

def fetch_ohlc(coin_id: str, days: int = DAYS) -> List[List[float]]:
    
    url = f"{API_BASE}/coins/{coin_id}/ohlc"
    params = {"vs_currency": "usd", "days": days}
    return safe_get(url, params).json()

def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(message)s"
    )
    logger = logging.getLogger(__name__)

    assets_resp = get_crypto_data(exchange_name="coingecko")
    assets      = assets_resp.get("data", [])
    if not assets:
        logger.error("No assets returned; exiting.")
        return

    id_map = fetch_coin_list()

    coin_list: List[Tuple[str,str]] = []
    for item in assets:
        sym = item.get("symbol", "").lower()
        cg_id = id_map.get(sym)
        if not cg_id:
            logger.error("No CoinGecko ID for symbol '%s'; skipping.", sym)
            continue
        coin_list.append((cg_id, sym))

    with open(CSV_FILE, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "coin_id", "symbol",
            "open_time", "recorded_at",
            "price_open", "price_high", "price_low", "price_close",
            "volume", "quote_asset_volume",
            "price_change", "percentage_change",
            "market_cap"
        ])

        for coin_id, symbol in coin_list:
            logger.info("Processing %s (%s)", coin_id, symbol)
            try:
                chart = fetch_market_chart(coin_id, DAYS)
                ohlc  = fetch_ohlc(coin_id, DAYS)
                caps  = chart.get("market_caps", [])
                vols  = chart.get("total_volumes", [])

                for (ts, o, h, l, c), (_, cap), (_, vol) in zip(ohlc, caps, vols):
                    open_dt     = datetime.utcfromtimestamp(ts / 1000)
                    recorded_at = datetime.utcnow().isoformat()

                    price_open  = o
                    price_high  = h
                    price_low   = l
                    price_close = c

                    price_change      = price_close - price_open
                    percentage_change = (price_change / price_open * 100) if price_open else None

                    writer.writerow([
                        coin_id,
                        symbol,
                        open_dt.isoformat(),
                        recorded_at,
                        price_open,
                        price_high,
                        price_low,
                        price_close,
                        vol,            
                        vol,          
                        price_change,
                        percentage_change,
                        cap
                    ])

            except Exception as e:
                logger.error("Failed %s: %s", coin_id, e)

            time.sleep(REQUEST_DELAY)

    logger.info("Complete! CSV written to %s", CSV_FILE)

if __name__ == "__main__":
    main()
