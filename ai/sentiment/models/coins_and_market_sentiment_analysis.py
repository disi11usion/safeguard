import os
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[1]))

import pandas as pd
import re
from transformers import pipeline
import traceback

 
from backend.database.scripts.data_ingestion import insert_finbert_coin_sentiment, insert_market_level_sentiment
from backend.database.scripts.data_request import (
    get_clean_news,
    get_clean_social,
    get_reference_cryptos
)
 
def main():
    # ===============================
    # 🔹 Load reference and data
    # ===============================
    #ref = pd.read_csv("reference_cryptocurrencies.csv")
    #news = pd.read_csv("cryptopanic_news.csv")
    #social = pd.read_csv("clean_social.csv")
 
    # ===============================
    # 🔹 Load reference and data
    # ===============================
    print("Starting coin and market sentiment script")

    print("Loading news, social, and reference data...")
    news = get_clean_news()
    social = get_clean_social()
    ref = get_reference_cryptos()
    print("Data loading complete")

    print(f"🔹 News rows: {len(news) if news is not None else 0}")
    print(f"🔹 Social rows: {len(social) if social is not None else 0}")
    print(f"🔹 Reference cryptos: {len(ref) if ref is not None else 0}")

    print(ref.dtypes)
    print(ref.head())
    
    # ——— Handle “no data” cases ———
    if news is None:
        print("get_clean_news() returned None; substituting empty DataFrame")
        news = pd.DataFrame(columns=["title", "news_content"])
    if social is None:
        print("get_clean_social() returned None; substituting empty DataFrame")
        social = pd.DataFrame(columns=["title", "content"])
    if ref is None:
        print("get_reference_cryptos() returned None; substituting empty DataFrame")
        # make sure it has the columns you use later:
        ref = pd.DataFrame(columns=["crypto_id", "name", "symbol_binance"])
 
    # normalize text
    for col in ["title", "news_content"]:
        if col in news.columns:
            news[col] = news[col].fillna("").str.lower()
    for col in ["title", "content"]:
        if col in social.columns:
            social[col] = social[col].fillna("").str.lower()
 
    # unify column names
    if "news_content" in news.columns:
        news = news.rename(columns={"news_content": "content"})
    if "posted_at" in social.columns:
        social = social.rename(columns={"posted_at": "published_at"})
 
    # combine datasets
    all_data = pd.concat([
        news[["title", "content"]],
        social[["title", "content"]]
    ], ignore_index=True)
 
    # ===============================
    # 🔹 Initialize FinBERT with GPU if available
    # ===============================
    # device = 0 if torch.cuda.is_available() else -1
    # finbert = pipeline("sentiment-analysis", model="ProsusAI/finbert", device=device)
 
    # if device == 0:
    #     print("Using GPU (CUDA)")
    # else:
    #     print("Using CPU")
 
 
    # ===============================
    # 🔹 Initialize FinBERT (forced CPU for testing)
    # ===============================
    device = -1  # Force CPU even if GPU is available
    try:
        finbert = pipeline("sentiment-analysis", model="ProsusAI/finbert", device=-1)
        print("FinBERT pipeline initialized using CPU")
    except Exception as e:
        print(f"Error initializing FinBERT: {e}")
        sys.exit(1)
    
 
    def finbert_sentiment(text):
        """Classify text using FinBERT. Return (-1.0, 0.0, 1.0) for negative, neutral, positive."""
        if not text or not isinstance(text, str) or text.strip() == "":
            return 0.0, "neutral"
        try:
            result = finbert(text[:512])[0]  # truncate long text
            label = result['label'].lower()
            if label == "positive":
                return 1.0, "positive"
            elif label == "negative":
                return -1.0, "negative"
            else:
                return 0.0, "neutral"
        except Exception as e:
            print("FinBERT error:", e)
            return 0.0, "neutral"
 
    # ===============================
    # 🔹 Relevance checker
    # ===============================
    def is_relevant(row, name, symbol):
        name_pattern = r"\b" + re.escape(name.lower()) + r"\b"
        sym_pattern = r"\b" + re.escape(symbol.lower()) + r"\b"
        return bool(
            re.search(name_pattern, row["title"]) or
            re.search(sym_pattern, row["title"]) or
            re.search(name_pattern, row["content"]) or
            re.search(sym_pattern, row["content"])
        )
 
    # ===============================
    # 🔹 Process each crypto
    # ===============================
    output_rows = []
 
    for _, coin in ref.iterrows():
        crypto_id = coin["crypto_id"]
        name = str(coin["name"]).lower().strip()
        symbol = str(coin["symbol_binance"]).lower().strip()
 
        relevant_rows = all_data[all_data.apply(lambda r: is_relevant(r, name, symbol), axis=1)]
 
        if relevant_rows.empty:
            output_rows.append({
                "crypto_id": crypto_id,
                "symbol": coin["symbol_binance"],
                "sentiment_score": 0.0,
                "sentiment_label": "neutral"
            })
            continue
 
        scores = []
        for _, row in relevant_rows.iterrows():
            score_title, _ = finbert_sentiment(row["title"])
            score_content, _ = finbert_sentiment(row["content"])
            combined_score = 0.6 * score_title + 0.4 * score_content
            scores.append(combined_score)
 
        avg_score = sum(scores) / len(scores) if scores else 0.0
 
        if avg_score > 0.1:
            label = "positive"
        elif avg_score < -0.1:
            label = "negative"
        else:
            label = "neutral"
 
        output_rows.append({
            "crypto_id": crypto_id,
            "symbol": coin["symbol_binance"],
            "sentiment_score": round(avg_score, 4),
            "sentiment_label": label
        })
 
    # ===============================
    # 🔹 Save output
    # ===============================
    out_df = pd.DataFrame(output_rows)
 
    # Optional: still write to CSV for backup/debugging
    #out_df.to_csv("crypto_sentiment_scores_finbert.csv", index=False)
    #print("CSV backup saved: crypto_sentiment_scores_finbert.csv")
 
    # Ingest to DB
 
    # — your existing code up to preparing out_df —
    try:
        result = insert_finbert_coin_sentiment(out_df)
        print(result["message"])
    except Exception as e:
        print(f"Error inserting coin-level sentiment: {e}")
        raise
 
    # Compute overall market sentiment
    market_score = out_df["sentiment_score"].mean() if not out_df.empty else 0.0
    if market_score > 0.1:
        market_label = "positive"
    elif market_score < -0.1:
        market_label = "negative"
    else:
        market_label = "neutral"
 
    market_df = pd.DataFrame([{
        "sentiment_score": round(market_score, 4),
        "sentiment_label": market_label
    }])
    try:
        market_result = insert_market_level_sentiment(market_df)
        print(market_result["message"])
    except Exception as e:
        print(f"Error inserting market-level sentiment: {e}")
        raise
 
 

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(" Uncaught error in sentiment script:", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        sys.stdout.flush()
        sys.exit(2)
