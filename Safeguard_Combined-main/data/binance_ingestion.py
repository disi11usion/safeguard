"""
Filename:    binance_ingestion.py
Author:      Suryansh Singh
Created:     2025-08-06
Description:
    Connects to the Binance WebSocket API to ingest one-minute candlestick (kline)
    data in real time for a list of cryptocurrencies, parses the closed candle,
    and writes the resulting records to the database.

Functions:
    parse_message(message: str) -> Optional[dict]
        • message: Raw JSON string from the Binance WebSocket stream.
        • Returns: A dict with parsed fields (symbol, open_time, close_time, prices,
                   volume, changes) if the candle is closed; otherwise None.

    realtime_binance(assets: dict) -> None
        • assets: Response dict from `get_crypto_data(exchange_name="binance")`
                  containing the list of symbols to subscribe to.
        • Behavior:
            1. Logs a new ingestion job via `log_ingestion_job`.
            2. Builds a WebSocket URL subscribing to each symbol’s 1m kline stream.
            3. Receives messages until one closed candle per symbol is collected
               or 60 seconds elapse.
            4. Parses each closed candle with `parse_message`.
            5. Sends the batch to `realtime_prices_ingestion` for storage.
            6. Handles errors and ensures the socket is closed.

Usage:
    $ python binance_ingestion.py

Dependencies:
    • websocket-client
    • requests
    • pandas
    • backend.database.scripts.data_request.get_crypto_data
    • backend.database.scripts.data_ingestion.log_ingestion_job,
      realtime_prices_ingestion

Environment:
    • Python 3.8+
    • Ensure `get_crypto_data` returns a successful list of symbols.
    • Uses UTC timestamps for logging and ingestion records.

Notes:
    - Logs ingestion start via `log_ingestion_job('Binance', start_time=...)`.
    - Exits gracefully if WebSocket connection fails or ingestion job cannot be logged.
    - Collects exactly one closed 1m candle per symbol, with a 60s timeout guard.
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
from backend.database.scripts.data_request import get_crypto_data
from backend.database.scripts.data_ingestion import log_ingestion_job, realtime_prices_ingestion



def parse_message(message) -> dict:
  
    msg = json.loads(message)
    k = msg.get("data", {}).get("k", {})
    if not k.get("x", False):
        return None # type: ignore

    open_ts = datetime.fromtimestamp(k["t"] / 1000)
    close_ts = datetime.fromtimestamp(k["T"] / 1000)
    open_price = float(k["o"])
    high_price = float(k["h"])
    low_price = float(k["l"])
    close_price = float(k["c"])
    volume = float(k["v"])
    price_change = close_price - open_price
    percentage_change = (price_change / open_price) * 100
    symbol = msg["data"]["s"]

    return {
        "symbol": symbol,
        "open_time": open_ts.isoformat(),
        "recorded_at": close_ts.isoformat(),
        "price_open": round(open_price, 10),
        "price_high": round(high_price, 10),
        "price_low": round(low_price, 10),
        "price": round(close_price, 10),
        "volume": round(volume, 10),
        "price_change": round(price_change, 10),
        "percentage_change": round(percentage_change, 10),
        "quote_asset_volume": "",
        "market_cap": ""
    }


def realtime_binance(assets):

    print("Connecting to Binance to receive one closed 1m candle per asset...\n")
    source_id, job_id = log_ingestion_job('Binance', start_time=datetime.now().isoformat()) # type: ignore

    if assets["success"]:  # Check success before proceeding
        symbols = [asset["symbol"] for asset in assets["data"]]  
        streams = [symbol.lower() + "@kline_1m" for symbol in symbols]
    else:
        print("Failed to get top cryptos:", assets["message"])
        exit(1)

    socket_url = "wss://stream.binance.com:9443/stream?streams=" + "/".join(streams)
    if not source_id or not job_id:
        print("Failed to log ingestion job. Exiting.")
        exit(1)
    ws = websocket.create_connection(socket_url)
    start = datetime.now()
    try:
        data = []
        processed = set()
        required = set(assets)
        while processed != required:
            message = ws.recv()
            candle = parse_message(message)
            if candle:
                data.append(candle)
                processed.add(candle["symbol"])
            end_time = datetime.now()
            if (end_time - start).total_seconds() >= 60:
                print("Exiting loop.")
                break

        result = realtime_prices_ingestion(source_id, job_id, data)
        if not result["success"]:
            print(f"Error ingesting realtime prices: {result['message']}")
            exit(1)
        print(f"All closed 1m candles received and processed successfully. {result['message']}")

    except Exception as e:
        print("Error during receive:", e)
    finally:
        ws.close()
        print("Connection closed")

if __name__ == '__main__':
    assets = get_crypto_data(exchange_name="binance")
    realtime_binance(assets)
    