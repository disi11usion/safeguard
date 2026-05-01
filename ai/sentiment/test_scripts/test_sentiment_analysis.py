"""
Test Suite for: sentiment/src/coins_and_market_sentiment_analysis.py

Self-contained and robust:
- Loads the MUT (module under test) by file path and registers it under
  'sentiment.src.coins_and_market_sentiment_analysis' so patch targets work
  even if 'sentiment' isn't an installed package.
- Stubs backend DB modules and transformers.pipeline at import time.
- Resets caches/globals between tests.
"""

import sys
import types
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
import importlib
import importlib.util

# ----------------------------
# Paths
# ----------------------------
THIS_FILE = Path(__file__).resolve()
PROJECT_ROOT = THIS_FILE.parents[1]
SENTIMENT_DIR = PROJECT_ROOT / "src"
MUT_PATH = SENTIMENT_DIR / "coins_and_market_sentiment_analysis.py"

if not MUT_PATH.exists():
    raise FileNotFoundError(f"Could not find MUT at {MUT_PATH}")

# Ensures project root is importable for any relative imports the MUT might do
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# ----------------------------
# Helpers to ensure fake modules and packages
# ----------------------------
def _ensure_fake_module(qualname: str) -> types.ModuleType:
    # Ensures a dotted module path exists in sys.modules and return the leaf module.
    parts = qualname.split(".")
    path = []
    parent = None
    for p in parts:
        path.append(p)
        mod_name = ".".join(path)
        if mod_name not in sys.modules:
            mod = types.ModuleType(mod_name)
            # mark packages with a path attribute
            mod.__path__ = []  # type: ignore
            sys.modules[mod_name] = mod
            if parent is not None:
                setattr(parent, p, mod)
        parent = sys.modules[mod_name]
    return sys.modules[qualname]

def _ensure_package(qualname: str) -> types.ModuleType:
    mod = _ensure_fake_module(qualname)
    if not hasattr(mod, "__path__"):
        mod.__path__ = []  # type: ignore
    return mod

# ----------------------------
# Creates fake deps so import of MUT never explodes
# ----------------------------
# backend... stubs
_ingestion_mod = _ensure_fake_module("backend.database.scripts.data_ingestion")
_request_mod   = _ensure_fake_module("backend.database.scripts.data_request")

def _stub(*args, **kwargs):
    raise RuntimeError("Stub called unexpectedly. Tests should patch this.")

setattr(_ingestion_mod, "insert_finbert_coin_sentiment", _stub)
setattr(_ingestion_mod, "insert_market_level_sentiment", _stub)
setattr(_request_mod, "get_curr_news", _stub)
setattr(_request_mod, "get_curr_social", _stub)
setattr(_request_mod, "get_crypto_data", _stub)

# transformers.pipeline stub
_transformers_mod = _ensure_fake_module("transformers")
def _pipeline_stub(*args, **kwargs):
    return lambda texts: (
        [{"label": "neutral", "score": 0.5}] * len(texts)
        if isinstance(texts, list)
        else [{"label": "neutral", "score": 0.5}]
    )
setattr(_transformers_mod, "pipeline", _pipeline_stub)

# ----------------------------
# Loads MUT by file path and register under package name
# ----------------------------
_ensure_package("sentiment")
_ensure_package("sentiment.src")

MUT_FQNAME = "sentiment.src.coins_and_market_sentiment_analysis"
spec = importlib.util.spec_from_file_location(MUT_FQNAME, MUT_PATH)
if spec is None or spec.loader is None:
    raise ImportError(f"Could not create spec for {MUT_FQNAME} at {MUT_PATH}")

MUT = importlib.util.module_from_spec(spec)
sys.modules[MUT_FQNAME] = MUT  # register before exec
spec.loader.exec_module(MUT)   # type: ignore

# Import symbols the tests will use directly
get_finbert_pipeline = MUT.get_finbert_pipeline
cached_sentiment_analysis = MUT.cached_sentiment_analysis
batch_sentiment_analysis = MUT.batch_sentiment_analysis
main = MUT.main


