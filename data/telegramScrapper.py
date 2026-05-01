"""
Filename:    telegramScrapper.py
Author:      Suryansh Singh
Created:     2025-08-06
Description:
    Fetches recent messages from specified Telegram channels, deduplicates by message ID,
    logs ingestion metadata, writes results to CSV, and triggers downstream processing.

Functions:
    append_unique(
        df: pd.DataFrame,
        filepath: str,
        id_field: str,
        source_id: Any,
        job_id: Any
    ) -> None
        • Appends new records to an existing CSV (if present), drops duplicates
          based on `id_field`, logs to database, and writes updated file.

    fetch_telegram(
        source_id: Any,
        job_id: Any,
        channels: List[str],
        window_minutes: int = 61
    ) -> None
        • Connects to Telegram via Telethon, iterates recent messages from each channel
          within the past `window_minutes`, collects message data, and calls `append_unique`.

    main() -> None
        • Archives existing CSVs, logs ingestion start, invokes `fetch_telegram`,
          and runs the social data cleaning pipeline.

Usage:
    $ python telegramScrapper.py

Dependencies:
    • telethon
    • pandas
    • backend.database.scripts.data_ingestion.log_ingestion_job, social_ingestion
    • data_cleaning_pipeline.run_social_pipeline

Environment:
    • Python 3.8+
    • Set TELEGRAM_API_ID and TELEGRAM_API_HASH (hardcoded or via env vars).
    • Creates directories under `data/SOCIAL_MEDIA_DATA/TELEGRAM` and its archive.

Notes:
    - Uses UTC timestamps for cutoff and filenames.
    - Messages are deduplicated by `platform_id`.
    - Downstream pipeline is triggered via `run_social_pipeline`.
"""
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))

import os
import time
import logging
import pandas as pd
from datetime import datetime, timedelta, timezone
from telethon import TelegramClient
import shutil
from backend.database.scripts.data_ingestion import log_ingestion_job,social_ingestion
from data_cleaning_pipeline import run_social_pipeline

# === CONFIGURATION ===
TELEGRAM_API_ID = os.getenv("TELEGRAM_API_ID")
TELEGRAM_API_HASH = os.getenv("TELEGRAM_API_HASH")
CHANNELS = [
    "cryptoz",
    "https://t.me/binancekillers",
    "https://t.me/sagecr",
    "https://t.me/SharkOfficial",
    "cbinsider",
    "bitcoinnews",
    "next10xgem1",
    "cointelegraph",
    "BlockchainOfficialBinance",
    "Bitcoin_Insights",
    "Cryptocurrency_Inside",
    "binance_announcements",
    "CryptoProUpdates",
    "thecryptoexpress",
    "BitcoinAltcoinCryptoNews",
    "Bitcoin_Ethereum_Trading",
    "CryptoVIPsignalTA",
    "Whalesguide",
    "White_Bullss",
    "CryptoWorldNews"
]

BASE_DIR = os.path.join(os.getcwd(),"data")
NEWS_DATA_DIR = os.path.join(BASE_DIR, "SOCIAL_MEDIA_DATA")
TELEGRAM_DATA = os.path.join(NEWS_DATA_DIR, "TELEGRAM")
TELEGRAM_DATA_ARCHIEVE  = os.path.join(NEWS_DATA_DIR, "TELEGRAM_DATA_ARCHIEVE")

for d in [NEWS_DATA_DIR, TELEGRAM_DATA,TELEGRAM_DATA_ARCHIEVE]:
    os.makedirs(d, exist_ok=True)

FETCH_WINDOW_MINUTES = 61           

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

def append_unique(df, filepath, id_field,source_id, job_id):
    try:
        if os.path.exists(filepath):
            old = pd.read_csv(filepath)
            df = pd.concat([old, df], ignore_index=True).drop_duplicates(subset=[id_field])
        
        social_ingestion(source_id, job_id, df)
        df.to_csv(filepath, index=False)
        logging.info(f"Saved {len(df)} records to {filepath}")
    except Exception as e:
        logging.error(f"Error saving to {filepath}: {e}")


def fetch_telegram(source_id, job_id,channels,window_minutes=FETCH_WINDOW_MINUTES):
    """
    Fetch recent messages from given Telegram channels and save to timestamped CSV.
    """
    try:
        client = TelegramClient('session', TELEGRAM_API_ID, TELEGRAM_API_HASH)
        client.start()
        msgs = []
        now = datetime.now(timezone.utc)
        window_ago = now - timedelta(minutes=window_minutes)
        for ch in channels:
            try:
                entity = client.loop.run_until_complete(client.get_entity(ch))
                for msg in client.iter_messages(ch, limit=100):
                    if msg.date < window_ago:
                        break
                    msgs.append({
                        "platform_id": msg.id,
                        "title": "",
                        "content": msg.text,
                        "posted_at": msg.date.isoformat(),
                        "author": "",
                        "url":"",
                        "comments":[]
                    })
            except Exception as inner_e:
                logging.error(f"Could not fetch from channel {ch}: {inner_e}")
        client.disconnect()

        if msgs:
            df = pd.DataFrame(msgs)
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            csv_file = os.path.join(TELEGRAM_DATA, f"telegram_{source_id}_{job_id}_{timestamp}.csv")
            append_unique(df, csv_file, "id",source_id, job_id)
        else:
            logging.info("No new messages fetched.")

    except Exception as e:
        logging.error(f"Telegram fetch error: {e}")


def main():

    start = datetime.now(timezone.utc)
    for fname in os.listdir(TELEGRAM_DATA):
        src_path = os.path.join(TELEGRAM_DATA, fname)
        dest_path= os.path.join(TELEGRAM_DATA_ARCHIEVE, fname)
        shutil.move(src_path, dest_path)
    
    source_id, job_id = log_ingestion_job("Telegram", start, status='started')
    fetch_telegram(source_id, job_id,channels=CHANNELS)
    run_social_pipeline(TELEGRAM_DATA,TELEGRAM_DATA_ARCHIEVE)


if __name__ == "__main__":

    main()
