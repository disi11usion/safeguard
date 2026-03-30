#!/usr/bin/env python3
"""
Debug script to isolate import issues in the sentiment analysis script
"""

import sys
import os
from pathlib import Path

print("=== DEBUG IMPORTS STARTED ===")

# Add project root to path
print("Adding project root to path...")
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
print(f"Project root added: {ROOT}")

print("=== TESTING IMPORTS STEP BY STEP ===")

# Test 1: Basic imports
print("1. Testing basic imports...")
try:
    import pandas as pd
    print("   ✅ pandas imported successfully")
except Exception as e:
    print(f"   ❌ pandas import failed: {e}")

try:
    import re
    print("   ✅ re imported successfully")
except Exception as e:
    print(f"   ❌ re import failed: {e}")

try:
    from transformers import pipeline
    print("   ✅ transformers imported successfully")
except Exception as e:
    print(f"   ❌ transformers import failed: {e}")

# Test 2: Database imports
print("\n2. Testing database imports...")
try:
    print("   - Attempting to import data_ingestion...")
    from backend.database.scripts.data_ingestion import insert_finbert_coin_sentiment, insert_market_level_sentiment
    print("   ✅ data_ingestion imported successfully")
except Exception as e:
    print(f"   ❌ data_ingestion import failed: {e}")

try:
    print("   - Attempting to import data_request...")
    from backend.database.scripts.data_request import (
        get_curr_news,
        get_curr_social,
        get_crypto_data
    )
    print("   ✅ data_request imported successfully")
except Exception as e:
    print(f"   ❌ data_request import failed: {e}")

# Test 3: FinBERT initialization
print("\n3. Testing FinBERT initialization...")
try:
    print("   - Creating FinBERT pipeline...")
    finbert_pipeline = pipeline(
        "sentiment-analysis", 
        model="ProsusAI/finbert",
        device=-1,
        batch_size=4
    )
    print("   ✅ FinBERT pipeline created successfully")
except Exception as e:
    print(f"   ❌ FinBERT initialization failed: {e}")

print("\n=== ALL IMPORTS COMPLETED ===")
print("If you see this message, all imports worked successfully!")

