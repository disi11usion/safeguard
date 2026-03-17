"""
# file: binance_historic_ingestion.py
# description: This script fetches historical price data for cryptocurrencies from Binance.
# Date: 01-08-2025
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))

import json
import websocket
import pandas as pd
import requests
import time
from datetime import datetime, timedelta, timezone
from backend.database.scripts.data_request import get_crypto_data, get_last_historic_run
from backend.database.scripts.data_ingestion import log_ingestion_job, historic_prices_ingestion
import market_indicators

# Function to fetch historic price data from Binance
def historic_binance(assets):
    symbols = list(map(lambda asset: asset["symbol"], assets["data"]))
    if not symbols:
        print("No active symbols found in assets.")
        return pd.DataFrame()

    print(f"Starting historic ingestion for {len(symbols)} assets...\n")
    source_id, job_id = log_ingestion_job("Binance", start_time=datetime.now().isoformat())

    # Constants for Binance API
    binance_url = "https://api.binance.com/api/v3/klines"
    fetching_gap = "1d"
    limit = 1000
    requests_gap = 0.2
    days_before_fetching = datetime.now(timezone.utc) - timedelta(days=420)
    today = datetime.now(timezone.utc)

    # Accumulate all records here
    all_records = []

    # Fetch kline data from Binance
    def fetch_klines(symbol, start_ts, end_ts):
        start_ms = int(start_ts.timestamp() * 1000)
        end_ms = int(end_ts.timestamp() * 1000)
        params = {
            "symbol": symbol,
            "interval": fetching_gap,
            "startTime": start_ms,
            "endTime": end_ms,
            "limit": limit
        }
        try:
            response = requests.get(binance_url, params=params)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.RequestException as e:
            print(f"Request failed for {symbol}: {e}")
            return []

    # Converting candle data into dicts and collecting them
    def process_klines(symbol, candles):
        for c in candles:
            try:
                timestamp_sec_open = int(c[0] / 1000)
                timestamp_sec_close = int(c[6] / 1000)
                open_time = datetime.fromtimestamp(timestamp_sec_open)
                close_time = datetime.fromtimestamp(timestamp_sec_close)
                price_open = float(c[1])
                price_high = float(c[2])
                price_low = float(c[3])
                price_close = float(c[4])
                volume = float(c[5])
                quote_asset_volume = float(c[7])
                price_change = price_close - price_open
                percentage_change = (price_change / price_open) * 100 if price_open != 0 else 0.0

                all_records.append({
                    "symbol": symbol,
                    "open_time": open_time.isoformat(),
                    "recorded_at": close_time.isoformat(),
                    "price_open": price_open,
                    "price_high": price_high,
                    "price_low": price_low,
                    "price": price_close,
                    "volume": volume,
                    "price_change": price_change,
                    "percentage_change": percentage_change,
                    "quote_asset_volume": quote_asset_volume,
                    "market_cap": ""
                })
            except Exception as e:
                print(f"Error processing candle for {symbol}: {e}")

    # Fetching data for each asset
    for asset in assets["data"]:
        symbol = asset["symbol"]
        last_iso = asset.get("last_recorded_at")
        # If the asset has been recorded before, we start from the last recorded time
        if last_iso:
            start_dt = datetime.fromisoformat(str(last_iso))
            start_dt = start_dt + timedelta(seconds=1)
        else:
            # first run for this coin
            start_dt = today - timedelta(days=420)

        current = start_dt
        while current < today:
            end = min(current + timedelta(days=limit), today)
            candles = fetch_klines(symbol, current, end)
            if not candles:
                break
            process_klines(symbol, candles)
            # Updating the current time to the last open time
            last_open_ms = candles[-1][0]
            last_open = datetime.fromtimestamp(last_open_ms/1000, tz=timezone.utc)
            current = last_open + timedelta(days=1)
            time.sleep(requests_gap)

    print("\nHistoric data fetching complete.")
    if len(all_records) > 0:
        historic_prices_ingestion(source_id, job_id, all_records)
        # Call market indicators after successful data ingestion
        print("Calculating market indicators...")
        market_indicators.main()  # Call the main function from market_indicators
        print("Market indicators calculation complete.")
    else:
        print("No records to ingest.")
        exit(1)
    return
    

if __name__ == '__main__':
    assets = get_last_historic_run()
    if assets['success']:
        historic_binance(assets)
    else:
        print(assets['message'])
    