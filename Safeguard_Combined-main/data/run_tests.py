import json
import os
import io
import csv
import types
import pandas as pd
import pytest
from datetime import datetime, timedelta, timezone

############################
# Shared lightweight stubs #
############################

class DummyResp:
    def __init__(self, json_data=None, text="", status=200):
        self._json = json_data or {}
        self.text = text
        self.status_code = status
    def json(self):
        return self._json
    def raise_for_status(self):
        if not (200 <= self.status_code < 300):
            class E(Exception):
                response = types.SimpleNamespace(status_code=self.status_code)
            raise E()

########################
# Fixtures / utilities #
########################

@pytest.fixture(autouse=True)
def no_env_keys(monkeypatch):
    # Ensure API keys/env don’t leak into tests
    for k in [
        "NEWSDATA_API_KEY", "NEWSAPI_API_KEY", "MEDIASTACK_API_KEY",
        "REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USER_AGENT",
        "YOUTUBE_API_KEY"
    ]:
        monkeypatch.delenv(k, raising=False)

@pytest.fixture
def tmp_news_dirs(tmp_path, monkeypatch):
    import sys, types

    base = tmp_path / "data"
    news = base / "NEWS_DATA"
    for d in ["IN_PROGRESS", "PROCESSED", "ARCHIEVE", "NEWS_EXTRACTED", "NEWS_EXTRACTED_ARCHIEVE", "LOGS"]:
        (news / d).mkdir(parents=True, exist_ok=True)

    # --- Stub backend + data_request BEFORE importing news_extractor ---
    pkg_backend = types.ModuleType("backend")
    pkg_db = types.ModuleType("backend.database")
    pkg_scripts = types.ModuleType("backend.database.scripts")

    def fake_get_crypto_data(exchange_name="binance"):
        # minimal, fast, deterministic
        return {"data": [
            {"symbol": "BTCUSDT", "name": "Bitcoin", "crypto_id": 1},
            {"symbol": "ETHUSDT", "name": "Ethereum", "crypto_id": 2},
        ]}
    mod_data_request = types.ModuleType("backend.database.scripts.data_request")
    mod_data_request.get_crypto_data = fake_get_crypto_data

    # Also provide a tiny data_ingestion module so imports work
    mod_data_ingestion = types.ModuleType("backend.database.scripts.data_ingestion")
    mod_data_ingestion.news_ingestion = lambda *a, **k: None
    mod_data_ingestion.log_ingestion_job = lambda *a, **k: (1, 2)

    sys.modules["backend"] = pkg_backend
    sys.modules["backend.database"] = pkg_db
    sys.modules["backend.database.scripts"] = pkg_scripts
    sys.modules["backend.database.scripts.data_request"] = mod_data_request
    sys.modules["backend.database.scripts.data_ingestion"] = mod_data_ingestion

    # --- Import AFTER stubbing so module init is safe ---
    import news_ingestion as ni
    import news_extractor as ne

    # Point both modules to tmp dirs
    for mod in (ni, ne):
        monkeypatch.setattr(mod, "BASE_DIR", str(base))
        monkeypatch.setattr(mod, "NEWS_DATA_DIR", str(news))
        monkeypatch.setattr(mod, "IN_PROGRESS_DIR", str(news / "IN_PROGRESS"))
        monkeypatch.setattr(mod, "PROCESSED_DIR", str(news / "PROCESSED"))
        monkeypatch.setattr(mod, "ARCHIEVE_DIR", str(news / "ARCHIEVE"))
        monkeypatch.setattr(mod, "EXTRACTED_NEWS_DIR", str(news / "NEWS_EXTRACTED"))
        monkeypatch.setattr(mod, "EXTRACTED_NEWS_DIR_ARCHIEVE", str(news / "NEWS_EXTRACTED_ARCHIEVE"))
        monkeypatch.setattr(mod, "LOGS_DIR", str(news / "LOGS"))
    monkeypatch.setattr(ni, "SEEN_FILE", str(news / "seen_urls.txt"))

    return types.SimpleNamespace(base=base, news=news)


