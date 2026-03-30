import random
import re
import json
from functools import lru_cache
from urllib.parse import quote_plus
from pathlib import Path
from typing import Any, Dict, List, Optional

# ----------------------------------------
# ASSET DEFINITIONS
# ----------------------------------------
ALL_ASSETS = [
    # Core 5 assets displayed in Response1.1 as quick selection chips.
    {"key": "gold", "label": "Gold", "ticker": "XAU/USD", "market": "futures", "icon": "G"},
    {"key": "bitcoin", "label": "Bitcoin", "ticker": "BTC", "market": "crypto", "icon": "B"},
    {"key": "ethereum", "label": "Ethereum", "ticker": "ETH", "market": "crypto", "icon": "E"},
    {"key": "us stocks", "label": "US Stocks", "ticker": "GOOGL", "market": "stocks", "icon": "S"},
    {"key": "indices", "label": "Indices", "ticker": "SPY", "market": "stocks", "icon": "I"},
    # Additional assets for future scaling; append new assets directly here.
    {"key": "00 token", "label": "00 Token - United States dollar", "ticker": "X:00USD", "market": "crypto"},
    {"key": "1inch", "label": "1inch - United States dollar", "ticker": "X:1INCHUSD", "market": "crypto"},
    {"key": "agilent", "label": "Agilent Technologies Inc.", "ticker": "A", "market": "stocks"},
    {"key": "alcoa", "label": "Alcoa Corporation", "ticker": "AA", "market": "stocks"},
    {"key": "apple", "label": "Apple Inc", "ticker": "AAPL", "market": "stocks"},
    {"key": "aed-aud", "label": "United Arab Emirates dirham - Australian dollar", "ticker": "C:AEDAUD", "market": "forex"},
    {"key": "aed-bhd", "label": "United Arab Emirates dirham - Bahraini dinar", "ticker": "C:AEDBHD", "market": "forex"},
]

# Chip list used for ambiguous prompts; intentionally limited to the first 5 core assets.
ASSET_CHIPS = [
    {"key": a["key"], "label": a["label"], "icon": a.get("icon", "")}
    for a in ALL_ASSETS[:5]
]


def _build_asset_maps() -> Dict[str, Dict[str, Dict[str, str]]]:
    by_label: Dict[str, Dict[str, str]] = {}
    by_key: Dict[str, Dict[str, str]] = {}
    by_ticker: Dict[str, Dict[str, str]] = {}
    by_name: Dict[str, Dict[str, str]] = {}
    for a in ALL_ASSETS:
        label = (a.get("label") or "").strip()
        key = (a.get("key") or "").strip()
        ticker = (a.get("ticker") or "").strip()
        market = (a.get("market") or "").strip().lower()
        if label:
            by_label[label.lower()] = a
            by_name[label.lower()] = a
        if key:
            by_key[key.lower()] = a
        if ticker:
            by_ticker[ticker.lower()] = a
            by_ticker[ticker.lower().replace(":", "")] = a
        a["market"] = market or "stocks"
    return {"by_label": by_label, "by_key": by_key, "by_ticker": by_ticker, "by_name": by_name}


_ASSET_MAPS = _build_asset_maps()

# ----------------------------------------
# RESPONSE TEMPLATES
# ----------------------------------------
RESPONSE1_TEMPLATES = [
    "I understand your question. Before I can interpret it in a healthier way for you, let's first take a look at the overall market environment.\nIf you're ready, we can go through it step by step.",
    "I see what you're asking. To frame this properly, it will help to quickly review some key market signals first.\nShall we begin?",
    "This is an important question. Before I answer, let's briefly look at what's currently happening in the market so that the interpretation makes more sense.\nAre you ready?",
    "I've picked up your question. To give you a clearer perspective, I'd first like to take a quick look at the overall market environment.\nShall we go through it together?",
]

RESPONSE1_1_PROMPT = (
    "You've asked a broad market-related question, which is totally fine.\n"
    "To give you a clearer perspective, could you first choose which area you're most interested in?"
)

SOCIAL_EXPLANATION_TEMPLATES = [
    "Safeguard uses a score that evaluates these discussions based on both intensity and emotional tone.",
    "At this stage, Safeguard proceeds using a dedicated score that summarizes social media discussions within a single framework.",
    "The Safeguard Social Media Score considers not only the volume of conversations, but also their tone.",
    "This assessment is based on the score Safeguard uses to make sense of social discussions.",
    "Here, Safeguard relies on a score designed to help interpret social media activity more clearly.",
]

