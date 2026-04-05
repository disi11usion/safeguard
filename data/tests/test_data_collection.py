"""
test_data_collection.py
Data Collection 模块全链路自动化测试
覆盖: T1(新闻覆盖) T2(领域过滤) T3(fallback) T4(subreddit列表)

运行: python data/tests/test_data_collection.py
"""

import sys
import os
import re
from pathlib import Path

# ── 路径设置 ─────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
BACKEND_DIR = PROJECT_ROOT / "backend"

passed = 0
failed = 0
skipped = 0


def check(name, condition, detail=""):
    global passed, failed
    if condition:
        print(f"  [PASS] {name}")
        passed += 1
    else:
        print(f"  [FAIL] {name} -- {detail}")
        failed += 1


def read_file(path):
    with open(path, encoding='utf-8') as f:
        return f.read()


# ── T4: Subreddit 列表完整性 ──────────────────────────────
print("\n=== T4: Subreddit 列表 (data/reddit_ingest.py) ===")
reddit_src = read_file(DATA_DIR / "reddit_ingest.py")

# 提取 SUBREDDITS 默认字符串(第二个参数 of os.getenv)
match = re.search(r'REDDIT_SUBREDDITS"\s*,\s*((?:[^)]|\n)*?)\)\.split', reddit_src, re.DOTALL)
if not match:
    print("  [FAIL] 无法解析 SUBREDDITS 定义")
    failed += 1
else:
    # 清理注释和字符串拼接
    raw = match.group(1)
    # 去掉注释
    raw = re.sub(r'#.*', '', raw)
    # 提取所有字符串字面量并拼接
    parts = re.findall(r'"([^"]*)"', raw)
    combined = "".join(parts)
    subreddits = [s.strip() for s in combined.split(",") if s.strip()]

    check("列表非空", len(subreddits) > 0, f"长度: {len(subreddits)}")

    # 检查无拼接错误
    bad_names = [s for s in subreddits if s in ("BTCXRP", "HBARZEC", "PEPENEAR", "STRKS", "HBARMICRO")]
    check("无拼接错误 (BTCXRP/HBARZEC/PEPENEAR)", len(bad_names) == 0, f"发现错误名: {bad_names}")

    # 检查关键 ticker 独立
    check("BTC 独立存在", "BTC" in subreddits)
    check("XRP 独立存在", "XRP" in subreddits)
    check("PEPE 独立存在", "PEPE" in subreddits)
    check("NEAR 独立存在", "NEAR" in subreddits)
    check("STRK 独立存在", "STRK" in subreddits)

    # 检查非 crypto subreddit
    for sub in ["stocks", "wallstreetbets", "Forex", "Gold", "FuturesTrading", "ForexTrading", "commodities"]:
        check(f"包含 {sub}", sub in subreddits)


# ── T1c: Ticker 识别列表 ──────────────────────────────────
print("\n=== T1c: Ticker 识别 (data/news_extractor.py) ===")
extractor_src = read_file(DATA_DIR / "news_extractor.py")

check("存在 _EXTRA_TICKERS 字典", "_EXTRA_TICKERS" in extractor_src)

# 检查股票 ticker
for stock in ["AAPL", "GOOGL", "MSFT", "TSLA", "NVDA", "META"]:
    check(f"包含股票 {stock}", f'"{stock}"' in extractor_src)

# 检查外汇
for fx in ["EUR", "GBP", "JPY", "AUD"]:
    check(f"包含外汇 {fx}", f'"{fx}"' in extractor_src)

# 检查商品
for com in ["GOLD", "XAU", "SILVER", "OIL", "COPPER"]:
    check(f"包含商品 {com}", f'"{com}"' in extractor_src)

# 检查去重逻辑存在
check("包含去重逻辑 (if _ticker not in seen)",
      "if _ticker not in seen" in extractor_src)


# ── T1a: 新闻 API 查询词扩展 ──────────────────────────────
print("\n=== T1a: 新闻 API 查询词 (data/news_ingestion.py) ===")
news_src = read_file(DATA_DIR / "news_ingestion.py")

check("NewsData 包含 stocks 关键词",
      "crypto OR stocks OR forex OR gold OR futures" in news_src)
check("NewsData 包含 category=business",
      '"category": "business"' in news_src)
check("NewsAPI 包含 stock market 关键词",
      "cryptocurrency OR stock market OR forex OR gold price OR futures" in news_src)
check("GNews 包含多领域关键词",
      "'finance stock forex gold crypto'" in news_src)
check("Mediastack 包含逗号分隔关键词",
      '"keywords": "crypto,stocks,forex,gold,futures"' in news_src)


