"""
Minimal smoke test: verifies _upsert_price_snapshot and _read_l3_snapshot
use get_cursor (pool) and never call psycopg2.connect directly.

Run from the backend/ directory:
    python test_l3_pool.py
"""
import asyncio
import json
import sys
import types
from contextlib import contextmanager
from unittest.mock import MagicMock, patch

# ── Stub out heavy imports that need env/network before importing main ──────

# Fake psycopg2
fake_psycopg2 = types.ModuleType("psycopg2")
fake_psycopg2.connect = MagicMock(side_effect=AssertionError("psycopg2.connect was called — pool not used!"))
fake_psycopg2.extras = types.ModuleType("psycopg2.extras")
fake_psycopg2.extras.RealDictCursor = object
sys.modules["psycopg2"] = fake_psycopg2
sys.modules["psycopg2.extras"] = fake_psycopg2.extras

# Stub all other imports that require env/network
for mod in [
    "dotenv", "application.helper.logging", "database.db_pool",
    "application.clients.polygon_client", "application.clients.twelvedata_client",
    "application.clients.correlation", "application.clients.chatgpt_client",
    "application.clients.chat_logic", "application.clients.deepseek_client",
    "application.clients.whale_tracking", "application.clients.news_sentiment",
    "application.clients.social_sentiment", "application.clients.reddit",
    "application.clients.government_client", "database.scripts.data_request",
    "database.scripts.influencer_commission", "database.scripts.user_auth",
    "application.services.market_shake", "application.cache.price_cache",
    "application.cache.price_queue", "presentation", "presentation.routes",
    "database.scripts",
]:
    sys.modules[mod] = types.ModuleType(mod)

# Provide the symbols main.py needs from these stubs
sys.modules["dotenv"].load_dotenv = lambda **kw: None
sys.modules["application.helper.logging"].setup_logging = lambda: MagicMock()
sys.modules["application.helper.logging"].log_request = lambda *a, **kw: None
sys.modules["application.helper.logging"].log_response = lambda *a, **kw: None
sys.modules["application.helper.logging"].log_error = lambda *a, **kw: None

fake_price_cache = MagicMock()
sys.modules["application.cache.price_cache"].price_cache = fake_price_cache
sys.modules["application.cache.price_cache"].PriceEntry = object
sys.modules["application.cache.price_queue"].PriceRefreshQueue = MagicMock(
    return_value=MagicMock(start=MagicMock(), stop=MagicMock(), enqueue=MagicMock())
)

for attr in ["PolygonClient", "TwelveDataClient", "CorrelationAnalyzer",
             "ChatGPTClient", "ChatGPTRequest", "ChatMessagesRequest",
             "DeepSeekClient", "BlockCypherClient", "NewsSentimentClient",
             "SocialSentimentClient", "RedditAPIClient"]:
    mod_name = next(k for k in sys.modules if attr.lower().replace("client","").replace("request","") in k.lower() or "chat" in k.lower())
    setattr(sys.modules[mod_name], attr, MagicMock(return_value=MagicMock()))

sys.modules["application.clients.social_sentiment"]._score_text = MagicMock()
sys.modules["application.clients.government_client"].get_government_client = MagicMock()
sys.modules["application.services.market_shake"].MarketShakeService = MagicMock(return_value=MagicMock())
sys.modules["database.db_pool"].init_pool = MagicMock()
sys.modules["database.db_pool"].get_conn = MagicMock()
sys.modules["database.db_pool"].release_conn = MagicMock()
sys.modules["presentation.routes"] = types.ModuleType("presentation.routes")
sys.modules["presentation"].routes = sys.modules["presentation.routes"]

# ── Now import the two functions under test ─────────────────────────────────

# We import them directly after patching, avoiding the FastAPI app startup
import importlib, os
os.environ.setdefault("DATABASE_URL", "postgresql://fake/db")
os.environ.setdefault("TWELVE_DATA_API_KEY", "fake")
os.environ.setdefault("POLYGON_API_KEY", "fake")


def get_target_functions():
    """Extract _upsert_price_snapshot and _read_l3_snapshot via source exec."""
    import ast, textwrap

    src_path = os.path.join(os.path.dirname(__file__), "application", "main.py")
    with open(src_path) as f:
        src = f.read()

    # Pull just the two functions we care about
    tree = ast.parse(src)
    func_names = {"_upsert_price_snapshot", "_read_l3_snapshot"}
    funcs_src = []
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in func_names:
            funcs_src.append(ast.get_source_segment(src, node))

    return "\n\n".join(funcs_src)


# ── Tests ───────────────────────────────────────────────────────────────────

def test_upsert_uses_pool_not_raw_connect():
    get_cursor_calls = []

    @contextmanager
    def fake_get_cursor(cursor_factory=None):
        cur = MagicMock()
        get_cursor_calls.append(True)
        yield cur

    ns = {
        "get_cursor": fake_get_cursor,
        "get_conn": MagicMock(),
        "release_conn": MagicMock(),
        "json": json,
        "logger": MagicMock(),
        "DATABASE_URL": "postgresql://fake/db",
        "asyncio": asyncio,
        "Any": __import__("typing").Any,
        "Optional": __import__("typing").Optional,
    }
    # psycopg2.connect is already patched to raise — if it gets called the test blows up
    exec(compile(get_target_functions(), "<main>", "exec"), ns)

    ns["_upsert_price_snapshot"]("market_list:crypto", "crypto", {"data": 1})

    assert get_cursor_calls, "get_cursor was never called — pool not used"
    assert not fake_psycopg2.connect.called, "psycopg2.connect was called unexpectedly"
    print("✅ _upsert_price_snapshot: uses pool (get_cursor), not psycopg2.connect")


def test_read_l3_uses_pool_not_raw_connect():
    get_cursor_calls = []

    @contextmanager
    def fake_get_cursor(cursor_factory=None):
        cur = MagicMock()
        cur.fetchone.return_value = ({"price": 100}, "2024-01-01")
        get_cursor_calls.append(True)
        yield cur

    ns = {
        "get_cursor": fake_get_cursor,
        "get_conn": MagicMock(),
        "release_conn": MagicMock(),
        "json": json,
        "logger": MagicMock(),
        "DATABASE_URL": "postgresql://fake/db",
        "asyncio": asyncio,
        "Any": __import__("typing").Any,
        "Optional": __import__("typing").Optional,
    }
    exec(compile(get_target_functions(), "<main>", "exec"), ns)

    result = asyncio.run(ns["_read_l3_snapshot"]("market_list:crypto"))

    assert get_cursor_calls, "get_cursor was never called — pool not used"
    assert result is not None, "Expected a row back from the mock cursor"
    assert not fake_psycopg2.connect.called, "psycopg2.connect was called unexpectedly"
    print("✅ _read_l3_snapshot: uses pool (get_cursor), not psycopg2.connect")


if __name__ == "__main__":
    print("\nRunning L3 cache pool tests...\n")
    try:
        test_upsert_uses_pool_not_raw_connect()
        test_read_l3_uses_pool_not_raw_connect()
        print("\n✅ All tests passed — L3 helpers use the pool correctly.\n")
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}\n")
        sys.exit(1)