@pytest.fixture
def tmp_social_dirs(tmp_path, monkeypatch):
    import sys, types as _types

    base = tmp_path / "data"
    soc = base / "SOCIAL_MEDIA_DATA"
    (soc / "REDDIT").mkdir(parents=True, exist_ok=True)
    (soc / "REDDIT_DATA_ARCHIEVE").mkdir(parents=True, exist_ok=True)

    # --- Stub backend.* BEFORE importing RedditScrapper ---
    pkg_backend = _types.ModuleType("backend")
    pkg_db = _types.ModuleType("backend.database")
    pkg_scripts = _types.ModuleType("backend.database.scripts")

    mod_data_ingestion = _types.ModuleType("backend.database.scripts.data_ingestion")
    # minimal shims used by RedditScrapper
    mod_data_ingestion.log_ingestion_job = lambda *a, **k: (1, 2)
    mod_data_ingestion.social_ingestion = lambda *a, **k: None

    sys.modules.setdefault("backend", pkg_backend)
    sys.modules.setdefault("backend.database", pkg_db)
    sys.modules.setdefault("backend.database.scripts", pkg_scripts)
    sys.modules["backend.database.scripts.data_ingestion"] = mod_data_ingestion

    # data_cleaning_pipeline is imported; stub it too
    mod_clean = _types.ModuleType("data_cleaning_pipeline")
    mod_clean.run_social_pipeline = lambda *a, **k: None
    mod_clean.run_news_pipeline = lambda *a, **k: None
    sys.modules.setdefault("data_cleaning_pipeline", mod_clean)

    # --- Env so PRAW doesn’t explode at import ---
    monkeypatch.setenv("REDDIT_CLIENT_ID", "test")
    monkeypatch.setenv("REDDIT_CLIENT_SECRET", "test")
    monkeypatch.setenv("REDDIT_USER_AGENT", "pytest")

    # --- Safe to import now ---
    import RedditScrapper as rs

    # Point module at temp directories
    monkeypatch.setattr(rs, "BASE_DIR", str(base))
    monkeypatch.setattr(rs, "NEWS_DATA_DIR", str(soc))
    monkeypatch.setattr(rs, "REDDIT_DATA", str(soc / "REDDIT"))
    monkeypatch.setattr(rs, "REDDIT_DATA_ARCHIEVE", str(soc / "REDDIT_DATA_ARCHIEVE"))

    return _types.SimpleNamespace(base=base, social=soc)

###########################
# news_ingestion.py tests #
###########################

def test_flatten_item_basic():
    print("\n[TEST] flatten_item: flattens nested dicts/lists into a single-row friendly mapping.")
    import news_ingestion as ni
    item = {"a": 1, "b": {"x": 2}, "c": [3, 4], "d": "z"}
    got = ni.flatten_item(item)
    assert got == {"a": 1, "b_x": 2, "c": "3, 4", "d": "z"}

def test_seen_file_load_update(tmp_news_dirs):
    print("\n[TEST] seen_urls: persists and reloads the set of already-seen URLs.")
    import news_ingestion as ni
    assert ni.load_seen() == set()
    ni.update_seen(["http://a", "http://b"])
    assert ni.load_seen() == {"http://a", "http://b"}

def test_save_csv_filters_seen_and_writes(tmp_news_dirs, monkeypatch):
    print("\n[TEST] save_csv: filters out previously-seen URLs and writes only new items to PROCESSED.")
    import news_ingestion as ni

    # pre-mark one URL as seen
    ni.update_seen(["http://already.seen"])

    # fake items incl seen + new
    items = [
        {"title": "t1", "url": "http://already.seen", "publishedAt": "2025-08-10"},
        {"title": "t2", "url": "http://new.one", "publishedAt": "2025-08-10"},
    ]

    # stub logger to silence
    monkeypatch.setattr(ni, "logger", types.SimpleNamespace(info=lambda *a, **k: None, error=lambda *a, **k: None))

    ni.save_csv(items, source="newsapi", source_id=123, job_id=456)

    # Verify file in PROCESSED with only 1 row
    processed = os.listdir(ni.PROCESSED_DIR)
    assert len(processed) == 1 and processed[0].startswith("newsapi_123_456_")
    import polars as pl
    df = pl.read_csv(os.path.join(ni.PROCESSED_DIR, processed[0]))
    assert df.shape[0] == 1
    assert set(ni.load_seen()) >= {"http://already.seen", "http://new.one"}

