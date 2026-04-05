"""
Filename:    news_ingestion.py
Author:      Suryansh Singh
Created:     2025-08-06
Description:
    Fetches cryptocurrency news from multiple APIs and RSS feeds, deduplicates
    items using a “seen URLs” file, writes new articles to CSV files in a
    rotating in-progress → processed workflow, logs ingestion metadata, and
    triggers downstream extraction.

Functions:
    flatten_item(item: Dict[str, Any]) -> Dict[str, Any]
        • Flattens nested dictionaries/lists in a JSON news item to a flat dict.

    fetch_from_newsdata() -> List[Dict[str, Any]]
    fetch_from_newsapi() -> List[Dict[str, Any]]
    fetch_from_gnews() -> List[Dict[str, Any]]
    fetch_from_mediastack() -> List[Dict[str, Any]]
        • Retrieve “crypto” articles from various APIs, handling errors and timeouts.

    fetch_from_rss(feed_url: str) -> List[Dict[str, Any]]
        • Parses an RSS/Atom feed URL and returns items with title, url, publishedAt.

    load_seen() -> set
        • Loads previously-seen URLs from SEEN_FILE to avoid duplicates.

    update_seen(urls: List[str]) -> None
        • Appends new URLs to SEEN_FILE after successful processing.

    save_csv(items: List[Dict], source: str, source_id, job_id) -> None
        • Filters out seen URLs, flattens items, writes to a timestamped CSV in
          IN_PROGRESS_DIR then moves to PROCESSED_DIR, logs counts, updates seen list.

    main() -> None
        • Defines RSS feed list and source mappings.
        • In an endless loop, fetches articles from all sources, logs ingestion start,
          invokes save_csv for each, records elapsed time, calls news_extractor, then exits.

Usage:
    $ python news_ingestion.py

Dependencies:
    • Python 3.8+
    • requests, feedparser, polars, gnews-client
    • backend.database.scripts.data_ingestion.log_ingestion_job
    • news_extractor.webscrape_news
    • logging with TimedRotatingFileHandler

Environment:
    • Ensure environment variables/API keys for NEWSDATA_API_KEY, NEWSAPI_API_KEY,
      MEDIASTACK_API_KEY are set in code or via env.
    • Creates data directories under ./data/NEWS_DATA/ and uses UTC timestamps.

Notes:
    - Uses a rotating log file every hour (24 backups).
    - SEEN_FILE prevents reprocessing the same article across runs.
    - CSV filenames include source, source_id, job_id, and UTC hour for traceability.
"""

import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))

import time, os, requests, feedparser
from datetime import timezone, datetime
from typing import List, Dict, Any
import polars as pl
from gnews import GNews
import logging
import news_extractor
from backend.database.scripts.data_ingestion import log_ingestion_job
from logging.handlers import TimedRotatingFileHandler

BASE_DIR = os.path.join(os.getcwd(),"data")
NEWS_DATA_DIR = os.path.join(BASE_DIR, "NEWS_DATA")
IN_PROGRESS_DIR = os.path.join(NEWS_DATA_DIR, "IN_PROGRESS")
PROCESSED_DIR = os.path.join(NEWS_DATA_DIR, "PROCESSED")
ARCHIEVE_DIR = os.path.join(NEWS_DATA_DIR, "ARCHIEVE")
EXTRACTED_NEWS_DIR = os.path.join(NEWS_DATA_DIR, "NEWS_EXTRACTED")
EXTRACTED_NEWS_DIR_ARCHIEVE = os.path.join(NEWS_DATA_DIR, "NEWS_EXTRACTED_ARCHIEVE")
LOGS_DIR = os.path.join(NEWS_DATA_DIR, "LOGS")
SEEN_FILE = os.path.join(NEWS_DATA_DIR, "seen_urls.txt")

for d in [IN_PROGRESS_DIR, PROCESSED_DIR, LOGS_DIR,ARCHIEVE_DIR,EXTRACTED_NEWS_DIR,EXTRACTED_NEWS_DIR_ARCHIEVE]:
    os.makedirs(d, exist_ok=True)

log_file = os.path.join(LOGS_DIR, "fetcher.log")

handler = TimedRotatingFileHandler(
    filename=log_file,
    when='H',
    interval=1,
    backupCount=24,
    utc=True
)
handler.suffix = "%Y%m%d%H.log"
handler.setFormatter(
    logging.Formatter(
        fmt='%(asctime)s %(levelname)s: %(message)s',
        datefmt='%Y-%m-%dT%H:%M:%SZ'
    )
)

logger = logging.getLogger()
logger.setLevel(logging.INFO)
logger.addHandler(handler)

NEWSDATA_API_KEY   = os.getenv("NEWSDATA_API_KEY")
NEWSAPI_API_KEY    = os.getenv("NEWSAPI_API_KEY")
MEDIASTACK_API_KEY = os.getenv("MEDIASTACK_API_KEY")
_gnews = GNews(language='en', max_results=10)


def flatten_item(item: Dict[str, Any]) -> Dict[str, Any]:
    flat = {}
    for k, v in item.items():
        if isinstance(v, dict):
            for sub_k, sub_v in v.items():
                flat[f"{k}_{sub_k}"] = sub_v
        elif isinstance(v, list):
            flat[k] = ", ".join(map(str, v))
        else:
            flat[k] = v
    return flat


def fetch_from_newsdata() -> List[Dict[str, Any]]:
    try:
        resp = requests.get(
            "https://newsdata.io/api/1/news",
            params={"apikey": NEWSDATA_API_KEY, "q": "crypto OR stocks OR forex OR gold OR futures", "language": "en", "category": "business"},
            timeout=10
        )
        resp.raise_for_status()
        return resp.json().get("results", [])
    except Exception as e:
        logging.error(f"newsdata fetch error: {e}")
        return []