# Response3 transition text options (social context -> news context).
RESPONSE3_NEWS_TRANSITION_OPTIONS = [
    # Option 1 (Most regulator-friendly)
    "This score reflects the general market sentiment. Let's now review the news that is shaping this sentiment together.",
    
    # Option 2 (Soft, conversational tone)
    "The sentiment we see here may not be sufficient on its own. Let's quickly review the news together to complete the context.",
    
    # Option 3 (Awareness-focused)
    "Market sentiment appears to be forming in this direction. To understand what's behind it, we can move to the news section.",
    
    # Option 4 (User control + safe language)
    "This chart provides a framework. Shall we complete that framework by reviewing the related news together?",
    
    # Option 5 (Shortest & safest)
    "Let's now review the news driving this sentiment together.",
]

# Response4 prompt options for exploring more after the news step.
RESPONSE4_ASK_LOGIN_OPTIONS = [
    "Want to explore more tools and insights? I can take you to the Dashboard.",
    "Ready to dig deeper? Let's jump to the Dashboard for more views.",
    "Would you like to explore more features on the Dashboard?",
    "We can continue to the Dashboard to explore more insights. Want to go?",
]

# Response4.1 options when the user declines login/exploration.
RESPONSE4_1_OTHER_FEATURES_OPTIONS = [
    "No problem! Would you like to explore other features instead? You can check out the Dashboard for a comprehensive market overview.",
    "That's okay! Feel free to explore our Dashboard for real-time market data, or ask me about another asset.",
    "Sure thing! You can still explore our Dashboard to see market trends, or let me know if you'd like to learn about another asset.",
    "Understood! Would you like to visit the Dashboard for more market insights, or ask about a different topic?",
]

# Alternate feature chips shown in Response4.1.
OTHER_FEATURE_CHIPS = [
    {"key": "dashboard", "label": "Go to Homepage", "icon": "📊", "action": "navigate", "path": "/"},
    {"key": "calendar", "label": "View Calendar", "icon": "🗓️", "action": "navigate", "path": "/calendar"},
    {"key": "new_asset", "label": "Ask about another asset", "icon": "🔄", "action": "restart"},
    {"key": "ai_chat", "label": "Try AI Chat", "icon": "🤖", "action": "navigate", "path": "/ai-chat"},
]

# ----------------------------------------
# HELPERS
# ----------------------------------------
def _normalize(text: str) -> str:
    return text.lower().strip()


def _ambiguous_or_unstructured_(text: str) -> bool:
    lowered = _normalize(text)
    greetings = ["hello", "hi", "hey", "what can you do", "help", "???"]

    if lowered in greetings:
        return True

    if len(lowered.split()) <= 2:
        return True

    return False


def _extract_asset(text: str) -> Optional[str]:
    lowered = _normalize(text)
    # First pass: exact key/label/ticker match across ALL_ASSETS.
    for a in ALL_ASSETS:
        key = (a.get("key") or "").lower()
        label = (a.get("label") or "").lower()
        ticker = (a.get("ticker") or "").lower().replace(":", "")
        if key and re.search(rf"\b{re.escape(key)}\b", lowered):
            return a["label"]
        if label and re.search(rf"\b{re.escape(label)}\b", lowered):
            return a["label"]
        if ticker and len(ticker) >= 2:
            if re.search(rf"\b{re.escape(ticker)}\b", lowered.replace(" ", "")):
                return a["label"]

    def similar(a: str, b: str) -> bool:
        if abs(len(a) - len(b)) > 2:
            return False
        diff = sum(x != y for x, y in zip(a, b))
        return diff <= 2

    # Second pass: small fuzzy match for typo tolerance on key/label.
    for a in ALL_ASSETS:
        if similar(lowered, (a.get("key") or "").lower()) or similar(lowered, (a.get("label") or "").lower()):
            return a["label"]

    return None


