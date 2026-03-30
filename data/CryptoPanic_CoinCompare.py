"""
Filename:    CryptoPanic_CoinCompare.py
Author:      Suryansh Singh
Created:     2025-08-06
Description:
    Orchestrates coin-specific news ingestion from CryptoCompare and Cryptopanic:
      - Fetches current coin list from your database (Binance exchange).
      - Archives previous run’s CSVs.
      - Fetches news from:
          • CryptoCompare API (categories=coin tickers)
          • Cryptopanic API (paged news posts)
      - Tags each article with matching coin tickers and resolves their crypto IDs.
      - Logs ingestion jobs via `log_ingestion_job`, then calls `news_ingestion` to insert into DB.
      - Writes out timestamped CSVs under `data/NEWS_DATA/COIN_SPECIFIC_NEWS_DATA/`.

Functions:
    tag_coins(text: str, coin_names: List[str], coin_tickers: List[str]) -> str
        Identify and join tickers mentioned in the text.
    get_ticker(symbol: str) -> str
        Strip USD/USDT suffix to obtain base coin ticker.
    get_crypto_ids_for_coins(coins_str: str, ticker_to_id: Dict[str,str]) -> str
        Map comma-separated tickers to comma-separated crypto IDs.

Usage:
    $ python CryptoPanic_CoinCompare.py

Dependencies:
    • requests, pandas, shutil, logging
    • backend.database.scripts.data_request.get_crypto_data
    • backend.database.scripts.data_ingestion.log_ingestion_job, news_ingestion

Environment:
    • Python 3.8+
    • Ensure API keys for CryptoCompare and Cryptopanic are configured.
    • Data directories under `./data/NEWS_DATA/COIN_SPECIFIC_NEWS_DATA/` are auto-created.

Notes:
    - Each ingestion step is wrapped in try/except to mark job status as started/failed.
    - CSV filenames include source name, job IDs, and UTC timestamp.
    - Uses regex word boundaries to match full coin names or tickers in article text.
"""


import requests
import sys
from pathlib import Path
import pandas as pd
import os
import shutil
from datetime import timezone, datetime
import re
import logging

timestamp = datetime.now().strftime("%d%m%Y_%H%M%S")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)]
)

logger = logging.getLogger(__name__)
sys.path.append(str(Path(__file__).resolve().parents[1]))

from backend.database.scripts.data_request import get_crypto_data
from backend.database.scripts.data_ingestion import (log_ingestion_job , news_ingestion)

BASE_DIR = os.path.join(os.getcwd(), "data")
NEWS_DATA = os.path.join(BASE_DIR, "NEWS_DATA")
COIN_SPECIFIC_NEWS_DATA = os.path.join(NEWS_DATA, "COIN_SPECIFIC_NEWS_DATA")
COIN_SPECIFIC_NEWS_DATA_ARCHIEVE = os.path.join(NEWS_DATA, "COIN_SPECIFIC_NEWS_DATA_ARCHIEVE")


for d in [NEWS_DATA, COIN_SPECIFIC_NEWS_DATA, COIN_SPECIFIC_NEWS_DATA_ARCHIEVE]:
    os.makedirs(d, exist_ok=True)


for fname in os.listdir(COIN_SPECIFIC_NEWS_DATA):
    src = os.path.join(COIN_SPECIFIC_NEWS_DATA, fname)
    dst = os.path.join(COIN_SPECIFIC_NEWS_DATA_ARCHIEVE, fname)
    try:
        shutil.move(src, dst)
    except Exception as move_e:
        logger.warning(f"Couldn’t archive {fname}: {move_e}")


def tag_coins(text, coin_names, coin_tickers):
    text = str(text).lower()
    found = []
    for name, ticker in zip(coin_names, coin_tickers):
        if re.search(rf"\b{re.escape(name.lower())}\b", text) or re.search(rf"\b{re.escape(ticker.lower())}\b", text):
            found.append(ticker)
    return ", ".join(found)


def get_ticker(symbol):
    for suf in ("USDT", "USD"):
        if symbol.endswith(suf):
            return symbol.replace(suf, "")
    return symbol



assets_resp = get_crypto_data(exchange_name="binance")
assets = assets_resp.get("data", [])

COINS = []
COIN_NAMES = []
seen = set()
for c in assets:
    ticker = get_ticker(c['symbol'])
    if ticker not in seen:
        seen.add(ticker)
        COINS.append(ticker)
        COIN_NAMES.append(c['name'])

def get_crypto_ids_for_coins(coins_str, ticker_to_id):
    tickers = [c.strip() for c in coins_str.split(',') if c.strip()]
    ids = [str(ticker_to_id.get(ticker, "")) for ticker in tickers]
    ids = [i for i in ids if i]
    return ",".join(ids)

ticker_to_id = {}
for c in assets:
    ticker = get_ticker(c['symbol'])
    ticker_to_id[ticker] = c['crypto_id']