def test_fetchers_handle_errors(tmp_news_dirs, monkeypatch, caplog):
    print("\n[TEST] fetchers: when upstream services fail, return [] and log errors.")
    import news_ingestion as ni

    # Mock requests.get to raise / return non-200; feedparser error
    def bad_get(*a, **k):  # always error for first two, 200 empty for others
        raise Exception("boom")
    monkeypatch.setattr(ni, "requests", types.SimpleNamespace(get=bad_get))

    def bad_parse(*a, **k):
        raise Exception("rss boom")
    monkeypatch.setattr(ni, "feedparser", types.SimpleNamespace(parse=bad_parse))

    caplog.clear()
    with caplog.at_level("ERROR"):
        assert ni.fetch_from_newsdata() == []
        assert ni.fetch_from_newsapi() == []
        assert ni.fetch_from_mediastack() == []
        assert ni.fetch_from_rss("http://rss") == []
    assert any("error" in m.lower() for m in caplog.text.splitlines())

###########################
# news_extractor.py tests #
###########################

def test_process_file_happy_path(tmp_news_dirs, monkeypatch):
    print("\n[TEST] process_file: extracts article text, tags coins, writes _with_news, calls DB ingestion.")
    import news_extractor as ne

    # Patch heavy deps and DB hooks
    monkeypatch.setattr(ne, "fetch_html", lambda url: "<html><body>Bitcoin rises again</body></html>")
    monkeypatch.setattr(ne, "extract_best", lambda html, url: "Bitcoin rises again by 5%")
    # Provide crypto mapping
    monkeypatch.setattr(ne, "COINS", ["BTC", "ETH"])
    monkeypatch.setattr(ne, "COIN_NAMES", ["Bitcoin", "Ethereum"])
    monkeypatch.setattr(ne, "ticker_to_id", {"BTC": 1, "ETH": 2})
    calls = {"ingested": []}
    def fake_news_ingestion(a, b, df):
        calls["ingested"].append((a, b, len(df)))
    monkeypatch.setattr(ne, "news_ingestion", fake_news_ingestion)

    # Make a PROCESSED CSV as input (source "newsapi" so renaming logic triggers)
    in_path = os.path.join(ne.PROCESSED_DIR, "newsapi_10_20_2025081101.csv")
    with open(in_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["title", "url", "publishedAt"])
        w.writeheader()
        w.writerow({"title": "Breaking BTC", "url": "http://x", "publishedAt": "2025-08-11"})
        w.writerow({"title": "ETH calm", "url": "http://y", "publishedAt": "2025-08-11"})

    ne.process_file(in_path, "10", "20")

    out_path = in_path.replace(".csv", ne.OUTPUT_SUFFIX)
    df = pd.read_csv(out_path)
    assert list(df.columns) == ["title", "url", "publishedAt", "news", "coins", "crypto_id"]
    assert "BTC" in df["coins"].iloc[0]
    assert calls["ingested"] == [("10", "20", 2)]

