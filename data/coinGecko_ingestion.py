"""
Filename:    coinGecko_ingestion.py
Author:      Suryansh Singh
Created:     2025-08-06
Description:
    Retrieves market data for the top coins by market cap from CoinGecko’s REST API,
    converts it into a format matching your real-time ingestion schema, and writes
    the resulting candle records to your database.

Functions:
    build_symbol_map() -> dict
        • Fetches the full list of CoinGecko coins and returns a mapping
          from lowercase coin names to their CoinGecko IDs.

    fetch_top50_as_candles(coin_ids: List[str]) -> List[dict]
        • Queries `/coins/markets` for the specified coin IDs.
        • Extracts the latest price, 24h high/low, volume, and price change.
        • Constructs a list of candle-like dicts matching your realtime schema.

Usage:
    $ python coinGecko_ingestion.py

Dependencies:
    • requests
    • pandas
    • backend.database.scripts.data_request.get_crypto_data
    • backend.database.scripts.data_ingestion.log_ingestion_job,
      realtime_prices_ingestion

Environment:
    • Python 3.8+
    • Ensure you have a valid internet connection for the CoinGecko API.
    • No API key is required for public endpoints.

Notes:
    - The symbol in output is formatted as UPPERCASE + “USDT” (e.g., “BTCUSDT”).
    - Timestamps are taken from `last_updated` and passed through `log_ingestion_job`.
    - If a coin’s name does not map to a CoinGecko ID, a warning is logged and it is skipped.
"""

import requests
import json
import sys
import logging
from pathlib import Path
from datetime import datetime
from typing import List

sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.database.scripts.data_request   import get_crypto_data
from backend.database.scripts.data_ingestion import (
    log_ingestion_job,
    realtime_prices_ingestion
)

API_BASE     = "https://api.coingecko.com/api/v3"
MARKETS_URL  = f"{API_BASE}/coins/markets"
LIST_URL     = f"{API_BASE}/coins/list"
VS_CURRENCY  = "usd"

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

def build_symbol_map() -> dict:
    resp = requests.get(LIST_URL)
    resp.raise_for_status()
    coins = resp.json()
    return { coin["name"].lower(): coin["id"] for coin in coins }

def fetch_top50_as_candles(coin_ids: List[str]):
    params = {
        "vs_currency": VS_CURRENCY,
        "ids":          ",".join(coin_ids),
        "order":        "market_cap_desc",
        "per_page":     len(coin_ids),
        "page":         1,
        "sparkline":    "false",
        "price_change_percentage": "24h",
    }
    resp = requests.get(MARKETS_URL, params=params)
    resp.raise_for_status()
    coins = resp.json()

    records = []
    for coin in coins:
        last_updated = coin["last_updated"]       
        close_price  = coin.get("current_price") or 0.0
        change_24h   = coin.get("price_change_24h") or 0.0

        high_24h     = coin.get("high_24h") or 0.0
        low_24h      = coin.get("low_24h")  or 0.0
        total_vol    = coin.get("total_volume") or 0.0
        pct_change   = coin.get("price_change_percentage_24h") or 0.0
        market_cap   = coin.get("market_cap") or 0.0

        rec = {
            "symbol":            coin["symbol"].upper() + "USDT",
            "open_time":         last_updated,
            "recorded_at":       last_updated,
            "price_open":        round(close_price - change_24h, 10),
            "price_high":        round(high_24h, 10),
            "price_low":         round(low_24h,  10),
            "price":             round(close_price, 10),
            "volume":            round(total_vol, 10),
            "price_change":      round(change_24h, 10),
            "percentage_change": round(pct_change, 10),
            "quote_asset_volume":"",
            "market_cap":        round(market_cap, 10)
        }
        records.append(rec)

    return records

if __name__ == "__main__":
    
    print("Starting CoinGecko ingestion...")
    source_id, job_id = log_ingestion_job("CoinGecko", start_time=datetime.utcnow().isoformat())

    assets_resp = get_crypto_data(exchange_name="coingecko")
    assets = assets_resp.get("data", [])
    symbol_map = build_symbol_map()

    coin_ids = []
    for asset in assets:
        name = asset['name']
        cg_id = symbol_map.get(name.lower())
        if cg_id:
            coin_ids.append(cg_id)
        else:
            logging.warning("No CoinGecko ID for coin %s", name)

    if not coin_ids:
        logging.error("No valid CoinGecko IDs found—aborting.")
        sys.exit(1)

    candles = fetch_top50_as_candles(coin_ids)
    realtime_prices_ingestion(source_id, job_id, candles)
    logging.info("Ingestion complete: %d records", len(candles))
    print('CoinGecko ingestion complete: %d records', len(candles))