def _infer_stage_from_history(messages: List[Dict[str, str]]) -> str:
    """
    Infer the current conversation stage from assistant history.

    Priority model:
    1. Inspect the latest assistant messages for explicit stage signals.
    2. Match keywords with stage-specific precedence.
    3. Keep verbose debug output to simplify flow troubleshooting.
    """
    assistant_msgs = [m for m in messages if m.get("role") == "assistant"]
    
    # Debug trace: print the last 3 messages to understand stage transitions.
    print(f"[DEBUG] Last 3 messages:")
    for m in messages[-3:]:
        role = m.get("role", "unknown")
        content = (m.get("content", "") or "")[:100]
        print(f"  {role}: {content}")
    
    if not assistant_msgs:
        print(f"[DEBUG] No assistant messages, returning HOME_INIT")
        return "HOME_INIT"

    last_assistant_msg = assistant_msgs[-1]
    last_a = _normalize(last_assistant_msg.get("content", "") or "")
    
    print(f"[DEBUG] Last assistant message (normalized): {last_a[:100]}")

    # Stage detector: keywords indicating user is browsing alternate features.
    other_features_keywords = [
        "explore other features",
        "check out the dashboard",
        "visit the dashboard",
        "ask about another asset",
        "explore our dashboard"
    ]
    if any(keyword in last_a for keyword in other_features_keywords):
        print(f"[DEBUG] Detected stage: OTHER_FEATURES")
        return "OTHER_FEATURES"

    # Stage detector: keywords indicating login/dashboard exploration intent.
    login_keywords = [
        "explore more",
        "jump to the dashboard",
        "explore features on the dashboard",
        "go to the dashboard",
        "continue to the dashboard"
    ]
    if any(keyword in last_a for keyword in login_keywords):
        print(f"[DEBUG] Detected stage: ASK_LOGIN")
        return "ASK_LOGIN"

    # Stage detector: keywords indicating transition to news.
    news_keywords = [
        "review the news driving this sentiment",
        "let's quickly review the news together",
        "move to the news section",
        "shall we complete that framework by reviewing",
        "market sentiment appears to be forming",
        "this score reflects the general market sentiment",
        "browse through the articles",  # Frontend follow-up phrase after Response3
        "click continue when you're ready to proceed"  # Frontend follow-up phrase after Response3
    ]
    if any(keyword in last_a for keyword in news_keywords):
        print(f"[DEBUG] Detected stage: TO_NEWS")
        return "TO_NEWS"

    # Stage detector: keywords indicating social context summary state.
    # If previous assistant message was social context, accept continuation prompts as SOCIAL_CONTEXT.
    social_keywords = [
        "social environment around",
        "social media score",
        "safeguard uses a score",
        "safeguard social media score",
        "looks like today",
        "continue and see what's happening in the news",  # legacy front-end follow-up prompt
        "would you like to continue",  # current front-end follow-up prompt
    ]
    
    # Fallback check on the latest assistant message for social context keywords.
    if len(assistant_msgs) >= 2:
        second_last = _normalize(assistant_msgs[-2].get("content", "") or "")
        if any(kw in second_last for kw in social_keywords):
    # Scan user messages from newest to oldest for explicit asset mentions.
            if "ready to see the news" in last_a or "shall we take one more step" in last_a:
                print(f"[DEBUG] Detected stage: SOCIAL_CONTEXT (from continuation prompt)")
                return "SOCIAL_CONTEXT"
    
    # Fallback: infer asset from assistant social-context sentence patterns.
    if any(kw in last_a for kw in social_keywords):
        print(f"[DEBUG] Detected stage: SOCIAL_CONTEXT")
        return "SOCIAL_CONTEXT"

    # 6. Response1.1 - Need tag
    if "choose which area you're most interested in" in last_a:
        print(f"[DEBUG] Detected stage: NEED_TAG")
        return "NEED_TAG"

    print(f"[DEBUG] No stage matched, returning HOME_INIT")
    return "HOME_INIT"


def _infer_last_asset_from_history(messages: List[Dict[str, str]]) -> Optional[str]:
    """
    Extract the most recently referenced asset from message history.
    """
    # Prefer normalized label mapping first.
    for m in reversed(messages):
        content = m.get("content", "") or ""
        asset = _extract_asset(content)
        if asset:
            print(f"[DEBUG] Found asset from user message: {asset}")
            return asset

    # Fallback to ticker mapping (skip very short tokens to reduce false positives).
    assistant_msgs = [m for m in messages if m.get("role") == "assistant"]
    for m in reversed(assistant_msgs):
        txt = m.get("content", "") or ""
        match = re.search(r"around\s+([A-Za-z ]+)\s+looks like today", txt, re.IGNORECASE)
        if match:
            guess = match.group(1).strip()
            normalized = _extract_asset(guess)
            asset = normalized or guess
            print(f"[DEBUG] Found asset from assistant message: {asset}")
            return asset

    print(f"[DEBUG] No asset found in history")
    return None


def _is_affirm(text: str) -> bool:
    lowered = _normalize(text)
    return lowered in ["yes", "y", "sure", "ok", "okay", "let's go", "go", "proceed", "show", "show chart", "continue"]


def _is_decline(text: str) -> bool:
    lowered = _normalize(text)
    return lowered in ["no", "n", "not now", "later", "skip", "don't", "dont"]


