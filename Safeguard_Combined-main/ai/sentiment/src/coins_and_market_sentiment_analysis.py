"""
Cryptocurrency Sentiment Analysis Module

This module performs sentiment analysis on cryptocurrency-related news and social media content
using the FinBERT model. It processes data from news articles and social posts to generate sentiment scores for individual cryptocurrencies and 
overall market sentiment.

"""

import os
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[3]))

import pandas as pd
import re
from transformers import pipeline
import traceback
from functools import lru_cache
import time

# Import database functions for data retrieval and storage
from backend.database.scripts.data_ingestion import insert_finbert_coin_sentiment, insert_market_level_sentiment
from backend.database.scripts.data_request import (
    get_curr_news,
    get_curr_social,
    get_crypto_data
)
# Global variable to cache the FinBERT pipeline for performance optimization
_finbert_pipeline = None

def get_finbert_pipeline():
    # Get or create FinBERT pipeline with caching for performance.
    global _finbert_pipeline
    
    if _finbert_pipeline is None:
        try:
            _finbert_pipeline = pipeline(
                "sentiment-analysis", 
                model="ProsusAI/finbert",  # Financial domain-specific BERT model
                device=-1,  # Force CPU usage for compatibility
                batch_size=4  # Optimized batch size for CPU processing
            )
            print("FinBERT pipeline initialized using CPU with batch processing")
        except Exception as e:
            print(f"Error initializing FinBERT: {e}")
            sys.exit(1)
    
    return _finbert_pipeline

@lru_cache(maxsize=500)
def cached_sentiment_analysis(text):
    # Cached sentiment analysis to avoid re-processing identical texts.
    if not text or not isinstance(text, str) or text.strip() == "":
        return 0.0
    
    try:
        pipeline = get_finbert_pipeline()
        # Truncate text to avoid tokenization issues with long texts
        truncated_text = text[:500].strip() if len(text) > 500 else text
        result = pipeline(truncated_text)[0]
        label = result['label'].lower()
        confidence = result['score']

        # Convert FinBERT labels to numerical scores
        if label == "positive":
            return confidence
        elif label == "negative":
            return -confidence
        else:
            return 0.0
    except Exception as e:
        print(f"FinBERT error for text '{text[:50]}...': {e}")
        return 0.0

def batch_sentiment_analysis(texts, batch_size=4):
    # Process multiple texts in batches for better performance.
    if not texts:
        return []
    
    pipeline = get_finbert_pipeline()
    results = []
    
    def truncate_text(text, max_length=500):
        # Truncate text to a reasonable length for FinBERT.
        if not text or not isinstance(text, str):
            return ""
        # Truncate to max_length characters to avoid tokenization issues
        return text[:max_length].strip()
    
    # Process texts in batches for optimal performance
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        try:
            # Truncate each text in the batch
            truncated_batch = [truncate_text(text) for text in batch]
            batch_results = pipeline(truncated_batch)
            
            # Convert FinBERT results to numerical scores
            for result in batch_results:
                label = result['label'].lower()
                confidence = result['score']
                
                if label == "positive":
                    score = confidence
                elif label == "negative":
                    score = -confidence
                else:
                    score = 0.0
                
                results.append(score)
        except Exception as e:
            print(f"Batch processing error: {e}")
            # Fallback to individual processing if batch processing fails
            for text in batch:
                results.append(cached_sentiment_analysis(text))
    
    return results
 
