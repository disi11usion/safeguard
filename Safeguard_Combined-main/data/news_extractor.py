"""
Filename:    news_extractor.py
Author:      Your Name <you@example.com>
Created:     2025-08-06
Description:
    Extracts, cleans, and tags full-text content for cryptocurrency news articles.
    Implements multiple extraction strategies (Trafilatura, Newspaper3k, Readability,
    and optionally Playwright rendering) to handle a variety of site formats,
    then tags articles with relevant coin tickers and invokes downstream processing.

Functions:
    get_ticker(symbol: str) -> str
        Extracts the base coin ticker from symbols ending in USD/USDT.
    tag_coins(text: str, coin_names: List[str], coin_tickers: List[str]) -> str
        Identifies which coins are mentioned in a text.
    fetch_html(url: str) -> str
        Retrieves raw HTML with retry/backoff and caches results.
    clean_text(text: str) -> str
        Normalizes whitespace in extracted text.
    extract_with_trafilatura(html: str) -> str
    extract_with_newspaper(html: str, url: str) -> str
    extract_with_readability(html: str) -> str
        Attempt extraction via three libraries, falling back to the longest result.
    fetch_rendered_text(url: str) -> str
        Uses Playwright to render JavaScript‐heavy pages and extract text.
    extract_best(html: str, url: str) -> str
        Chooses the best extraction among static and rendered methods, then falls back to raw HTML.
    process_file(path: str, attr1: str, attr2: str) -> None
        Reads a CSV of raw news items, extracts full text, tags coins, maps crypto IDs,
        writes out “_with_news.csv”, and calls the ingestion loader.
    webscrape_news() -> None
        Moves processed CSVs into archival folders, applies `process_file` to each,
        then archives or forwards files as appropriate and triggers the cleaning pipeline.

Usage:
    Run as part of the news ingestion pipeline:
        from news_extractor import webscrape_news
        webscrape_news()

Dependencies:
    • requests, trafilatura, newspaper3k, readability-lxml, BeautifulSoup4, lxml
    • playwright, pandas, csv, re, functools, time, shutil
    • backend.database.scripts.data_ingestion.news_ingestion
    • backend.database.scripts.data_request.get_crypto_data
    • data_cleaning_pipeline.run_news_pipeline

Environment:
    • Python 3.8+
    • Headless browser dependencies installed for Playwright rendering.
    • Ensure API access for crypto asset data via `get_crypto_data`.

Notes:
    - Caches HTML fetches to minimize repeated network calls.
    - Retries HTTP fetches with exponential backoff.
    - Tags coins by matching both full names and tickers via regex word boundaries.
    - Files are moved through IN_PROGRESS → PROCESSED → ARCHIVE directories under `data/NEWS_DATA`.
"""

import os
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))

import re
import csv
import time
import requests
from functools import lru_cache
from newspaper import Article
import trafilatura
from readability import Document
from bs4 import BeautifulSoup
from lxml.etree import ParserError
from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout
import pandas as pd
import shutil
from backend.database.scripts.data_ingestion import news_ingestion
from backend.database.scripts.data_request import get_crypto_data
from data_cleaning_pipeline import run_news_pipeline


colMapping = {
    "cointelegraph": ["title", "url", "publishedAt"],
    "cryptoslate":   ["title", "url", "publishedAt"],
    "decrypt":       ["title", "url", "publishedAt"],
    "gnews":         ["title", "url", "publishedAt"],
    "theblock":      ["title", "url", "publishedAt"],
    "mediastack":    ["title", "url", "published_at"],
    "newsapi":       ["title", "url", "publishedAt"],
    "newsdata":      ["title", "link", "pubDate"]
}

BASE_DIR = os.path.join(os.getcwd(),"data")
NEWS_DATA_DIR = os.path.join(BASE_DIR, "NEWS_DATA")
IN_PROGRESS_DIR = os.path.join(NEWS_DATA_DIR, "IN_PROGRESS")
PROCESSED_DIR = os.path.join(NEWS_DATA_DIR, "PROCESSED")
ARCHIEVE_DIR = os.path.join(NEWS_DATA_DIR, "ARCHIEVE")
EXTRACTED_NEWS_DIR = os.path.join(NEWS_DATA_DIR, "NEWS_EXTRACTED")
EXTRACTED_NEWS_DIR_ARCHIEVE = os.path.join(NEWS_DATA_DIR, "NEWS_EXTRACTED_ARCHIEVE")
LOGS_DIR = os.path.join(NEWS_DATA_DIR, "LOGS")

OUTPUT_SUFFIX = '_with_news.csv'
RETRY_ATTEMPTS = 3
BASE_SLEEP = 1  # seconds
USER_AGENT = 'Mozilla/5.0 (compatible; MixedExtractor/1.0)'
PLAYWRIGHT_USER_AGENT = 'Mozilla/5.0 (compatible; MixedRenderer/1.0)'



def get_ticker(symbol):
    for suf in ("USDT", "USD"):
        if symbol.endswith(suf):
            return symbol.replace(suf, "")
    return symbol


def tag_coins(text, coin_names, coin_tickers):
    text = str(text).lower()
    found = []
    for name, ticker in zip(coin_names, coin_tickers):
        if re.search(rf"\b{re.escape(name.lower())}\b", text) or re.search(rf"\b{re.escape(ticker.lower())}\b", text):
            found.append(ticker)
    return ", ".join(found)

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

@lru_cache(maxsize=None)
def fetch_html(url: str) -> str:
    headers = {'User-Agent': USER_AGENT}
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        try:
            resp = requests.get(url, headers=headers, timeout=5)
            resp.raise_for_status()
            return resp.text
        except requests.HTTPError as e:
            if 400 <= e.response.status_code < 500:
                return ""
        except requests.RequestException:
            pass
        time.sleep(BASE_SLEEP * (2 ** (attempt - 1)))
    return ""

