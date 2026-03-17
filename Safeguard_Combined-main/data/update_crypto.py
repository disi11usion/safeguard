"""
# file: update_crypto.py
# description: This script updates cryptocurrency 
# ranks in the database using data from Coingecko and Binance.
# Date: 15-07-2025
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))

import requests
import pandas as pd

from backend.database.scripts.data_ingestion import update_crypto_ranks

# Function to get crypto ranks from Coingecko and Binance
def get_ranks():
    # Get Coingecko market data
    print("Getting Coingecko market data...")
    coingecko_market_data = requests.get(
        "https://api.coingecko.com/api/v3/coins/markets",
        params={
            "vs_currency": "usd",
            "order": "market_cap_desc",
            "per_page": 200,
            "page": 1,
            "sparkline": False
        }
    ).json()
    if len(coingecko_market_data) < 10:
        print("Not enough data to update crypto ranks")
        return

    # Get Binance exchange info
    print("Getting Binance exchange info...")
    binance_info = requests.get("https://api.binance.com/api/v3/exchangeInfo").json()
    binance_pairs = binance_info["symbols"]

    # Map Binance symbols to USDT pairs
    print("Mapping Binance symbols...")
    binance_usdt_map = {
        pair["baseAsset"]: pair["symbol"]
        for pair in binance_pairs
        if pair["quoteAsset"] == "USDT"
    }

    # Match Coingecko and Binance symbols
    print("Matching Coingecko and Binance symbols...")
    matched = []
    for coin in coingecko_market_data:
        symbol_upper = coin["symbol"].upper()
        if symbol_upper in binance_usdt_map:
            binance_symbol = binance_usdt_map[symbol_upper]

            # Validate that Binance returns non-zero volume and price
            price_resp = requests.get("https://api.binance.com/api/v3/ticker/24hr", params={"symbol": binance_symbol})
            if price_resp.status_code == 200:
                data = price_resp.json()
                try:
                    # Validate that Binance returns non-zero volume and price
                    last_price = float(data.get("lastPrice", "0"))
                    volume = float(data.get("volume", "0"))
                    count = int(data.get("count", 0))
                    # If all values are non-zero, add to matched list
                    if last_price > 0 and volume > 0 and count > 0:
                        matched.append({
                            "name": coin["name"],
                            "symbol_coingecko": coin["symbol"],
                            "symbol_binance": binance_symbol,
                            "icon_path": coin["image"]
                        })
                except (ValueError, TypeError):
                    continue  # skip if data parsing fails

    # Create DataFrame and add rank column
    df = pd.DataFrame(matched)
    df["rank"] = range(1, len(df) + 1)

    print("Updating crypto ranks...")
    update_crypto_ranks(df)
    return

if __name__ == '__main__':
    get_ranks()