def main():
    print("=== MAIN FUNCTION STARTED ===")
    # ===============================
    # Load reference and data from database
    # ===============================
    print("Starting coin and market sentiment script")
    print("=== FETCHING NEWS DATA ===")
    # Retrieve current news data from the database
    raw_news = get_curr_news(last_day=True)
    news = None
    if raw_news["success"] and isinstance(raw_news.get("message"), list):
        news = pd.DataFrame(raw_news["message"], columns=[
            "title", "news_content", "published_at", "url", "crypto_id", 
            "name", "symbol_binance", "symbol_coingecko"
        ])
    print("=== NEWS DATA PROCESSED ===")

    print("=== FETCHING SOCIAL DATA ===")
    # Retrieve current social media data from the database
    raw_social = get_curr_social(last_day=True)
    social = None
    if raw_social["success"] and isinstance(raw_social.get("message"), list):
        social = pd.DataFrame(raw_social["message"], columns=[
            "title", "content", "posted_at", "author", "url", "comments"
        ])
    print("=== SOCIAL DATA PROCESSED ===")

    print("=== FETCHING CRYPTO REFERENCE DATA ===")
    # Retrieve cryptocurrency metadata from the database
    raw_ref = get_crypto_data()
    ref = None
    if raw_ref["success"] and isinstance(raw_ref.get("data"), list):
        ref = pd.DataFrame(raw_ref["data"], columns=["name", "symbol_binance", "rank", "crypto_id"])
    
    print("=== CRYPTO REFERENCE DATA PROCESSED ===")

    print("Data loading complete")

    # Print data statistics for monitoring
    print(f"News rows: {len(news) if news is not None else 0}")
    print(f"Social rows: {len(social) if social is not None else 0}")
    print(f"Reference cryptos: {len(ref) if ref is not None else 0}")

    
    # Create empty DataFrames if data retrieval fails to prevent errors
    if news is None:
        print("get_clean_news() returned None; substituting empty DataFrame")
        news = pd.DataFrame(columns=["title", "news_content"])
    if social is None:
        print("get_clean_social() returned None; substituting empty DataFrame")
        social = pd.DataFrame(columns=["title", "content", "comments"])
    if ref is None:
        print("get_reference_cryptos() returned None; substituting empty DataFrame")
        # make sure it has the columns you use later:
        ref = pd.DataFrame(columns=["crypto_id", "name", "symbol_binance"])
 
    # Normalize text data for consistent processing
    for col in ["title", "news_content"]:
        if col in news.columns:
            news[col] = news[col].fillna("").str.lower()
    for col in ["title", "content", "comments"]:
        if col in social.columns:
            social[col] = social[col].fillna("").str.lower()
 
    # Unify column names for consistent processing
    if "news_content" in news.columns:
        news = news.rename(columns={"news_content": "content"})
 
    # Combine news and social datasets for unified processing
    all_data = pd.concat([
        news[["title", "content"]],
        social[["title", "content", "comments"]]
    ], ignore_index=True)
 
    # ===============================
    # Initialize FinBERT (optimized for CPU)
    # ===============================
    # Initialize the pipeline early to avoid delays during processing
    print("Initializing FinBERT pipeline...")
    get_finbert_pipeline()
    print("FinBERT pipeline ready")
    
    def finbert_sentiment(text):
        # Optimized text classification using FinBERT with chunking and caching.
        if not text or not isinstance(text, str) or text.strip() == "":
            return 0.0
        
        try:
            # Use smaller chunk size for better performance and avoid tokenization issues
            max_chunk_size = 200  # Further reduced to ensure we stay well under token limits
            chunks = [text[i:i + max_chunk_size] for i in range(0, len(text), max_chunk_size)]
            
            if len(chunks) == 1:
                # Single chunk, use cached analysis for efficiency
                return cached_sentiment_analysis(chunks[0])
            else:
                # Multiple chunks, use batch processing for efficiency
                scores = batch_sentiment_analysis(chunks)
                return sum(scores) / len(scores) if scores else 0.0
                
        except Exception as e:
            print(f"FinBERT error: {e}")
            return 0.0
 
    # ===============================
    # Relevance checker
    # ===============================
    def is_relevant(row, name, symbol):
        name_pattern = r"\b" + re.escape(name.lower()) + r"\b"
        sym_pattern = r"\b" + re.escape(symbol.lower()) + r"\b"

        def safe_str(val):
            # Safely convert value to string for regex matching.
            return str(val).lower() if isinstance(val, str) else ""

        # Check all text fields for cryptocurrency mentions
        return bool(
            re.search(name_pattern, safe_str(row.get("title", ""))) or
            re.search(sym_pattern, safe_str(row.get("title", ""))) or
            re.search(name_pattern, safe_str(row.get("content", ""))) or
            re.search(sym_pattern, safe_str(row.get("content", ""))) or
            re.search(name_pattern, safe_str(row.get("comments", ""))) or
            re.search(sym_pattern, safe_str(row.get("comments", "")))
        )

 
    # ===============================
    # Process each crypto (optimized with batch processing)
    # ===============================
    output_rows = []
    ref = ref.head(10)
    # Pre-process all relevant texts for batch processing
    all_texts_to_process = []
    crypto_text_mapping = []
    
    # Iterate through each cryptocurrency in the reference data
    for _, coin in ref.iterrows():
        crypto_id = coin["crypto_id"]
        name = str(coin["name"]).lower().strip()
        symbol = str(coin["symbol_binance"]).lower().strip()

        # Find all data rows relevant to this cryptocurrency
        relevant_rows = all_data[all_data.apply(lambda r: is_relevant(r, name, symbol), axis=1)]
 
        # If no relevant data found, add neutral sentiment for this crypto
        if relevant_rows.empty:
            output_rows.append({
                "crypto_id": crypto_id,
                "symbol": coin["symbol_binance"],
                "sentiment_score": 0.0,
                "sentiment_label": "neutral"
            })
            continue
        
        # Collect all texts for this crypto for batch processing
        for _, row in relevant_rows.iterrows():
            # Combine title, content, and comments for comprehensive sentiment analysis
            title = str(row.get("title", ""))
            content = str(row.get("content", ""))
            comments = str(row.get("comments", ""))
            
            # Combine all text fields, filtering out empty strings
            text_parts = [part for part in [title, content, comments] if part.strip()]
            data = ' '.join(text_parts)
            
            all_texts_to_process.append(data)
            crypto_text_mapping.append((crypto_id, coin["symbol_binance"]))
    
    # Batch process all collected texts for maximum efficiency
    print(f"Processing {len(all_texts_to_process)} texts in batches...")
    all_scores = batch_sentiment_analysis(all_texts_to_process)
    
    # Group sentiment scores by cryptocurrency
    crypto_scores = {}
    score_index = 0
    
    for crypto_id, symbol in crypto_text_mapping:
        if crypto_id not in crypto_scores:
            crypto_scores[crypto_id] = {"scores": [], "symbol": symbol}
        crypto_scores[crypto_id]["scores"].append(all_scores[score_index])
        score_index += 1
    
    # Calculate average sentiment scores and create output records
    for crypto_id, data in crypto_scores.items():
        scores = data["scores"]
        avg_score = sum(scores) / len(scores) if scores else 0.0
 
        # Determine sentiment label based on score thresholds
        if avg_score > 0.1:
            label = "positive"
        elif avg_score < -0.1:
            label = "negative"
        else:
            label = "neutral"
 
        output_rows.append({
            "crypto_id": crypto_id,
            "symbol": data["symbol"],
            "sentiment_score": round(avg_score, 4),
            "sentiment_label": label
        })
 
    # ===============================
    # Save output to database
    # ===============================
    out_df = pd.DataFrame(output_rows)
 
 
    # Ingest coin-level sentiment data to database
    if out_df.empty:
        print("No FinBERT coin-level sentiment data to insert")
    else:
        try:
            result = insert_finbert_coin_sentiment(out_df)
            if result and isinstance(result, dict) and "message" in result:
                print(result["message"])
            else:
                print("insert_finbert_coin_sentiment returned None or unexpected format.")
        except Exception as e:
            print(f"Error inserting coin-level sentiment: {e}")
            raise
 
    # Compute overall market sentiment from individual crypto sentiments
    market_score = out_df["sentiment_score"].mean() if not out_df.empty else 0.0
    if market_score > 0.1:
        market_label = "positive"
    elif market_score < -0.1:
        market_label = "negative"
    else:
        market_label = "neutral"
 
    # Create market-level sentiment record
    market_df = pd.DataFrame([{
        "sentiment_score": round(market_score, 4),
        "sentiment_label": market_label
    }])
    
    # Store market-level sentiment in database
    try:
        market_result = insert_market_level_sentiment(market_df)
        print(market_result["message"])
    except Exception as e:
        print(f"Error inserting market-level sentiment: {e}")
        raise
 

# Main execution block with comprehensive error handling
if __name__ == "__main__":
    try:
        print("=== SCRIPT EXECUTION STARTED ===")
        main()
        print("=== SCRIPT COMPLETED SUCCESSFULLY ===")
    except Exception as e:
        print(" Uncaught error in sentiment script:", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        sys.stdout.flush()
        sys.exit(2)