# ----------------------------------------
# BUILDERS
# ----------------------------------------
def _build_response1(unclear: bool, add_continue: bool = False, asset: Optional[str] = None) -> Dict[str, Any]:
    template = RESPONSE1_1_PROMPT if unclear else random.choice(RESPONSE1_TEMPLATES)
    payload: Dict[str, Any] = {
        "success": True,
        "source": "rule_based_v1",
        "type": "response1_1_select_asset" if unclear else "response1_context_only",
        "reply": template,
    }
    if unclear:
        payload["assets"] = ASSET_CHIPS
    if add_continue:
        chip: Dict[str, Any] = {"label": "Continue", "icon": "->"}
        if asset:
            chip["action"] = "continue_asset"
            chip["asset"] = asset
        payload["chips"] = [chip]
    if asset:
        payload["asset"] = asset
    return payload


_POSITIVE_THRESHOLD = 0.15
_NEGATIVE_THRESHOLD = -0.15


_ASSET_LABEL_TO_TICKER = {lbl: info.get("ticker", "") for lbl, info in _ASSET_MAPS["by_label"].items()}
_ASSET_LABEL_TO_MARKET = {lbl: info.get("market", "stocks") for lbl, info in _ASSET_MAPS["by_label"].items()}


def _asset_to_ticker(asset: str) -> str:
    raw = (asset or "").strip()
    if not raw:
        return ""

    lowered = raw.lower().strip()
    # Primary path: canonical label/key mapping (most stable for UI-selected assets).
    mapped = _ASSET_LABEL_TO_TICKER.get(lowered)
    if mapped:
        return mapped.upper()

    # Secondary path: direct ticker lookup for inputs like "btc" or "xauusd".
    if len(lowered) >= 2:
        info = _ASSET_MAPS.get("by_ticker", {}).get(lowered)
        if info and info.get("ticker"):
            return info["ticker"].upper()

    # Handle patterns like "X:00USD" or "CRYPTO:BTC".
    upper = raw.upper().strip()
    if ":" in upper:
        prefix, value = upper.split(":", 1)
        if prefix in {"X", "C", "CRYPTO", "FOREX"} and value:
            return value.strip()

    # Handle patterns like "Bitcoin (BTC)".
    match = re.search(r"\(([A-Z0-9]{2,10})\)", upper)
    if match:
        return match.group(1)

    return upper


def _asset_to_market(asset: str) -> str:
    lowered = (asset or "").strip().lower()
    # Keep market inference aligned with the same lookup order used by ticker resolution.
    if lowered in _ASSET_LABEL_TO_MARKET:
        return _ASSET_LABEL_TO_MARKET[lowered]
    if len(lowered) >= 2:
        by_ticker = _ASSET_MAPS.get("by_ticker", {})
        info = by_ticker.get(lowered)
        if info and info.get("market"):
            return info["market"]
    return "stocks"


def _asset_to_route(asset: Optional[str]) -> str:
    ticker = _asset_to_ticker(asset or "")
    market = _asset_to_market(asset or "")
    name = quote_plus((asset or "").strip() or ticker or "Asset")
    symbol = quote_plus(ticker or "")
    if market == "futures":
        return f"/analysis/futures?symbol={symbol}&name={name}"
    return f"/analysis/ticker?symbol={symbol}&name={name}&market={market}"


def _classify_sentiment(score: float) -> str:
    if score > _POSITIVE_THRESHOLD:
        return "positive"
    if score < _NEGATIVE_THRESHOLD:
        return "negative"
    return "neutral"


def _classify_intensity(article_count: int) -> str:
    if article_count >= 50:
        return "High"
    if article_count >= 20:
        return "Medium"
    return "Low"


def _format_label(label: str) -> str:
    lowered = (label or "").strip().lower()
    if not lowered:
        return "Neutral"
    return lowered.capitalize()


def _trend_icon(trend: str) -> str:
    normalized = (trend or "").strip().lower()
    if normalized == "positive":
        return "up"
    if normalized == "negative":
        return "down"
    return "flat"


@lru_cache(maxsize=3)
def _load_news_sentiment_feed(market: str) -> List[Dict[str, Any]]:
    """
    Load mock AlphaVantage NEWS_SENTIMENT data from backend/_lib.

    Avoid hardcoding filenames by discovering `mock_news_sentiment_*.json` files and
    selecting the one that matches the requested market.
    """
    lib_dir = Path(__file__).resolve().parents[2] / "_lib"
    candidates = list(lib_dir.glob("mock_news_sentiment_*.json"))
    if not candidates:
        return []

    selected: Optional[Path] = None
    normalized_market = (market or "").strip().lower()
    for path in candidates:
        # e.g. news_sentiment_crypto.json -> "crypto"
        stem = path.stem  # mock_news_sentiment_crypto
        if stem.startswith("mock_news_sentiment_"):
            suffix = stem.replace("mock_news_sentiment_", "", 1).lower()
            if suffix == normalized_market:
                selected = path
                break

    # If market doesn't match any discovered file, just pick the first available.
    mock_file = selected or candidates[0]
    try:
        with open(mock_file, "r", encoding="utf-8") as handle:
            payload = json.load(handle)
    except Exception:
        return []

    items = payload.get("feed") or payload.get("items") or []
    return items if isinstance(items, list) else []


