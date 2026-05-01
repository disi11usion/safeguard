"""
Filename:    youTubeScrapper.py
Author:      Suryansh Singh
Created:     2025-08-06
Description:
    Fetches recent cryptocurrency-related video metadata and comments from YouTube
    using the YouTube Data API, deduplicates entries, logs ingestion events, writes
    results to CSV, and triggers downstream cleaning and storage.

Functions:
    chunk_list(
        lst: List[Any],
        n: int
    ) -> Iterator[List[Any]]
        • Yields successive chunks of size `n` from `lst`.

    append_unique(
        df: pd.DataFrame,
        filepath: str,
        id_field: str,
        source_id: Any,
        job_id: Any
    ) -> None
        • Appends new records to an existing CSV (if present), drops duplicates
          based on `id_field`, logs to database, and writes the updated file.

    search_video_ids(
        query: str,
        max_total: int = 500
    ) -> List[str]
        • Searches YouTube for videos matching `query`, ordered by date,
          and returns up to `max_total` video IDs.

    comments_enabled(
        video_ids: List[str]
    ) -> List[str]
        • Checks which videos among `video_ids` have comments enabled and returns
          the subset with comments.

    fetch_youtube(
        video_ids: List[str],
        source_id: Any,
        job_id: Any
    ) -> None
        • Retrieves metadata and top-level comments for each video ID,
          constructs a DataFrame, JSON‐encodes comments, logs to DB,
          and writes a timestamped CSV.

    main() -> None
        • Archives existing CSVs, initiates a new ingestion job, searches for
          "crypto market analysis" videos, filters to those with comments,
          invokes `fetch_youtube`, and triggers the social data cleaning pipeline.

Usage:
    $ python youTubeScrapper.py

Dependencies:
    • google-api-python-client
    • pandas
    • backend.database.scripts.data_ingestion.log_ingestion_job, social_ingestion
    • data_cleaning_pipeline.run_social_pipeline

Environment:
    • Python 3.8+
    • Set valid YouTube API key in `YOUTUBE_API_KEY`.
    • Creates directories under `data/SOCIAL_MEDIA_DATA/YOUTUBE` and its archive.

Notes:
    - Uses UTC timestamps for filenames and ingestion logs.
    - Deduplication is based on the `platform_id` field.
    - Fetches up to 500 videos and paginates API requests.
"""

import os
import sys
from pathlib import Path
REPO_ROOT = (Path(__file__).resolve().parents[1])
sys.path.append(str(REPO_ROOT))

import time
import logging
import json
import pandas as pd
from datetime import datetime, timedelta, timezone
from googleapiclient.discovery import build
import shutil
from backend.database.scripts.data_ingestion import log_ingestion_job,social_ingestion
from data_cleaning_pipeline import run_social_pipeline


# --- CONFIGURATION ---
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")
yt = build("youtube", "v3", developerKey=YOUTUBE_API_KEY)

