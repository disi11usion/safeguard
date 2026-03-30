import sys
from pathlib import Path
import os
import pandas as pd
import numpy as np
import re
import emoji
import html
import json
import shutil
from collections import defaultdict
from bs4 import BeautifulSoup
import contractions
from datetime import datetime
import uuid

# Adjust path for imports to ensure backend modules can be accessed
if '__file__' in globals():
    sys.path.append(str(Path(__file__).resolve().parents[1]))
else:
    sys.path.append(str(Path.cwd().resolve().parents[1]))

# Import database interaction modules
from backend.database.scripts.data_request import get_raw_news, get_raw_social
from backend.database.scripts.data_ingestion import clean_news_ingestion, clean_social_ingestion

# ========== Text Cleaning Helpers ==========

# Sanitize text by replacing common Unicode characters with their ASCII equivalents
def sanitize_text(text):
    if not isinstance(text, str):
        text = str(text)
    text = html.unescape(text)
    return text.replace("’", "'").replace("‘", "'") \
               .replace("“", '"').replace("”", '"') \
               .replace("–", "-").replace("—", "-") \
               .replace("•", "").replace("·", "") \
               .replace("→", "").replace("…", "...")

# === NEWS CLEANING FUNCTIONS ===

# Remove emojis and emoticons from news title and content columns
def emojis_emoticons_cleaning_news(df):
    emoticon_pattern = re.compile(r"""(?:[<>]?[:;=8][\-o\*\']?[\)\]\(\[dDpP/\:\}\{@\|\\])""", re.VERBOSE)
    for col in ['title', 'news']:
        df[col] = df[col].map(lambda x: emoticon_pattern.sub('', emoji.replace_emoji(str(x), '')))
    return df

# Expand contractions in news title and content columns
def contractions_adjusment_news(df):
    for col in ['title', 'news']:
        df[col] = df[col].map(contractions.fix)
    return df

# Normalize whitespace in news title and content columns
def white_space_removal_news(df):
    for col in ['title', 'news']:
        df[col] = df[col].map(lambda x: re.sub(r'\s+', ' ', str(x).strip().strip('"')))
    return df

# Remove URLs from news title and content columns
def url_news_removal(df):
    pattern = re.compile(r'(https?://\S+|www\.\S+|\bhtt\S+|\bhttp\S+)')
    for col in ['title', 'news']:
        df[col] = df[col].astype(str).apply(lambda t: pattern.sub(' ', t))
    return df

# Remove HTML tags from news title and content columns
def html_tag_news_removal(df):
    for col in ['title', 'news']:
        df[col] = df[col].map(lambda t: BeautifulSoup(html.unescape(str(t)), "html.parser").get_text(" "))
    return df

# Apply final text sanitization to news data
def final_news_formatting(df):
    for col in ['title', 'news']:
        df[col] = df[col].map(sanitize_text)
    return df

# Apply complete cleaning pipeline to news data
def news_data_cleaning(df):
    df = emojis_emoticons_cleaning_news(df)
    df = contractions_adjusment_news(df)
    df = white_space_removal_news(df)
    df = url_news_removal(df)
    df = html_tag_news_removal(df)
    df = final_news_formatting(df)
    return df

# === SOCIAL CLEANING FUNCTIONS ===

# Remove emojis and emoticons from social media data columns
def emojis_emoticons_cleaning_social(df):
    emoticon_pattern = re.compile(r"""(?:[<>]?[:;=8][\-o\*\']?[\)\]\(\[dDpP/\:\}\{@\|\\])""", re.VERBOSE)
    for col in ['title', 'author', 'content', 'comments']:
        if col in df.columns:
            df[col] = df[col].map(lambda x: emoticon_pattern.sub('', emoji.replace_emoji(str(x), '')))
    return df

# Expand contractions in social media data columns
def contractions_adjustment_social(df):
    for col in ['title', 'author', 'content', 'comments']:
        if col in df.columns:
            df[col] = df[col].map(contractions.fix)
    return df

# Normalize whitespace in social media data columns
def white_space_removal_social(df):
    for col in ['title', 'author', 'content', 'comments']:
        if col in df.columns:
            df[col] = df[col].map(lambda x: re.sub(r'\s+', ' ', str(x).strip().strip('"')))
    return df

# Basic text sanitization: remove newlines and strip whitespace
def sanitize_text_1(text):
    return text.replace('\n', ' ').strip()

# Comprehensive text sanitization including Unicode decoding and emoji removal
def full_sanitize(text):
    try:
        text = text.encode('utf-8').decode('unicode_escape')  # Decode \uXXXX
        text = text.encode('latin1').decode('utf-8')          # Fix mojibake
    except Exception:
        pass
    text = emoji.replace_emoji(text, '')                      # Remove emojis
    text = sanitize_text(text)
    text = sanitize_text_1(text)
    return text