def clean_text(text: str) -> str:
    tokens = [t.strip() for t in text.split() if t.strip()]
    return ' '.join(tokens)

def extract_with_trafilatura(html: str) -> str:
    return trafilatura.extract(html) or ""

def extract_with_newspaper(html: str, url: str) -> str:
    try:
        art = Article(url)
        art.set_html(html)
        art.parse()
        return art.text or ""
    except Exception:
        return ""

def extract_with_readability(html: str) -> str:
    if not html.strip():
        return ""
    try:
        summary_html = Document(html).summary()
        soup = BeautifulSoup(summary_html, 'html.parser')
        return soup.get_text(separator=' ').strip()
    except (ParserError, Exception):
        return ""

def fetch_rendered_text(url: str) -> str:
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True, args=["--no-sandbox"])
            page = browser.new_page(user_agent=PLAYWRIGHT_USER_AGENT)
            page.goto(url, timeout=15000)
            page.wait_for_load_state("networkidle", timeout=10000)
         
            for sel in ("article", "main", "body"):
                try:
                    text = page.inner_text(sel)
                    if text and len(text) > 100: 

                        return text.strip()
                except Exception:
                    continue

            return ""
    except PWTimeout:
        return ""
    except Exception:
        return ""

def extract_best(html: str, url: str) -> str:
    t = clean_text(extract_with_trafilatura(html))
    n = clean_text(extract_with_newspaper(html, url))
    r = clean_text(extract_with_readability(html))
    best = max((t, n, r), key=len)
  
    best = max((t, n, r), key=len)
    if best:
        return best
   
    rendered = fetch_rendered_text(url)
    if rendered:
        return clean_text(rendered)
   
    soup = BeautifulSoup(html, 'html.parser')
    return clean_text(soup.get_text(separator=' '))

def process_file(path: str,attr1: str, attr2: str):
    fname  = os.path.basename(path)
    source = fname.split('_', 1)[0]        
    raw_cols = colMapping.get(source)

    with open(path, newline='', encoding='utf-8') as csvfile:
        reader = csv.DictReader(csvfile)
        cols   = reader.fieldnames or []
        if 'url' in cols:
            source_col = 'url'
        elif 'link' in cols:
            source_col = 'link'
        else:
            print(f"Skipping {path}: no 'url' or 'link' column found")
            return
        rows = list(reader)

    extracted = {}
    for row in rows:
        url = row.get(source_col, '').strip()
        if not url or url in extracted:
            continue
        html = fetch_html(url)
        extracted[url] = extract_best(html, url)

    rename_map = {}
    if raw_cols:
        for col in raw_cols:
            if col == 'link':
                rename_map['link'] = 'url'
            elif col in ('pubDate', 'published_at'):
                rename_map[col] = 'publishedAt'
            else:
                rename_map[col] = col
    else:
        for c in cols:
            if c == 'link':
                rename_map[c] = 'url'
            elif c in ('pubDate', 'published_at'):
                rename_map[c] = 'publishedAt'
            else:
                rename_map[c] = c

    out_fields = ['title', 'url', 'publishedAt', 'news']
    out_path    = path.replace('.csv', OUTPUT_SUFFIX)

    with open(out_path, 'w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=out_fields)
        writer.writeheader()
        for row in rows:
            out_row = {}
            for std in ['title', 'url', 'publishedAt']:
                raw = None
                for old, new in rename_map.items():
                    if new == std:
                        raw = old
                        break
                out_row[std] = row.get(raw, '')
            url = row.get(source_col, '').strip()
            out_row['news'] = extracted.get(url, '')
            writer.writerow(out_row)

    df = pd.read_csv(out_path, encoding='utf-8')
    df['coins'] = ''
    for idx, row in df.iterrows():
        coins_val = row['coins']
        if not isinstance(coins_val, str) or not coins_val.strip():
            coins_found = tag_coins(str(row.get('title', '')) + " " + str(row.get('news', '')), COIN_NAMES, COINS)
            df.at[idx, 'coins'] = coins_found

    df['crypto_id'] = df['coins'].apply(lambda x: get_crypto_ids_for_coins(x, ticker_to_id))
    df.to_csv(out_path, index=False, encoding='utf-8')
    news_ingestion(attr1, attr2, df)
    print(f"Processed {path} -> {out_path}")

def webscrape_news():
    for fname in os.listdir(EXTRACTED_NEWS_DIR):
        src_path = os.path.join(EXTRACTED_NEWS_DIR, fname)
        dest_path= os.path.join(EXTRACTED_NEWS_DIR_ARCHIEVE, fname)
        shutil.move(src_path, dest_path)

    for fname in os.listdir(PROCESSED_DIR):
        if fname.lower().endswith('.csv'):
            attributes=fname.split("_")
            process_file(os.path.join(PROCESSED_DIR, fname),attributes[1],attributes[2])
            


    for fname in os.listdir(PROCESSED_DIR):
        src_path = os.path.join(PROCESSED_DIR, fname)
        if not os.path.isfile(src_path):
            continue

        if fname.endswith('.csv') and 'with_news.csv' in fname:
            dest_dir = EXTRACTED_NEWS_DIR
        else:
            dest_dir = ARCHIEVE_DIR

        dest_path = os.path.join(dest_dir, fname)
        shutil.move(src_path, dest_path)
        print(f"Moved {fname} → {dest_dir}")

    run_news_pipeline(EXTRACTED_NEWS_DIR, EXTRACTED_NEWS_DIR_ARCHIEVE)