def fetch_from_newsapi() -> List[Dict[str, Any]]:
    try:
        resp = requests.get(
            "https://newsapi.org/v2/everything",
            params={"apiKey": NEWSAPI_API_KEY, "q": "cryptocurrency OR stock market OR forex OR gold price OR futures", "pageSize": 100, "sortBy": "publishedAt"},
            timeout=10
        )
        resp.raise_for_status()
        return resp.json().get("articles", [])
    except Exception as e:
        logging.error(f"newsapi fetch error: {e}")
        return []


def fetch_from_gnews() -> List[Dict[str, Any]]:
    try:
        articles = _gnews.get_news('finance stock forex gold crypto')
        return [{"title": a['title'], "url": a['url'], "publishedAt": a.get('published date')} for a in articles]
    except Exception as e:
        logging.error(f"gnews fetch error: {e}")
        return []


def fetch_from_mediastack() -> List[Dict[str, Any]]:
    try:
        resp = requests.get(
            "http://api.mediastack.com/v1/news",
            params={"access_key": MEDIASTACK_API_KEY, "keywords": "crypto,stocks,forex,gold,futures", "languages": "en", "limit": 100},
            timeout=10
        )
        resp.raise_for_status()
        return resp.json().get("data", [])
    except Exception as e:
        logging.error(f"mediastack fetch error: {e}")
        return []


def fetch_from_rss(feed_url: str) -> List[Dict[str, Any]]:
    try:
        parsed = feedparser.parse(feed_url)
        return [{"title": e.get("title"), "url": e.get("link"), "publishedAt": e.get("published") or e.get("updated")} for e in parsed.entries]
    except Exception as e:
        logging.error(f"RSS fetch error ({feed_url}): {e}")
        return []


def load_seen() -> set:
  
    if not os.path.exists(SEEN_FILE):
        return set()
    try:
        with open(SEEN_FILE, 'r') as f:
            return {line.strip() for line in f if line.strip()}
    except Exception as e:
        logger.error(f"load_seen error: {e}")
        return set()


def update_seen(urls: List[str]):

    if not urls:
        return
    try:
        with open(SEEN_FILE, 'a') as f:
            for u in urls:
                f.write(u + "\n")
    except Exception as e:
        logger.error(f"update_seen error: {e}")


def save_csv(items: List[Dict], source: str, source_id, job_id):
    seen = load_seen()
    new_items = []
    new_urls = []

    for it in items:
        url = it.get("url") or it.get("link")
        if not url or url in seen:
            continue
        new_items.append(it)
        new_urls.append(url)

    if not new_items:
        logger.info(f"no new items for {source}")
        return

    try:
        df = pl.DataFrame([flatten_item(it) for it in new_items])
        now = datetime.now(timezone.utc)
        filename = f"{source}_{source_id}_{job_id}_{now.strftime('%Y%m%d%H')}.csv"
        in_prog_path = os.path.join(IN_PROGRESS_DIR, filename)

        df.write_csv(in_prog_path)
        proc_path = os.path.join(PROCESSED_DIR, filename)
        os.replace(in_prog_path, proc_path)

        update_seen(new_urls)

        logger.info(f"saved {len(new_items)} items for {source} to {proc_path}")
    except Exception as e:
        logger.error(f"save_csv error ({source}): {e}")


def main():
    rss_feeds = {
        # crypto
        "cointelegraph": "https://cointelegraph.com/rss",
        "cryptoslate":   "https://cryptoslate.com/feed/",
        "theblock":      "https://www.theblock.co/rss.xml",
        "decrypt":       "https://decrypt.co/feed",
        # stocks / general finance
        "marketwatch":   "https://feeds.content.dowjones.io/public/rss/mw_topstories",
        "investing_rss": "https://www.investing.com/rss/news.rss",
        # forex
        "forexlive":     "https://www.forexlive.com/feed",
        # gold / commodities
        "kitco":         "https://www.kitco.com/rss/kitco-news.xml",
    }

    source_mapping = {
        "cointelegraph" : "CoinTelegraph",
        "cryptoslate":   "CryptoSlate",
        "theblock":      "The Block",
        "decrypt":       "Decrypt",
        "marketwatch":   "MarketWatch",
        "investing_rss": "Investing.com",
        "forexlive":     "ForexLive",
        "kitco":         "Kitco",
        "newsdata":   "NewsData",
        "newsapi":    "NewsAPI",
        "gnews":      "GNews",
        "mediastack": "Mediastack"
    }
    while True:
        start = datetime.now(timezone.utc)
        try:
            sources = {
                "newsdata":   fetch_from_newsdata(),
                "newsapi":    fetch_from_newsapi(),
                "gnews":      fetch_from_gnews(),
                "mediastack": fetch_from_mediastack(),
            }
            for name, url in rss_feeds.items():
                sources[name] = fetch_from_rss(url)

            for src, items in sources.items():
                source_id, job_id = log_ingestion_job(source_mapping[src], start, status='started')
                save_csv(items, src, source_id, job_id)

            elapsed = (datetime.now(timezone.utc) - start).total_seconds()
            logging.info(f"cycle complete in {elapsed:.2f}s")
            print("Extracting news")
            news_extractor.webscrape_news()
            
            break
            
        
        except Exception as err:
            logging.error(f"main loop error: {err}")
        

if __name__ == "__main__":
    print("Starting crypto news fetcher")
    logging.info("Starting crypto news fetcher")
    main()