BASE_DIR      = os.path.join(os.getcwd(),"data")
NEWS_DATA_DIR = os.path.join(BASE_DIR, "SOCIAL_MEDIA_DATA")
YOUTUBE_DATA  = os.path.join(NEWS_DATA_DIR, "YOUTUBE")
YOUTUBE_DATA_ARCHIEVE  = os.path.join(NEWS_DATA_DIR, "YOUTUBE_ARCHIEVE")
for d in (NEWS_DATA_DIR, YOUTUBE_DATA,YOUTUBE_DATA_ARCHIEVE):
    os.makedirs(d, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s %(levelname)s %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

def chunk_list(lst, n):
    for i in range(0, len(lst), n):
        yield lst[i:i + n]

def append_unique(df, filepath, id_field,source_id, job_id):
    logging.info(f"Appending unique records to {filepath}...")
    try:
        if os.path.exists(filepath):
            old = pd.read_csv(filepath)
            df  = pd.concat([old, df], ignore_index=True) \
                  .drop_duplicates(subset=[id_field])
        social_ingestion(source_id, job_id, df)
        df.to_csv(filepath, index=False)
        logging.info(f"Saved {len(df)} records to {filepath}")
    except Exception as e:
        logging.error(f"Error saving to {filepath}: {e}")

def search_video_ids(query, max_total=500):
    logging.info(f"Searching for up to {max_total} videos matching '{query}'...")
    video_ids = []
    req = yt.search().list(
        part="snippet",
        q=query,
        type="video",
        order="date",
        maxResults=50
    )
    while req and len(video_ids) < max_total:
        res     = req.execute()
        fetched = [item["id"]["videoId"] for item in res.get("items", [])]
        video_ids += fetched
        token = res.get("nextPageToken")
        if not token:
            break
        req = yt.search().list(
            part="snippet",
            q=query,
            type="video",
            order="date",
            maxResults=50,
            pageToken=token
        )
    return video_ids[:max_total]

def comments_enabled(video_ids):
    logging.info(f"Checking comment availability for {len(video_ids)} videos...")
    enabled = []
    for chunk in chunk_list(video_ids, 50):
        stats = yt.videos().list(
            part="statistics",
            id=",".join(chunk)
        ).execute()
        for item in stats.get("items", []):
            vid = item["id"]
            if item["statistics"].get("commentCount", "0") != "0":
                enabled.append(vid)
    return enabled

def fetch_youtube(video_ids,source_id, job_id):
    videos = {}

    for vid in video_ids:
        meta = yt.videos().list(
            part="snippet",
            id=vid
        ).execute().get("items", [])
        if not meta:
            logging.warning(f"No metadata for video {vid}, skipping")
            continue

        snip = meta[0]["snippet"]
        videos[vid] = {
            "platform_id": vid,
            "title":       snip.get("title"),
            "content":     snip.get("description"),
            "posted_at":   snip.get("publishedAt"),
            "author":      snip.get("channelTitle"),
            "url":         f"https://www.youtube.com/watch?v={vid}",
            "comments":    []
        }

        req = yt.commentThreads().list(
            part="snippet",
            videoId=vid,
            maxResults=100
        )
        while req:
            res = req.execute()
            for item in res.get("items", []):
                csnip = item["snippet"]["topLevelComment"]["snippet"]
                videos[vid]["comments"].append({
                    "publishedAt": csnip["publishedAt"],
                    "comment":     csnip["textDisplay"]
                })
            token = res.get("nextPageToken")
            if not token:
                break
            req = yt.commentThreads().list(
                part="snippet",
                videoId=vid,
                maxResults=100,
                pageToken=token
            )

    records = list(videos.values())
    df = pd.DataFrame(records, columns=[
        "platform_id", "title", "content",
        "posted_at", "author", "url", "comments"
    ])
    df["comments"] = df["comments"].apply(json.dumps)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file  = os.path.join(YOUTUBE_DATA, f"youtube_{source_id}_{job_id}_{timestamp}.csv")
    append_unique(df, out_file, "platform_id",source_id, job_id)

def main():
    for fname in os.listdir(YOUTUBE_DATA):
        src_path = os.path.join(YOUTUBE_DATA, fname)
        dest_path= os.path.join(YOUTUBE_DATA_ARCHIEVE, fname)
        shutil.move(src_path, dest_path)
        
    logging.info("=== Starting YouTube data-fetch cycle ===")
    try:
        start = datetime.now(timezone.utc)
        vids    = search_video_ids("crypto market analysis", max_total=500)
        enabled = comments_enabled(vids)
        logging.info(f"{len(enabled)} videos have comments; fetching...")
        source_id, job_id = log_ingestion_job("Youtube", start, status='started')
        fetch_youtube(enabled,source_id, job_id)
        run_social_pipeline(YOUTUBE_DATA,YOUTUBE_DATA_ARCHIEVE)
        logging.info("=== Cycle complete ===")

    except Exception as e:
        logging.error(f"Error in main cycle: {e}")

if __name__ == "__main__":
  
    main()