try:
    start = datetime.now(timezone.utc)

    source_id, job_id = log_ingestion_job("Cryptocompare", start, status='started')
    
    API_KEY_CC = os.getenv("CRYPTO_COMPARE_API_KEY")
    url_cc = "https://min-api.cryptocompare.com/data/v2/news/"
    params_cc = {
        "categories": ",".join(COINS),
        "lang": "EN",
        "api_key": API_KEY_CC
    }
    resp_cc = requests.get(url_cc, params=params_cc)
    resp_cc.raise_for_status()
    news_items_cc = resp_cc.json()["Data"]

    rows_cc = []
    coins_str = ""
    for item in news_items_cc:
        rows_cc.append({
            "title": item.get('title'),
            "url": item.get('url'),
            "coins": coins_str,
            "published_on": item.get('published_on'),
            "body": item.get('body'),
            "source": item.get('source'),
            "tags": item.get('tags'),
            "platform": "cryptocompare"
        })
    df_cc = pd.DataFrame(rows_cc)


    for idx, row in df_cc.iterrows():
        coins_val = row['coins']
        if not isinstance(coins_val, str) or not coins_val.strip():
            coins_found = tag_coins(str(row.get('title', '')) + " " + str(row.get('body', '')), COIN_NAMES, COINS)
            df_cc.at[idx, 'coins'] = coins_found

    df_cc['crypto_id'] = df_cc['coins'].apply(lambda x: get_crypto_ids_for_coins(x, ticker_to_id))
    df_cc = (
        df_cc
        .rename(columns={
            "published_on": "publishedAt",
            "body":         "news",
        })
        [["title", "url", "publishedAt", "news", "coins", "crypto_id"]]
    )

    news_ingestion(source_id, job_id, df_cc)
    now = datetime.now(timezone.utc)
    filename = f"cryptocompare_{source_id}_{job_id}_{datetime.now(timezone.utc).strftime('%Y%m%d%H')}.csv"
    df_cc.to_csv(os.path.join(COIN_SPECIFIC_NEWS_DATA, filename), index=False)
    print("Saved ",filename)

    logger.info("Saved CryptoCompare news")
except Exception as e:
    logger.error(f"CryptoCompare ingestion failed: {e}", exc_info=True)
   
    log_ingestion_job("Cryptocompare", datetime.now(timezone.utc), status='failed')

####### CRYPTOPANIC #######
try:
    start = datetime.now(timezone.utc)
    logger.info("🚀 Starting Cryptopanic ingestion")
    source_id, job_id = log_ingestion_job("Cryptopanic", start, status='started')
    print(COINS)
    API_KEY_CP = os.getenv("CRYPTO_PANIC_API_KEY") 
    url_cp = "https://cryptopanic.com/api/v1/posts/"
    params_cp = {
        "auth_token": API_KEY_CP,
        "currencies": ",".join(COINS[:50]),
        "filter": "news",
        "public": "true",
        "page": 1
    }

    news_items_cp = []
    while True:
        resp_cp = requests.get(url_cp, params=params_cp)
        resp_cp.raise_for_status()
        results = resp_cp.json().get("results", [])
        if not results:
            break
        for item in results:
            currencies = item.get("currencies")
            if currencies and isinstance(currencies, list):
                coins_str = ", ".join([c.get('code', '') for c in currencies if c.get('code')])
            else:
                coins_str = ""
            news_items_cp.append({
                "title": item.get("title"),
                "url": item.get("url"),
                "coins": coins_str,
                "published_on": item.get("published_at"),
                "body": item.get("body"),
                "source": item.get("source", {}).get("title"),
                "tags": ", ".join(item.get("tags", [])),
                "platform": "cryptopanic"
            })
        params_cp["page"] += 1

    df_cp = pd.DataFrame(news_items_cp)
    for idx, row in df_cp.iterrows():
        coins_val = row['coins']
        if not isinstance(coins_val, str) or not coins_val.strip():
            coins_found = tag_coins(str(row.get('title', '')) + " " + str(row.get('body', '')), COIN_NAMES, COINS)
            df_cp.at[idx, 'coins'] = coins_found

    df_cp['crypto_id'] = df_cp['coins'].apply(lambda x: get_crypto_ids_for_coins(x, ticker_to_id))
    df_cp = (
        df_cp
        .rename(columns={
            "published_on": "publishedAt",
            "body":         "news",
        })
        [["title", "url", "publishedAt", "news", "coins", "crypto_id"]]
    )

    news_ingestion(source_id, job_id, df_cp)
    now = datetime.now(timezone.utc)
    filename = f"cryptopanic_{source_id}_{job_id}_{datetime.now(timezone.utc).strftime('%Y%m%d%H')}.csv"
    df_cp.to_csv(os.path.join(COIN_SPECIFIC_NEWS_DATA, filename), index=False)
    print("Saved...", filename)
    
        
    logger.info("Saved cryptopanic news")
except Exception as e:
    logger.error(f"Cryptopanic ingestion failed: {e}", exc_info=True)
    log_ingestion_job("Cryptopanic", datetime.now(timezone.utc), status='failed')