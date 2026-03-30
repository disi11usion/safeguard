"""
Filename:    RedditScrapper.py
Author:      Suryansh Singh
Created:     2025-08-06
Description:
    Fetches recent posts and comments from specified cryptocurrency-related Reddit
    subreddits using PRAW, deduplicates by post ID, and writes results to CSV
    while logging ingestion events to the database.

Functions:
    fetch_reddit(
        subreddits: List[str],
        keywords: List[str],
        hours: int = 1,
        time_filter: str = "day",
        post_limit: int = 100
    ) -> List[Dict[str, Any]]
        • Queries each subreddit for posts matching keywords.
        • Filters out stickied posts and posts older than the cutoff.
        • Collects post metadata and all comments.
        • Returns a list of record dicts.

    save_to_csv(
        records: List[Dict[str, Any]],
        source_id: Any,
        job_id: Any
    ) -> None
        • Converts records to a DataFrame, JSON‐encodes comments, logs to DB,
          and writes to a timestamped CSV file under data/SOCIAL_MEDIA_DATA/REDDIT.

    main() -> None
        • Archives existing CSVs.
        • Logs ingestion start.
        • Fetches posts/comments via `fetch_reddit`.
        • If records found, calls `save_to_csv` and triggers downstream cleaning pipeline.
        • Otherwise logs that no new posts were found.

Usage:
    $ python RedditScrapper.py

Dependencies:
    • praw (Python Reddit API Wrapper)
    • pandas
    • requests
    • backend.database.scripts.data_ingestion.log_ingestion_job, social_ingestion
    • data_cleaning_pipeline.run_social_pipeline

Environment:
    • Python 3.8+
    • REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT can be set via env vars.
    • Creates directories under ./data/SOCIAL_MEDIA_DATA/REDDIT and its archive.

Notes:
    - Uses UTC timestamps for cutoff and filenames.
    - Posts and their comments are deduplicated by Reddit post ID.
    - Comments are stored as JSON strings in the CSV.
"""

import sys
from pathlib import Path
REPO_ROOT = (Path(__file__).resolve().parents[1])
sys.path.append(str(REPO_ROOT))

import os
import time
import json
import logging
from datetime import datetime, timedelta, timezone
import shutil
import pandas as pd
from praw import Reddit
from typing import List, Dict, Any
from backend.database.scripts.data_ingestion import log_ingestion_job,social_ingestion
from data_cleaning_pipeline import run_social_pipeline



BASE_DIR = os.path.join(REPO_ROOT,"data")
NEWS_DATA_DIR = os.path.join(BASE_DIR, "SOCIAL_MEDIA_DATA")
REDDIT_DATA = os.path.join(NEWS_DATA_DIR, "REDDIT")
REDDIT_DATA_ARCHIEVE  = os.path.join(NEWS_DATA_DIR, "REDDIT_DATA_ARCHIEVE")
for d in (NEWS_DATA_DIR, REDDIT_DATA,REDDIT_DATA_ARCHIEVE):
    os.makedirs(d, exist_ok=True)

FETCH_HOURS = 1           
POST_LIMIT  = 100         
TIME_FILTER = "day"   
COMMENT_LIMIT_PER_POST=50    