def _compute_sentiment_stats_from_feed(asset: str, feed_items: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    asset_symbol = _asset_to_ticker(asset)
    if not asset_symbol:
        return None

    per_day_scores: Dict[str, List[float]] = {}
    total_articles = 0

    for item in feed_items:
        date_str = item.get("time_published")
        if not isinstance(date_str, str) or not re.match(r"^\d{8}T\d{6}$", date_str):
            continue

        date_key = f"{date_str[0:4]}-{date_str[4:6]}-{date_str[6:8]}"

        ticker_sentiments = item.get("ticker_sentiments") or item.get("ticker_sentiment") or []
        if not isinstance(ticker_sentiments, list):
            continue

        for ts in ticker_sentiments:
            if not isinstance(ts, dict):
                continue

            ticker = (ts.get("ticker") or "").upper()
            if ticker.startswith("CRYPTO:") or ticker.startswith("FOREX:"):
                ticker = ticker.split(":", 1)[1]

            if ticker != asset_symbol:
                continue

            raw_score = ts.get("ticker_sentiment_score")
            if raw_score is None:
                raw_score = ts.get("sentiment_score")
            try:
                score = float(raw_score or 0)
            except Exception:
                score = 0.0

            per_day_scores.setdefault(date_key, []).append(score)
            total_articles += 1

    if not per_day_scores:
        return None

    sorted_days = sorted(per_day_scores.keys())
    daily_averages = [sum(per_day_scores[d]) / len(per_day_scores[d]) for d in sorted_days]

    average = sum(daily_averages) / len(daily_averages)
    latest = daily_averages[-1]
    previous = daily_averages[-2] if len(daily_averages) > 1 else latest

    trend = "neutral"
    if latest > previous + 0.05:
        trend = "positive"
    elif latest < previous - 0.05:
        trend = "negative"

    label = _classify_sentiment(latest)

    return {
        "symbol": asset_symbol,
        "latest": round(latest, 3),
        "average": round(average, 3),
        "articles": total_articles,
        "label": label,
        "trend": trend,
    }


def _extract_recent_news(asset: str, limit: int = 3) -> List[Dict[str, Any]]:
    """
    Return up to `limit` most recent news items for the given asset from mock NEWS_SENTIMENT feeds.
    """
    asset_symbol = _asset_to_ticker(asset)
    if not asset_symbol or limit <= 0:
        return []

    best_items: List[Dict[str, Any]] = []

    for market in ("crypto", "forex", "stocks"):
        feed_items = _load_news_sentiment_feed(market)
        matched: List[Dict[str, Any]] = []

        for item in feed_items:
            ticker_sentiments = item.get("ticker_sentiments") or item.get("ticker_sentiment") or []
            if not isinstance(ticker_sentiments, list):
                continue

            found = False
            for ts in ticker_sentiments:
                if not isinstance(ts, dict):
                    continue
                ticker = (ts.get("ticker") or "").upper()
                if ticker.startswith("CRYPTO:") or ticker.startswith("FOREX:"):
                    ticker = ticker.split(":", 1)[1]
                if ticker == asset_symbol:
                    found = True
                    break

            if not found:
                continue

            time_published = item.get("time_published") or ""
            matched.append(
                {
                    "title": item.get("title"),
                    "url": item.get("url"),
                    "source": item.get("source"),
                    "time_published": time_published,
                }
            )

        matched.sort(key=lambda x: x.get("time_published") or "", reverse=True)
        matched = matched[:limit]

        if len(matched) > len(best_items):
            best_items = matched

    return best_items[:limit]


def _social_card(asset: str) -> Dict[str, Any]:
    best_stats: Optional[Dict[str, Any]] = None
    best_articles = -1

    for market in ("crypto", "forex", "stocks"):
        feed_items = _load_news_sentiment_feed(market)
        stats = _compute_sentiment_stats_from_feed(asset, feed_items)
        if not stats:
            continue
        if stats["articles"] > best_articles:
            best_stats = stats
            best_articles = stats["articles"]

    if not best_stats:
        return {
            "asset": asset,
            "symbol": _asset_to_ticker(asset) or asset,
            "latest": 0.0,
            "average": 0.0,
            "articles": 0,
            "label": "neutral",
            "trend": "neutral",
            "latest_text": "0.000 (Neutral)",
            "average_text": "0.000",
            "articles_text": "0",
            "trend_icon": "flat",
            "score": 0.0,
            "tone": "neutral",
            "intensity": "Low",
        }

    label_display = _format_label(best_stats["label"])
    latest_value = float(best_stats["latest"])
    average_value = float(best_stats["average"])
    articles_value = int(best_stats["articles"])

    intensity = _classify_intensity(int(best_stats["articles"]))
    return {
        **best_stats,
        "asset": asset,
        # --- fields to match the UI card (Latest / Average / Articles) ---
        "latest_text": f"{latest_value:.3f} ({label_display})",
        "average_text": f"{average_value:.3f}",
        "articles_text": str(articles_value),
        "trend_icon": _trend_icon(best_stats["trend"]),
        "score": best_stats["latest"],
        "tone": best_stats["label"],
        "intensity": intensity,
    }


async def _enrich_social_card_with_market_data(asset: str, card: Dict[str, Any]) -> Dict[str, Any]:
    """
    Fallback enrichment for empty sentiment card.

    When mock sentiment feeds are empty (feed=[]), card values become 0.
    In that case, use existing market summary data as a non-zero fallback so
    the landing-chat card remains informative.
    """
    try:
        if not isinstance(card, dict):
            return card

        # Only enrich when card is effectively empty.
        if int(card.get("articles", 0) or 0) > 0:
            return card

        # Local import keeps this module lightweight and avoids hard dependency
        # at import time.
        from application.clients.polygon_client import PolygonClient

        ticker = _asset_to_ticker(asset)
        market = _asset_to_market(asset)
        api_market = "forex" if market == "futures" else market
        if not ticker:
            return card

        client = PolygonClient()
        summary = await client.get_market_summary_with_indicators(
            ticker=ticker,
            market=api_market,
            days=12,
        )
        if not summary.get("success"):
            return card

        current_price = float(summary.get("current_price") or 0.0)
        change_24h = float(summary.get("change_24h") or 0.0)
        data_points = int(summary.get("data_points") or 0)
        indicators = summary.get("indicators") or {}
        sma = indicators.get("sma")
        average = float(sma) if isinstance(sma, (int, float)) and sma is not None else current_price

        if change_24h > 0:
            label = "positive"
            trend = "positive"
        elif change_24h < 0:
            label = "negative"
            trend = "negative"
        else:
            label = "neutral"
            trend = "neutral"

        label_display = _format_label(label)
        intensity = _classify_intensity(data_points)

        enriched = dict(card)
        enriched.update(
            {
                "asset": asset,
                "symbol": ticker,
                "latest": round(current_price, 3),
                "average": round(average, 3),
                "articles": data_points,
                "label": label,
                "trend": trend,
                "latest_text": f"{current_price:.3f} ({label_display})",
                "average_text": f"{average:.3f}",
                "articles_text": str(data_points),
                "trend_icon": _trend_icon(trend),
                # Preserve a score-like field for UI compatibility.
                "score": round(change_24h, 3),
                "tone": label,
                "intensity": intensity,
                "source": "market_summary_fallback",
            }
        )
        return enriched
    except Exception:
        return card


def _build_response2(asset: str, include_news: bool = False) -> Dict[str, Any]:
    opener = f"Great - let's take a look at what the social environment around {asset} looks like today."
    payload: Dict[str, Any] = {
        "success": True,
        "source": "rule_based_v1",
        "type": "response2_asset_overview",
        "asset": asset,
        "reply": opener,
        "social_explanation": random.choice(SOCIAL_EXPLANATION_TEMPLATES),
        "social_card": _social_card(asset),
    }
    if include_news:
        news_items = _extract_recent_news(asset, limit=3)
        if news_items:
            payload["news"] = news_items
            payload["news_limit"] = 3
        else:
            payload["news"] = []
            payload["news_message"] = "No recent related news; discussion volume may be low."
    return payload


def _build_response3_to_news(asset: Optional[str]) -> Dict[str, Any]:
    """
    Build Response3: transition from social context to related news.

    Frontend behavior: when `type` is `response3_transition_to_news`,
    the client renders news-focused follow-up content.

    Args:
        asset: Current asset label, e.g. "Bitcoin" or "Gold".

    Returns:
        Response payload for the news transition step.
    """
    # Keep transition wording randomized so repeated conversations feel less robotic.
    msg = random.choice(RESPONSE3_NEWS_TRANSITION_OPTIONS)
    
    payload: Dict[str, Any] = {
        "success": True,
        "source": "rule_based_v1",
        "type": "response3_transition_to_news",  # Frontend stage discriminator
        "reply": msg,
    }
    
    # Include asset-scoped news when context exists; this keeps Response3 actionable.
    if asset:
        payload["asset"] = asset
        news_items = _extract_recent_news(asset, limit=3)
        payload["news"] = news_items
        payload["news_limit"] = 3
        if not news_items:
            payload["news_message"] = "No recent related news; discussion volume may be low."
    
    return payload


def _build_response4_ask_login(asset: Optional[str]) -> Dict[str, Any]:
    """
    Build Response4: ask whether the user wants to continue exploring.

    Frontend behavior: `type=response4_ask_login` renders exploration
    options with Yes/No style actions.

    Args:
        asset: Current asset label in context.

    Returns:
        Response payload including CTA actions.
    """
    msg = random.choice(RESPONSE4_ASK_LOGIN_OPTIONS)
    target_asset = asset or "Gold"
    
    payload: Dict[str, Any] = {
        "success": True,
        "source": "rule_based_v1",
        "type": "response4_ask_login",
        "reply": msg,
        "cta": "Would you like to explore more on the Dashboard?",
        "actions": [
            {
                "key": "go_dashboard",
                "label": "Go to Dashboard",
                "icon": "check",
                "action": "navigate",
                "path": _asset_to_route(target_asset),
            },
            {"key": "maybe_later", "label": "Maybe Later", "icon": "x", "action": "continue"},
        ],
    }
    
    payload["asset"] = target_asset
    
    return payload


def _build_response4_1_other_features(asset: Optional[str]) -> Dict[str, Any]:
    """
    Build Response4.1: provide alternatives when login is declined.

    Frontend behavior: `type=response4_1_other_features` renders
    a set of alternative feature chips.

    Args:
        asset: Current asset label in context.

    Returns:
        Response payload with alternative actions.
    """
    msg = random.choice(RESPONSE4_1_OTHER_FEATURES_OPTIONS)
    
    payload: Dict[str, Any] = {
        "success": True,
        "source": "rule_based_v1",
        "type": "response4_1_other_features",
        "reply": msg,
        "features": OTHER_FEATURE_CHIPS,
    }
    
    if asset:
        payload["asset"] = asset
    
    return payload


# ----------------------------------------
# MAIN ENTRY
# ----------------------------------------
def generate_chat_reply_new(messages: List[Dict[str, str]]) -> Optional[Dict[str, Any]]:
    """
    Rule-based state machine for landing chat.

    Extension points:
    - Add new stages in `_infer_stage_from_history`.
    - Add new response builders and route them here.
    - Keep fallback branches explicit to avoid ambiguous transitions.
    """
    if not messages:
        return _build_response1(unclear=True)

    user_messages = [m for m in messages if m.get("role") == "user"]
    if not user_messages:
        return _build_response1(unclear=True)

    last_msg = user_messages[-1].get("content", "") or ""
    asset = _extract_asset(last_msg)

    is_first_user_turn = len(user_messages) == 1
    stage = _infer_stage_from_history(messages)
    last_asset = _infer_last_asset_from_history(messages)

    print(f"[DEBUG] Stage: {stage}, Last message: '{last_msg}', Asset: {asset}, Last asset: {last_asset}")

    # Handle early-stage continue: only route to Response2 when asset context exists.
    if (
        stage in ["HOME_INIT", "NEED_TAG"]
        and _normalize(last_msg) in ["continue", "next", "go", "yes", "proceed", "let's go", "okay", "ok"]
        and last_asset
    ):
        return _build_response2(last_asset, include_news=False)

    # First user-turn routing.
    if is_first_user_turn:
        if asset:
            return _build_response1(unclear=False, add_continue=True, asset=asset)
        if _ambiguous_or_unstructured_(last_msg):
            return _build_response1(unclear=True)
        return _build_response1(unclear=True)

    # Prioritize yes/no handling in stage-sensitive flows to avoid false asset matches.
    # ASK_LOGIN stage yes/no handling.
    if stage == "ASK_LOGIN":
        if _is_affirm(last_msg):
            target_asset = asset or last_asset or _infer_last_asset_from_history(messages)
            return {
                "success": True,
                "source": "rule_based_v1",
                "type": "response4_navigate_dashboard",
                "reply": "Great! Redirecting you to the Dashboard...",
                "action": "navigate",
                "path": _asset_to_route(target_asset)
            }
        if _is_decline(last_msg):
            print(f"[DEBUG] User declined login, showing other features for asset: {last_asset}")
            return _build_response4_1_other_features(last_asset)
        # If input is not yes/no, continue with asset detection below.

    # If the user provided a new asset, route directly to Response2.
    # Exclude short affirmative/negative replies from asset routing.
    if asset and not _is_affirm(last_msg) and not _is_decline(last_msg):
        return _build_response2(asset)

    # Initial-stage fallback behavior.
    if stage in ["HOME_INIT", "NEED_TAG"]:
        if _ambiguous_or_unstructured_(last_msg) or len(_normalize(last_msg).split()) <= 3:
            return _build_response1(unclear=True)
        return _build_response1(unclear=True)

    # Response2 -> Response3 transition handling.
    if stage == "SOCIAL_CONTEXT":
        # Check for explicit continue intent.
        if _normalize(last_msg) in ["continue", "next", "go", "yes", "show news", "proceed", "let's go", "okay", "ok"]:
            print(f"[DEBUG] Transitioning to Response3 for asset: {last_asset}")
            return _build_response3_to_news(last_asset)
        
        # Wait for explicit user confirmation.
        return {
            "success": True,
            "source": "rule_based_v1",
            "type": "waiting_user_confirmation",
            "reply": "Would you like to continue?",
            "cta": True
        }

    # Response3 -> Response4 transition handling.
    if stage == "TO_NEWS":
        # Continue command moves flow to login prompt.
        if _normalize(last_msg) in ["continue", "next", "go", "yes", "proceed", "let's go", "okay", "ok"]:
            target_asset = asset or last_asset or _infer_last_asset_from_history(messages)
            print(f"[DEBUG] After Response3, moving to Response4 (ask login) for asset: {target_asset}")
            return _build_response4_ask_login(target_asset)
        
        # Wait for explicit user confirmation.
        return {
            "success": True,
            "source": "rule_based_v1",
            "type": "waiting_user_confirmation",
            "reply": "Take your time reviewing the news. When you're ready, let me know!",
            "cta": True
        }

    # ASK_LOGIN has priority above; this branch re-prompts for non yes/no input.
    if stage == "ASK_LOGIN":
        # Repeat the login exploration prompt.
        return _build_response4_ask_login(last_asset)

    # Response4.1: alternative feature selection flow.
    if stage == "OTHER_FEATURES":
        lowered = _normalize(last_msg)
        
        # User chooses dashboard.
        if "dashboard" in lowered:
            return {
                "success": True,
                "source": "rule_based_v1",
                "type": "response4_1_navigate_dashboard",
                "reply": "Sure! Taking you to the Dashboard for a comprehensive market overview.",
                "action": "navigate",
                "path": "/dashboard"
            }
        
        # User chooses another asset.
        if "another asset" in lowered or "new asset" in lowered or "different" in lowered:
            return {
                "success": True,
                "source": "rule_based_v1",
                "type": "response4_1_restart",
                "reply": "Of course! What asset would you like to explore? Try: Gold, Bitcoin, Ethereum, US Stocks, or Indices.",
                "assets": ASSET_CHIPS
            }
        
        # User chooses AI chat.
        if "ai chat" in lowered or "chat" in lowered:
            return {
                "success": True,
                "source": "rule_based_v1",
                "type": "response4_1_navigate_ai_chat",
                "reply": "Great choice! Redirecting you to our AI Chat for more in-depth conversations.",
                "action": "navigate",
                "path": "/ai-chat"
            }
        
        # For other input, keep showing available options.
        return _build_response4_1_other_features(last_asset)

    # Fallback
    return _build_response1(unclear=True)


async def handle_landing_chat(
    messages: List[Dict[str, Any]],
    model: str = "gpt-3.5-turbo",
    max_tokens: Optional[int] = None,
    temperature: float = 0.7,
) -> Dict[str, Any]:
    """
    Endpoint adapter for /api/ai/landing-chat.

    Keeps the route contract stable while delegating core flow logic to
    `generate_chat_reply_new`.
    """
    # Normalize route payload into the shape expected by rule engine.
    normalized: List[Dict[str, str]] = []
    for msg in messages or []:
        role = str(msg.get("role", "user"))
        content = str(msg.get("content", ""))
        normalized.append({"role": role, "content": content})

    result = generate_chat_reply_new(normalized)
    if isinstance(result, dict):
        if result.get("type") == "response2_asset_overview" and result.get("asset") and result.get("social_card"):
            result["social_card"] = await _enrich_social_card_with_market_data(
                asset=str(result.get("asset")),
                card=result.get("social_card") or {},
            )
        return result

    # Defensive fallback to avoid 500 when rule engine returns empty.
    return {
        "success": True,
        "source": "rule_based_v1",
        "type": "response1_1_select_asset",
        "reply": RESPONSE1_1_PROMPT,
        "assets": ASSET_CHIPS,
        "meta": {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
        },
    }