# ── T1b: RSS 源覆盖 ──────────────────────────────────────
print("\n=== T1b: RSS 源 (data/news_ingestion.py) ===")
for name, url_fragment in [
    ("marketwatch", "dowjones.io"),
    ("investing_rss", "investing.com"),
    ("forexlive", "forexlive.com"),
    ("kitco", "kitco.com"),
]:
    check(f"RSS 源 {name} 已配置", f'"{name}"' in news_src)
    check(f"RSS 源 {name} URL 正确", url_fragment in news_src)

# source_mapping 条目
for name in ["MarketWatch", "Investing.com", "ForexLive", "Kitco"]:
    check(f"source_mapping 包含 {name}", f'"{name}"' in news_src)


# ── T2: 社交数据查询层 market 过滤 ────────────────────────
print("\n=== T2: 数据库层 market 过滤 (backend/database/scripts/data_request.py) ===")
dr_src = read_file(BACKEND_DIR / "database" / "scripts" / "data_request.py")

check("存在 MARKET_SUBREDDIT_MAP", "MARKET_SUBREDDIT_MAP" in dr_src)
check("get_social_posts 有 market 参数",
      "def get_social_posts(start_time=None, end_time=None, limit=1000, market=None)" in dr_src)
check("使用 LOWER(url) LIKE 过滤",
      "LOWER(url) LIKE" in dr_src)
check("使用参数化查询 (%s)",
      "f\"LOWER(url) LIKE %s\"" in dr_src)
check("crypto 映射包含 bitcoin",
      '"crypto":' in dr_src and '"bitcoin"' in dr_src)
check("stock 映射包含 wallstreetbets",
      '"stock":' in dr_src and '"wallstreetbets"' in dr_src)


# ── T2: 社交情感 API 端点 market 参数 ────────────────────
print("\n=== T2: API 端点 market 参数 (backend/application/main.py) ===")
main_src = read_file(BACKEND_DIR / "application" / "main.py")

check("端点接受 market 参数",
      "market: Optional[str] = None" in main_src)
check("market 传给 get_social_posts",
      "market=market" in main_src)
check("返回结果包含 market 字段",
      '"market": market' in main_src)
check("cache_key 包含 market",
      'market or "all"' in main_src)
check("parse_time 正则已修复 (无双重转义)",
      r'r"^\d{8}T\d{6}$"' in main_src)
check("parse_time 原 bug 已移除",
      r'r"^\\d{8}T\\d{6}$"' not in main_src)


# ── T3: Reddit Fallback 机制 ─────────────────────────────
print("\n=== T3: Reddit Fallback 机制 (backend/application/main.py) ===")
check("存在 FALLBACK_SUBREDDITS", "FALLBACK_SUBREDDITS" in main_src)
check("实时 Reddit 抓取逻辑",
      "reddit_client.get_subreddit_posts" in main_src and "live_posts" in main_src)
check("fallback_used 标记", "fallback_used" in main_src)
check("返回 provider 字段",
      '"provider": "Reddit Live Fallback"' in main_src)

# 检查每个领域都有 fallback
for mkt in ["crypto", "stock", "forex", "gold", "futures"]:
    check(f"FALLBACK_SUBREDDITS 包含 {mkt}",
          f'"{mkt}"' in main_src and "FALLBACK_SUBREDDITS" in main_src)


# ── 前端 market 参数传递 ─────────────────────────────────
print("\n=== 前端 market 参数 ===")
ssov = read_file(PROJECT_ROOT / "frontend" / "src" / "components" / "SocialSentimentOverview.js")
check("SocialSentimentOverview 接受 market prop",
      "market = 'crypto'" in ssov)
check("SocialSentimentOverview API 请求带 market",
      "market=${market}" in ssov)
check("useEffect 依赖包含 market",
      "[windowHours, market]" in ssov)

dash = read_file(PROJECT_ROOT / "frontend" / "src" / "pages" / "Dashboard.js")
check("Dashboard 传递 market prop",
      "market={selectedAsset?.category || 'crypto'}" in dash)

social_section = read_file(PROJECT_ROOT / "frontend" / "src" / "components" / "SocialSection.js")
check("SocialSection 请求带 market",
      "market=${selectedAsset?.category" in social_section)


# ── Docker 容器修复 ──────────────────────────────────────
print("\n=== Docker 容器修复 (docker-compose.yml) ===")
dc = read_file(PROJECT_ROOT / "docker-compose.yml")
check("data 服务 volume 挂载 backend",
      "- ./backend:/app/backend" in dc)
check("data 服务 PYTHONPATH 已设置",
      "PYTHONPATH: /app:/app/backend" in dc)


# ── 汇总 ─────────────────────────────────────────────────
print(f"\n{'=' * 60}")
total = passed + failed
print(f"总计: {total} 项 | 通过: {passed} | 失败: {failed}")
if failed == 0:
    print("[OK] ALL TESTS PASSED")
    sys.exit(0)
else:
    print(f"[WARN] {failed} test(s) failed")
    sys.exit(1)