reddit = Reddit(
    client_id=os.getenv("REDDIT_CLIENT_ID"),
    client_secret=os.getenv("REDDIT_CLIENT_SECRET"),
    user_agent=os.getenv("REDDIT_USER_AGENT")
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

def format_comments(comments, limit_per_post: int=COMMENT_LIMIT_PER_POST) -> List[Dict[str, Any]]:
    formatted_comments=[]

    for comment in comments:
        if len(formatted_comments) >= limit_per_post:
            break
        if comment.author is None or comment.body in ['[deleted]','[removed]']:
            continue
        comment_data={
            "comment_author": str(comment.author),
            "comment_body": comment.body,
            "comment_score": comment.score,
            "comment_id": comment.id,
            "comment_created_utc": comment.created_utc,
            "comment_created_time":datetime.fromtimestamp(comment.created_utc, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
            "comment_permalink": f"https://reddit.com{comment.permalink}",
            "reply_count": 0,
            "replies":[]
        }
        # process replies
        if hasattr(comment, 'replies') and comment.replies:
            reply_count = 0
            for reply in comment.replies:
                if reply.author is not None and reply.body not in ['[deleted]','[removed]']:
                    reply_data = {
                        "reply_author": str(reply.author),
                        "reply_body": reply.body,
                        "reply_score": reply.score,
                        "reply_id": reply.id,
                        "reply_created_utc": reply.created_utc
                    }
                    comment_data["replies"].append(reply_data)
                    reply_count += 1
                    if reply_count >= 10:
                        break
            comment_data["reply_count"] = reply_count
        formatted_comments.append(comment_data)
    return formatted_comments



def fetch_reddit(subreddits: List[str], keywords: List[str], hours=FETCH_HOURS,
                 time_filter=TIME_FILTER, post_limit=POST_LIMIT) -> List[Dict[str,Any]]:
    now    = datetime.now(timezone.utc)
    cutoff = now - timedelta(hours=hours)
    posts_by_id = {}

    for sub in subreddits:
        for kw in keywords:
            try:
                logging.info(f"Searching r/{sub} for '{kw}'...")

                for post in reddit.subreddit(sub).search(
                    query=kw,
                    sort="new",
                    time_filter=time_filter,
                    limit=post_limit
                ):
                    if getattr(post, "stickied", False):
                        continue

                    post_dt = datetime.fromtimestamp(post.created_utc, tz=timezone.utc)
                    if post_dt < cutoff:
                        continue

                    pid = post.id
                    if pid not in posts_by_id:
                        logging.info(f"Processing post: {post.title[:50]}...")
                        post.comments.replace_more(limit=0)
                        comments = post.comments.list()
                        formatted_comments = format_comments(comments, COMMENT_LIMIT_PER_POST)

                        record = {
                            "platform_id": pid,
                            "title":       post.title,
                            "content":     post.selftext,
                            "posted_at":   post_dt.strftime("%Y-%m-%d %H:%M:%S"),
                            "posted_at_utc": post.created_utc,
                            "author":      str(post.author) if post.author else "[deleted]",
                            "subreddit": post.subreddit.display_name,
                            "url":         f"https://reddit.com{post.permalink}",
                            "score": post.score,
                            "num_comments": post.num_comments,
                            "comments":    formatted_comments,
                            "comments_count": len(formatted_comments)
                        }
                        posts_by_id[pid] = record


            except Exception as e:
                logging.error(f"PRAW error in r/{sub} for '{kw}': {e}")
                continue

    return list(posts_by_id.values())

def expand_comments_to_row(records: List[Dict[str, Any]]) -> List[Dict[str,Any]]:
    expanded_records = []
    for record in records:
        base_record = {
            "platform_id": record["platform_id"],
            "title": record["title"],
            "content": record["content"],
            "posted_at": record["posted_at"],
            "posted_at_utc": record["posted_at_utc"],
            "author": record["author"],
            "subreddit": record["subreddit"],
            "url": record["url"],
            "score": record["score"],
            "num_comments": record["num_comments"],
            "comments_count": record["comments_count"]
        }
        # if not comments, add the post record without data
        if not record["comments"]:
            expanded_record = base_record.copy()
            expanded_record.update({
                "comment_author": "",
                "comment_body": "",
                "comment_score": "",
                "comment_id": "",
                "comment_created_utc": "",
                "comment_created_time": "",
                "comment_permalink": "",
                "reply_count": 0
            })
            expanded_records.append(expanded_record)
        else:
            for comment in record["comments"]:
                expanded_record = base_record.copy()
                expanded_record.update({
                    "comment_author": comment.get("comment_author", ""),
                    "comment_body": comment.get("comment_body", ""),
                    "comment_score": comment.get("comment_score", ""),
                    "comment_id": comment.get("comment_id", ""),
                    "comment_created_utc": comment.get("comment_created_utc", ""),
                    "comment_created_time": comment.get("comment_created_time", ""),
                    "comment_permalink": comment.get("comment_permalink",""),
                    "reply_count": comment.get("reply_count",0)
                })
                expanded_records.append(expanded_record)
    return expanded_records


def save_to_csv(records: List[Dict[str, Any]],source_id: Any, job_id: Any) -> None:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filepath= os.path.join(REDDIT_DATA, f"reddit_{source_id}_{job_id}_{timestamp}.csv")
    expanded_records = expand_comments_to_row(records)
    df = pd.DataFrame(expanded_records)
    social_ingestion(source_id, job_id, df)
    df.to_csv(filepath, index=False)
    logging.info(f"Wrote {len(df)} records ({len(records)} posts (with comments) to {filepath}")
    posts_with_comments = len([r for r in records if r["comments_count"]>0])
    total_comments = sum([r["comments_count"] for r in records])
    logging.info(f"Statistics: {len(records)} total posts, {posts_with_comments} posts with comments, {total_comments} total comments")

def main():
    
    start = datetime.now(timezone.utc)

    for fname in os.listdir(REDDIT_DATA):
        src_path = os.path.join(REDDIT_DATA, fname)
        dest_path= os.path.join(REDDIT_DATA_ARCHIEVE, fname)
        shutil.move(src_path, dest_path)
        
    logging.info("=== Fetching Reddit posts/comments ===")
    source_id, job_id = log_ingestion_job("Reddit", start, status='started')
    records = fetch_reddit(
        subreddits=[
            "CryptoCurrency", "bitcoin", "ethereum", "CryptoMarkets",
            "CryptoCurrencyTrading", "BitcoinMarkets",
            "solana", "CryptoMoonShots", "CryptoTechnology",
            "Stock", "Gold", "Forex", "ETH", "BTC"
        ],
        keywords=[
            "Bitcoin", "Ethereum", "Solana", "crypto market",
            "crypto", "BTC", "ETH", "SOL", "Market", "Trading",
            "Investment", "Price", "Forex", "Gold","AAPL", "stock",
            "2z","A","XRP","USDC"
        ],
        hours=FETCH_HOURS,
        time_filter=TIME_FILTER,
        post_limit=POST_LIMIT
    )
    
    if records:
        save_to_csv(records,source_id, job_id)
        run_social_pipeline(REDDIT_DATA,REDDIT_DATA_ARCHIEVE)
    else:
        logging.info(f"No posts found in the last {FETCH_HOURS} hours.")
        

if __name__ == "__main__":

    main()