class TestSentimentAnalysis(unittest.TestCase):
    # Test cases for the sentiment analysis module.

    def setUp(self):
        # Reset global pipeline and LRU cache before each test
        try:
            setattr(MUT, "_finbert_pipeline", None)
        except Exception:
            pass
        try:
            cached_sentiment_analysis.cache_clear()
        except Exception:
            pass

        # Builds 50-item news dataset, alternating Bitcoin/Ethereum so relevance works
        news_items = []
        for i in range(50):
            if i % 2 == 0:
                name = "Bitcoin"
                sym  = "BTC"
            else:
                name = "Ethereum"
                sym  = "ETH"
            news_items.append({
                "title": f"{name} update #{i}",
                "news_content": f"{name} ({sym}) continues to see movement in the market. Sample {i}.",
                "published_at": "2024-01-01T10:00:00Z",
                "url": f"https://example.com/{name.lower()}-{i}",
                "crypto_id": 1 if name == "Bitcoin" else 2,
                "name": name,
                "symbol_binance": sym,
                "symbol_coingecko": name.lower(),
            })
        self.sample_news_data = {"success": True, "message": news_items}

        # Builds 50-item social dataset, alternating Bitcoin/Ethereum
        social_items = []
        for i in range(50):
            if i % 2 == 0:
                name = "Bitcoin"
                sym  = "BTC"
            else:
                name = "Ethereum"
                sym  = "ETH"
            social_items.append({
                "title": f"{name} buzz #{i}",
                "content": f"{name} {sym} sentiment chatter post {i} 🚀",
                "posted_at": "2024-01-01T12:00:00Z",
                "author": f"user_{i}",
                "url": f"https://social.example.com/{name.lower()}/{i}",
                "comments": f"Comment thread about {name} {sym} #{i}",
            })
        self.sample_social_data = {"success": True, "message": social_items}

        # Keeps two reference cryptos; your code takes head(10) anyway
        self.sample_crypto_data = {
            "success": True,
            "data": [
                {"name": "Bitcoin",  "symbol_binance": "BTC", "rank": 1, "crypto_id": 1},
                {"name": "Ethereum", "symbol_binance": "ETH", "rank": 2, "crypto_id": 2},
            ],
        }

    # get_finbert_pipeline
    @patch("sentiment.src.coins_and_market_sentiment_analysis.pipeline")
    def test_get_finbert_pipeline_initialization(self, mock_pipeline):
        # FinBERT pipeline is initialized with the expected arguments.
        mock_pipeline_instance = Mock()
        mock_pipeline.return_value = mock_pipeline_instance

        result = get_finbert_pipeline()

        mock_pipeline.assert_called_with(
            "sentiment-analysis",
            model="ProsusAI/finbert",
            device=-1,
            batch_size=4,
        )
        self.assertIs(result, mock_pipeline_instance)

    # cached_sentiment_analysis
    @patch("sentiment.src.coins_and_market_sentiment_analysis.get_finbert_pipeline")
    def test_cached_sentiment_analysis_positive(self, mock_get_pipeline):
        # Returns a callable that handles single string or list
        def fake_pipe(x):
            if isinstance(x, list):
                return [{"label": "positive", "score": 0.85} for _ in x]
            return [{"label": "positive", "score": 0.85}]
        mock_get_pipeline.return_value = fake_pipe

        result = cached_sentiment_analysis("Bitcoin is performing well")
        self.assertEqual(result, 0.85)

    @patch("sentiment.src.coins_and_market_sentiment_analysis.get_finbert_pipeline")
    def test_cached_sentiment_analysis_negative(self, mock_get_pipeline):
        def fake_pipe(x):
            if isinstance(x, list):
                return [{"label": "negative", "score": 0.75} for _ in x]
            return [{"label": "negative", "score": 0.75}]
        mock_get_pipeline.return_value = fake_pipe

        result = cached_sentiment_analysis("Bitcoin is crashing")
        self.assertEqual(result, -0.75)

    def test_cached_sentiment_analysis_empty_text(self):
        self.assertEqual(cached_sentiment_analysis(""), 0.0)
        self.assertEqual(cached_sentiment_analysis(None), 0.0)

    # batch_sentiment_analysis
    @patch("sentiment.src.coins_and_market_sentiment_analysis.get_finbert_pipeline")
    def test_batch_sentiment_analysis(self, mock_get_pipeline):
        # Exact 1:1 outputs for 3 inputs
        def fake_pipe(x):
            return [
                {"label": "positive", "score": 0.8},
                {"label": "negative", "score": 0.7},
                {"label": "neutral",  "score": 0.6},
            ]
        mock_get_pipeline.return_value = fake_pipe

        texts = ["Positive text", "Negative text", "Neutral text"]
        results = batch_sentiment_analysis(texts)

        self.assertEqual(len(results), 3)
        self.assertGreater(results[0], 0)
        self.assertLess(results[1], 0)
        self.assertEqual(results[2], 0.0)

    def test_batch_sentiment_analysis_empty_list(self):
        self.assertEqual(batch_sentiment_analysis([]), [])

    # main() integration flow
    @patch("sentiment.src.coins_and_market_sentiment_analysis.get_curr_news")
    @patch("sentiment.src.coins_and_market_sentiment_analysis.get_curr_social")
    @patch("sentiment.src.coins_and_market_sentiment_analysis.get_crypto_data")
    @patch("sentiment.src.coins_and_market_sentiment_analysis.insert_finbert_coin_sentiment")
    @patch("sentiment.src.coins_and_market_sentiment_analysis.insert_market_level_sentiment")
    @patch("sentiment.src.coins_and_market_sentiment_analysis.get_finbert_pipeline")
    def test_main_function_success(
        self,
        mock_get_pipeline,
        mock_insert_market,
        mock_insert_coin,
        mock_get_crypto,
        mock_get_social,
        mock_get_news,
    ):
        mock_get_news.return_value = self.sample_news_data
        mock_get_social.return_value = self.sample_social_data
        mock_get_crypto.return_value = self.sample_crypto_data

        # Returns one result per input text to avoid IndexError
        def fake_pipe(texts):
            if isinstance(texts, list):
                return [{"label": "positive", "score": 0.8} for _ in texts]
            return [{"label": "positive", "score": 0.8}]
        mock_get_pipeline.return_value = fake_pipe

        mock_insert_coin.return_value = {"message": "Coin sentiment inserted successfully"}
        mock_insert_market.return_value = {"message": "Market sentiment inserted successfully"}

        try:
            main()
        except Exception as e:
            self.fail(f"main() raised an unexpected exception: {e}")

        self.assertTrue(mock_insert_coin.called)
        self.assertTrue(mock_insert_market.called)

    @patch("sentiment.src.coins_and_market_sentiment_analysis.get_curr_news")
    @patch("sentiment.src.coins_and_market_sentiment_analysis.get_curr_social")
    @patch("sentiment.src.coins_and_market_sentiment_analysis.get_crypto_data")
    @patch("sentiment.src.coins_and_market_sentiment_analysis.insert_finbert_coin_sentiment")
    @patch("sentiment.src.coins_and_market_sentiment_analysis.insert_market_level_sentiment")
    @patch("sentiment.src.coins_and_market_sentiment_analysis.get_finbert_pipeline")
    def test_main_function_with_empty_data(
        self,
        mock_get_pipeline,
        mock_insert_market,
        mock_insert_coin,
        mock_get_crypto,
        mock_get_social,
        mock_get_news,
    ):
        mock_get_news.return_value = {"success": True, "message": []}
        mock_get_social.return_value = {"success": True, "message": []}
        mock_get_crypto.return_value = {"success": True, "data": []}

        
        def fake_pipe(texts):
            if isinstance(texts, list):
                return [{"label": "neutral", "score": 0.5} for _ in texts]
            return [{"label": "neutral", "score": 0.5}]
        mock_get_pipeline.return_value = fake_pipe

        mock_insert_coin.return_value = {"message": "No rows to insert"}
        mock_insert_market.return_value = {"message": "Market sentiment inserted successfully"}

        try:
            main()
        except Exception as e:
            self.fail(f"main() raised with empty data: {e}")


