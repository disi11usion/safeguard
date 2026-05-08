"""
Portfolio Health — composite 0-100 score across 5 risk dimensions.

This is the pure-math layer. The /api/portfolio/health endpoint is responsible
for fetching the inputs (price history, correlation matrix, sentiment summary);
this module just turns those inputs into per-factor sub-scores and a composite.

Public surface:
    compute_concentration(holdings)                     -> dict
    compute_correlation_score(matrix, symbols)          -> dict
    compute_macro(holdings)                             -> dict
    compute_sentiment_score(avg_sentiment, n_posts)     -> dict
    compute_volatility_score(closes_by_symbol, holdings)-> dict
    compute_portfolio_health(...)                       -> dict   (composite)

Output shape mirrors the frontend's existing MOCK_HEALTH constant exactly,
so PortfolioPage.js can render the live result with zero structural changes:
    {
      "score": int 0-100,
      "status": "HEALTHY" | "STRESSED" | "FRAGILE",
      "factors": {
        <key>: {"status": "ok"|"warning"|"danger", "label": str, "detail": str, ...}
      }
    }

Compliance: every factor is descriptive of present-state portfolio structure.
The composite never implies a recommendation to trade.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

# ─────────────────────────────────────────────────────────────────────────────
# Thresholds (single source of truth — keep in sync with drawer text + i18n)
# ─────────────────────────────────────────────────────────────────────────────

# Composite-score → status
STATUS_HEALTHY_MIN = 80
STATUS_STRESSED_MIN = 50

# Per-factor sub-score → ok / warning / danger label
# (matches FACTOR_STATUS in PortfolioPage.js)
FACTOR_OK_MIN = 70
FACTOR_WARNING_MIN = 40

# Mirror the original MOCK_HEALTH labels exactly so the frontend keeps rendering
# unchanged. If any label moves, update PortfolioPage.js + i18n keys (when added).
FACTOR_LABELS = {
    "concentration": "Concentration Risk",
    "correlation":   "Correlation Risk",
    "macro":         "Macro Exposure",
    "sentiment":     "Sentiment Skew",
    "volatility":    "Volatility Clustering",
}


# ─────────────────────────────────────────────────────────────────────────────
# Score / status helpers
# ─────────────────────────────────────────────────────────────────────────────

def _status_from_score(score: float) -> str:
    if score >= STATUS_HEALTHY_MIN:
        return "HEALTHY"
    if score >= STATUS_STRESSED_MIN:
        return "STRESSED"
    return "FRAGILE"


def _factor_status_from_score(score: float) -> str:
    if score >= FACTOR_OK_MIN:
        return "ok"
    if score >= FACTOR_WARNING_MIN:
        return "warning"
    return "danger"


def _normalize_weights(holdings: List[Dict[str, Any]]) -> List[Tuple[str, str, float]]:
    """Return [(symbol, category, fraction)] with fractions summing to 1.0."""
    total = sum(float(h.get("weight", 0) or 0) for h in holdings) or 1.0
    return [
        (
            h.get("symbol", ""),
            (h.get("category") or "unknown"),
            float(h.get("weight", 0) or 0) / total,
        )
        for h in holdings
    ]


def _empty_factor(key: str, reason: str, soft: bool = False) -> Dict[str, Any]:
    """
    Returned when input data is insufficient. soft=True excludes the factor
    from the composite mean so cold-start data gaps don't pull the score down.
    """
    return {
        "score": None if soft else 0,
        "status": "warning" if soft else "danger",
        "label": FACTOR_LABELS.get(key, key),
        "detail": reason,
        "raw": {},
    }


# ─────────────────────────────────────────────────────────────────────────────
# 1. Concentration — Herfindahl-Hirschman Index on holdings weights
# ─────────────────────────────────────────────────────────────────────────────

def compute_concentration(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    HHI = Σ (w_i)^2 with weights as fractions.
        10 equal holdings → 0.10   (very diversified)
         5 equal holdings → 0.20
         1 dominant       → ~1.00   (over-concentrated)

    Score: HHI <= 0.10 → 100, HHI >= 0.40 → 0, linear in between.
    """
    if not holdings:
        return _empty_factor("concentration", "No holdings to evaluate.")

    weighted = _normalize_weights(holdings)
    hhi = sum(frac * frac for _sym, _cat, frac in weighted)
    score = round(max(0.0, min(100.0, (0.40 - hhi) / 0.30 * 100.0)))

    top = max(weighted, key=lambda x: x[2])
    top_share = round(top[2] * 100, 1)

    return {
        "score": score,
        "status": _factor_status_from_score(score),
        "label": FACTOR_LABELS["concentration"],
        "detail": f"Largest holding {top[0]} at {top_share}% (HHI {round(hhi, 3)})",
        "raw": {"hhi": round(hhi, 4), "top_symbol": top[0], "top_weight_pct": top_share},
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. Correlation — mean of |off-diagonal| from a correlation matrix
# ─────────────────────────────────────────────────────────────────────────────

def compute_correlation_score(
    matrix: Optional[List[List[float]]],
    symbols: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Score = (1 - mean(|ρ_ij|)) * 100 over off-diagonal pairs.
        all-independent (mean |ρ| = 0) → 100
        lockstep        (mean |ρ| = 1) → 0
    """
    if not matrix or len(matrix) < 2:
        return _empty_factor(
            "correlation",
            "Need at least 2 holdings with overlapping price history for correlation.",
            soft=True,
        )

    n = len(matrix)
    pairs = [matrix[i][j] for i in range(n) for j in range(i + 1, n)]
    if not pairs:
        return _empty_factor("correlation", "No correlation pairs available.", soft=True)

    mean_abs = sum(abs(p) for p in pairs) / len(pairs)
    score = round(max(0.0, min(100.0, (1.0 - mean_abs) * 100.0)))

    if symbols and len(symbols) == n:
        best_i, best_j, best_v = 0, 1, 0.0
        for i in range(n):
            for j in range(i + 1, n):
                if abs(matrix[i][j]) > abs(best_v):
                    best_v, best_i, best_j = matrix[i][j], i, j
        detail = (
            f"Mean |ρ| = {round(mean_abs, 2)}; highest pair "
            f"{symbols[best_i]} ↔ {symbols[best_j]} at {round(best_v, 2)}"
        )
    else:
        detail = f"Mean |ρ| = {round(mean_abs, 2)} across {len(pairs)} pairs"

    return {
        "score": score,
        "status": _factor_status_from_score(score),
        "label": FACTOR_LABELS["correlation"],
        "detail": detail,
        "raw": {"mean_abs_corr": round(mean_abs, 4), "n_pairs": len(pairs)},
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. Macro — class-level diversification (HHI over asset classes)
# ─────────────────────────────────────────────────────────────────────────────

def compute_macro(holdings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Aggregate weights by category, then HHI on the category buckets.
    Captures over-weighting of an asset class even when individual holdings
    are diversified within that class.

    Score: class HHI <= 0.25 (4+ balanced classes) → 100,
           class HHI >= 0.70 (single class dominates) → 0.
    """
    if not holdings:
        return _empty_factor("macro", "No holdings to evaluate.")

    weighted = _normalize_weights(holdings)
    by_class: Dict[str, float] = {}
    for _sym, cat, frac in weighted:
        by_class[cat] = by_class.get(cat, 0.0) + frac

    class_hhi = sum(frac * frac for frac in by_class.values())
    score = round(max(0.0, min(100.0, (0.70 - class_hhi) / 0.45 * 100.0)))

    top_class, top_share = max(by_class.items(), key=lambda x: x[1])
    n_classes = len(by_class)
    detail = (
        f"Spread across {n_classes} class{'es' if n_classes != 1 else ''}; "
        f"largest is {top_class} at {round(top_share * 100, 0)}%"
    )

    return {
        "score": score,
        "status": _factor_status_from_score(score),
        "label": FACTOR_LABELS["macro"],
        "detail": detail,
        "raw": {
            "class_hhi": round(class_hhi, 4),
            "n_classes": n_classes,
            "class_breakdown": {k: round(v * 100, 1) for k, v in by_class.items()},
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. Sentiment — distance from neutral (extreme = reversal risk)
# ─────────────────────────────────────────────────────────────────────────────

def compute_sentiment_score(
    avg_sentiment: Optional[float],
    n_posts: int = 0,
) -> Dict[str, Any]:
    """
    Given a -1..+1 portfolio-wide sentiment score from social posts:
        |s| <= 0.15 → 100 (Neutral)
        |s| >= 0.70 → 0   (Extreme bullish OR extreme bearish)

    Symmetric: extremes in either direction reduce the score because they
    indicate reversal risk in observational terms.
    """
    if avg_sentiment is None or n_posts == 0:
        return _empty_factor(
            "sentiment",
            "No social posts available in the recent window.",
            soft=True,
        )

    abs_s = abs(avg_sentiment)
    score = round(max(0.0, min(100.0, (0.70 - abs_s) / 0.55 * 100.0)))

    if abs_s <= 0.15:
        bucket = "Neutral"
    elif avg_sentiment >= 0.35:
        bucket = "Bullish"
    elif avg_sentiment <= -0.35:
        bucket = "Bearish"
    elif avg_sentiment > 0:
        bucket = "Somewhat Bullish"
    else:
        bucket = "Somewhat Bearish"

    return {
        "score": score,
        "status": _factor_status_from_score(score),
        "label": FACTOR_LABELS["sentiment"],
        "detail": f"Social signal {bucket} (avg {round(avg_sentiment, 2)}, {n_posts} posts)",
        "raw": {
            "avg_sentiment": round(avg_sentiment, 4),
            "bucket": bucket,
            "n_posts": n_posts,
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. Volatility — recent vs long-term volatility ratio (proxy for clustering)
# ─────────────────────────────────────────────────────────────────────────────

def _stdev(xs: List[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    m = sum(xs) / n
    var = sum((x - m) ** 2 for x in xs) / (n - 1)
    return math.sqrt(var)


def _daily_returns(closes: List[float]) -> List[float]:
    return [
        (closes[i] - closes[i - 1]) / closes[i - 1]
        for i in range(1, len(closes))
        if closes[i - 1] != 0
    ]


def _recent_long_ratio(
    closes: List[float],
    recent_days: int = 30,
    long_days: int = 180,
) -> Optional[float]:
    """
    Compute std(last_recent_days returns) / std(last_long_days returns).

    Returns None when there isn't enough data. A ratio ≈ 1 means recent
    volatility looks like long-term volatility (no clustering); a ratio
    well above 1 means recent vol has spiked vs the long-term baseline.
    """
    rets = _daily_returns(closes)
    if len(rets) < long_days:
        return None
    long_ = rets[-long_days:]
    recent = rets[-recent_days:]
    s_long = _stdev(long_)
    if s_long == 0:
        return None
    return _stdev(recent) / s_long


def compute_volatility_score(
    closes_by_symbol: Dict[str, List[float]],
    holdings: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    Weighted-mean of (recent_30d_std / long_180d_std) across holdings.
        ratio ≈ 1.0 → calm, no clustering         → score ≈ 100
        ratio ≈ 1.5 → some clustering              → score ≈ 50
        ratio ≥ 2.0 → strong recent vol expansion  → score 0
    """
    if not holdings:
        return _empty_factor("volatility", "No holdings to evaluate.", soft=True)

    weighted = _normalize_weights(holdings)
    weighted_ratio = 0.0
    weight_used = 0.0
    skipped: List[str] = []

    for sym, _cat, frac in weighted:
        closes = closes_by_symbol.get(sym)
        if not closes:
            skipped.append(sym)
            continue
        r = _recent_long_ratio(closes)
        if r is None:
            skipped.append(sym)
            continue
        weighted_ratio += r * frac
        weight_used += frac

    if weight_used == 0:
        return _empty_factor(
            "volatility",
            "No symbols have sufficient price history (need ~180 trading days).",
            soft=True,
        )

    ratio = weighted_ratio / weight_used
    score = round(max(0.0, min(100.0, (2.0 - ratio) * 100.0)))

    n_total = len(weighted)
    detail = (
        f"30-day vol vs 180-day vol = {round(ratio, 2)}× "
        f"({n_total - len(skipped)}/{n_total} holdings analyzed)"
    )

    return {
        "score": score,
        "status": _factor_status_from_score(score),
        "label": FACTOR_LABELS["volatility"],
        "detail": detail,
        "raw": {
            "recent_long_ratio": round(ratio, 4),
            "skipped_symbols": skipped,
            "weight_coverage": round(weight_used, 4),
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# Composite
# ─────────────────────────────────────────────────────────────────────────────

def compute_portfolio_health(
    holdings: List[Dict[str, Any]],
    correlation_matrix: Optional[List[List[float]]] = None,
    correlation_symbols: Optional[List[str]] = None,
    avg_sentiment: Optional[float] = None,
    sentiment_n_posts: int = 0,
    closes_by_symbol: Optional[Dict[str, List[float]]] = None,
) -> Dict[str, Any]:
    """
    Run all 5 factors and produce a composite. Soft-failed factors (those
    with score=None because their inputs were unavailable) are excluded
    from the composite mean, so a cold start with no sentiment data
    doesn't unfairly drag the composite down to FRAGILE.

    Output shape matches the frontend's MOCK_HEALTH structure.
    """
    factors = {
        "concentration": compute_concentration(holdings),
        "correlation":   compute_correlation_score(correlation_matrix, correlation_symbols),
        "macro":         compute_macro(holdings),
        "sentiment":     compute_sentiment_score(avg_sentiment, sentiment_n_posts),
        "volatility":    compute_volatility_score(closes_by_symbol or {}, holdings),
    }

    numeric_scores = [f["score"] for f in factors.values() if f.get("score") is not None]
    composite = round(sum(numeric_scores) / len(numeric_scores)) if numeric_scores else 0

    return {
        "score": composite,
        "status": _status_from_score(composite),
        "factors": factors,
        "computed_at": _now_iso(),
        "disclosure_text": _disclosure_text(),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _disclosure_text() -> str:
    return (
        "Portfolio Health is a composite of five observational dimensions of the "
        "current portfolio. It is descriptive, not predictive — never a "
        "recommendation to buy, sell, or rebalance."
    )