# Clean the comments column which contains JSON data with nested comment objects    
def clean_comments_column(df):
    # Safely load JSON data, return empty list if parsing fails
    def safe_json_load(x):
        try:
            return json.loads(x) if isinstance(x, str) else []
        except Exception:
            return []
    
    # Clean individual comments within the comment list
    def clean_comments(comment_list):
        cleaned = [{'comment': full_sanitize(str(c.get('comment', '')))} for c in comment_list]
        return json.dumps(cleaned, ensure_ascii=False)

    df['comments'] = df['comments'].apply(safe_json_load).apply(clean_comments)
    return df

# Remove URLs from social media data columns
def url_removal_social(df):
    pattern = re.compile(r'(https?://\S+|www\.\S+|\bhtt\S+|\bhttp\S+)')
    for col in ['title', 'author', 'content', 'comments']:
        df[col] = df[col].map(lambda t: pattern.sub(' ', str(t)))
    return df

# Remove HTML tags from social media data columns
def html_tag_removal_social(df):
    for col in ['title', 'author', 'content', 'comments']:
        df[col] = df[col].map(lambda t: BeautifulSoup(html.unescape(str(t)), "html.parser").get_text(" "))
    return df

# Apply final text sanitization to social media data
def final_formatting_social(df):
    for col in ['title', 'author', 'content', 'comments']:
        df[col] = df[col].map(sanitize_text)
    return df

# Apply complete cleaning pipeline to social media data
def social_data_cleaning(df):
    df = emojis_emoticons_cleaning_social(df)
    df = contractions_adjustment_social(df)
    df = white_space_removal_social(df)
    df = clean_comments_column(df)
    df = url_removal_social(df)
    df = html_tag_removal_social(df)
    df = final_formatting_social(df)
    return df

# ========== FILE EXECUTION ==========

# Extract source, source_id, and job_id from filename format: source_sourceid_jobid.csv
def extract_metadata_from_filename(filename: str):
    parts = Path(filename).stem.split('_')
    if len(parts) < 3:
        raise ValueError(f"Invalid filename format: {filename}")
    return parts[0], int(parts[1]), uuid.UUID(parts[2])

# Execute the complete news data cleaning and ingestion pipeline
def run_news_pipeline(source_folder, archive_folder):
    files = list(Path(source_folder).glob("*.csv"))
    for file in files:
        source, source_id, job_id = extract_metadata_from_filename(file.name)
        df_raw = get_raw_news(str(job_id), source_id)
        if df_raw is None or df_raw.empty:
            print(f"No data fetched for {file.name}")
            continue
        df_raw.rename(columns={'content': 'news', 'published_at': 'publishedat'}, inplace=True)
        df = news_data_cleaning(df_raw)
        # Keep rows where title is not empty (regardless of news content)
        # Remove rows where title is empty (even if news has content)
        df = df[df['title'].str.strip() != '']
        df['publishedat'] = pd.to_datetime(df['publishedat'], errors='coerce', utc=True)
        df['publishedat'] = df['publishedat'].fillna(pd.Timestamp("1970-01-01T00:00:00Z"))
        df['published_at'] = df['publishedat'].dt.strftime('%Y-%m-%dT%H:%M:%SZ')
        df = df[['title', 'news', 'published_at', 'url', 'news_id','coins','crypto_ids']]
        clean_news_ingestion(source_id, job_id, df)
        shutil.move(str(file), str(Path(archive_folder) / file.name))
        print(f"News Ingested & Archived: {file.name}")

# Execute the complete social media data cleaning and ingestion pipeline
def run_social_pipeline(source_folder, archive_folder):
    files = list(Path(source_folder).glob("*.csv"))
    for file in files:
        source, source_id, job_id = extract_metadata_from_filename(file.name)
        df_raw = get_raw_social(str(job_id), source_id)
        if df_raw is None or df_raw.empty:
            print(f"No social data for {file.name}")
            continue
        df = social_data_cleaning(df_raw)
        df = df[df['title'].str.strip() != '']  # Remove rows with empty titles
        # Remove rows where all text columns are empty or contain only 'nan'
        df = df[~df[['title', 'author', 'content', 'comments']].apply(
            lambda row: all(str(x).strip().lower() in ('', 'nan') for x in row), axis=1)]
        clean_social_ingestion(source_id, job_id, df)
        shutil.move(str(file), str(Path(archive_folder) / file.name))
        print(f"Social Ingested & Archived: {file.name}")