class TestDataProcessing(unittest.TestCase):
    # Tests for data-related logic.

    def test_dataframe_creation_from_news(self):
        import pandas as pd
        sample_news = {
            "success": True,
            "message": [
                {
                    "title": "Bitcoin news",
                    "news_content": "Bitcoin is doing well",
                    "published_at": "2024-01-01T10:00:00Z",
                    "url": "https://example.com",
                    "crypto_id": 1,
                    "name": "Bitcoin",
                    "symbol_binance": "BTC",
                    "symbol_coingecko": "bitcoin",
                }
            ],
        }

        if sample_news["success"] and isinstance(sample_news.get("message"), list):
            df = pd.DataFrame(
                sample_news["message"],
                columns=[
                    "title",
                    "news_content",
                    "published_at",
                    "url",
                    "crypto_id",
                    "name",
                    "symbol_binance",
                    "symbol_coingecko",
                ],
            )
        self.assertEqual(len(df), 1)
        self.assertEqual(df.iloc[0]["title"], "Bitcoin news")

    def test_text_normalization(self):
        import pandas as pd
        text = "Bitcoin IS GREAT"
        self.assertEqual(text.lower(), "bitcoin is great")

        s = pd.Series(["Bitcoin", None, "Ethereum"])
        normalized = s.fillna("").str.lower()
        self.assertEqual(normalized.tolist(), ["bitcoin", "", "ethereum"])

    def test_sentiment_label_assignment(self):
        def label_for(score: float) -> str:
            if score > 0.1:
                return "positive"
            elif score < -0.1:
                return "negative"
            return "neutral"

        self.assertEqual(label_for(0.15), "positive")
        self.assertEqual(label_for(-0.15), "negative")
        self.assertEqual(label_for(0.0), "neutral")



def run_tests():
    print("=" * 60)
    print("RUNNING SENTIMENT ANALYSIS TESTS")
    print("=" * 60)

    suite = unittest.TestSuite()
    suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(TestSentimentAnalysis))
    suite.addTests(unittest.defaultTestLoader.loadTestsFromTestCase(TestDataProcessing))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    print("\n" + "=" * 60)
    print("TEST SUMMARY")
    print("=" * 60)
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")

    if result.failures:
        print("\nFAILURES:")
        for test, tb in result.failures:
            print(f"- {test}:\n{tb}")

    if result.errors:
        print("\nERRORS:")
        for test, tb in result.errors:
            print(f"- {test}:\n{tb}")

    return result.wasSuccessful()


if __name__ == "__main__":
    ok = run_tests()
    sys.exit(0 if ok else 1)