def test_webscrape_news_moves_and_runs_pipeline(tmp_news_dirs, monkeypatch):
    print("\n[TEST] webscrape_news: moves incoming files, archives stale, runs downstream pipeline once.")
    import news_extractor as ne

    # Create two processed files: one plain, one _with_news
    p1 = os.path.join(ne.PROCESSED_DIR, "newsapi_1_1_2025081101.csv")
    with open(p1, "w", encoding="utf-8") as f: f.write("title,url,publishedAt\nA,http://a,2025-08-11\n")
    p2 = os.path.join(ne.PROCESSED_DIR, "newsapi_1_1_2025081101_with_news.csv")
    with open(p2, "w", encoding="utf-8") as f: f.write("title,url,publishedAt,news,coins,crypto_id\nA,http://a,2025-08-11,txt,,\n")

    # Avoid real processing; just no-op process_file and run_news_pipeline
    monkeypatch.setattr(ne, "process_file", lambda *a, **k: None)
    moved = {"ran": 0}
    monkeypatch.setattr(ne, "run_news_pipeline", lambda *a, **k: moved.__setitem__("ran", moved["ran"]+1))

    # Pre-seed EXTRACTED_NEWS_DIR with stale file to test archiving
    stale = os.path.join(ne.EXTRACTED_NEWS_DIR, "old.csv")
    with open(stale, "w"): pass

    ne.webscrape_news()
    contents = os.listdir(ne.EXTRACTED_NEWS_DIR)
    assert "old.csv" not in contents
    assert any(name.endswith("_with_news.csv") for name in contents)
    assert moved["ran"] == 1

################################
# RedditScrapper.py tests      #
################################

def test_fetch_reddit_filters_and_dedup(tmp_social_dirs, monkeypatch):
    print("\n[TEST] Reddit fetch: skip stickied & old posts; deduplicate by post ID; include fresh ones with comments.")
    import RedditScrapper as rs
    now = datetime.now(timezone.utc)

    class Comment:
        def __init__(self, body): self.body = body
    class CommentsList:
        def replace_more(self, limit=0): pass
        def list(self): return [Comment("c1"), Comment("c2")]
    class Post:
        def __init__(self, id, title, selftext, created_utc, stickied=False, url="http://u", sub="cryptocurrency"):
            self.id = id; self.title = title; self.selftext = selftext
            self.created_utc = created_utc; self.stickied = stickied
            self.url = url
            self.subreddit = types.SimpleNamespace(display_name=sub)
            self.comments = CommentsList()
    class Subreddit:
        def search(self, query, sort="new", time_filter="day", limit=100):
            # Return: stickied (skip), old (skip), fresh A, duplicate id (dedup)
            return [
                Post("s1", "stickied", "", now.timestamp(), stickied=True),
                Post("old1", "old", "", (now - timedelta(hours=5)).timestamp()),
                Post("a1", "BTC pumps", "body", now.timestamp(), url="http://a"),
                Post("a1", "dup same id", "dup", now.timestamp(), url="http://b"),
            ]
    class DummyReddit:
        def subreddit(self, name): return Subreddit()
    monkeypatch.setattr(rs, "reddit", DummyReddit())

    recs = rs.fetch_reddit(["CryptoCurrency"], ["BTC"], hours=1)
    assert len(recs) == 1
    assert recs[0]["platform_id"] == "a1"
    assert len(recs[0]["comments"]) == 2

def test_save_to_csv_writes_and_logs(tmp_social_dirs, monkeypatch):
    print("\n[TEST] Reddit save_to_csv: writes timestamped CSV and calls social_ingestion with row count.")
    import RedditScrapper as rs
    out_calls = []
    monkeypatch.setattr(rs, "social_ingestion", lambda sid, jid, df: out_calls.append(("ingest", len(df))))
    ts_id = 99
    rs.save_to_csv([{"platform_id":"id1","title":"t","content":"c","posted_at":"2025-08-11",
                     "author":"r/cc","url":"http://u","comments":[]}], source_id=ts_id, job_id=1)
    files = os.listdir(rs.REDDIT_DATA)
    assert any(f.startswith(f"reddit_{ts_id}_1_") and f.endswith(".csv") for f in files)
    assert out_calls == [("ingest", 1)]

def main():
    """
    Run this test module directly with Python, using pytest under the hood.
    Disables third-party plugin autoload to avoid unrelated plugin crashes.
    """
    os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")
    return pytest.main([__file__, "-q", "-s"])

if __name__ == "__main__":
    raise SystemExit(main())
