"""
Correlation Engine — pairwise return correlation for a user's portfolio.

Pure-Python (no numpy dependency) Pearson correlation, plus an optional
async layer that fetches historical daily closes from Polygon.

Public surface:
    compute_correlation_matrix(prices_by_symbol) -> dict
    pearson_correlation(returns_x, returns_y)    -> float
    daily_returns_from_closes(closes)            -> List[float]
    align_series(prices_by_symbol)               -> dict (intersection of dates)

Compliance:
    Output represents a snapshot of past co-movement only. The engine never
    states or implies that future correlations will resemble the past.
    This is observation, not forecast.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

# ─────────────────────────────────────────────────────────────────────────────
# Pure math — no I/O, no external deps
# ─────────────────────────────────────────────────────────────────────────────

def daily_returns_from_closes(closes: List[float]) -> List[float]:
    """
    Convert a series of daily close prices to daily simple returns.

    Returns a list of length len(closes) - 1.
    return_i = (close_i - close_{i-1}) / close_{i-1}
    """
    if len(closes) < 2:
        return []
    return [
        (closes[i] - closes[i - 1]) / closes[i - 1]
        for i in range(1, len(closes))
        if closes[i - 1] != 0
    ]


def pearson_correlation(x: List[float], y: List[float]) -> Optional[float]:
    """
    Compute Pearson product-moment correlation coefficient between two series.

    Returns None if:
        - the two series have different lengths,
        - either series has fewer than 2 points,
        - either series has zero variance (constant series).

    Otherwise returns a float in [-1, +1].
    """
    n = len(x)
    if n != len(y) or n < 2:
        return None

    mean_x = sum(x) / n
    mean_y = sum(y) / n

    sum_xy = 0.0
    sum_xx = 0.0
    sum_yy = 0.0
    for xi, yi in zip(x, y):
        dx = xi - mean_x
        dy = yi - mean_y
        sum_xy += dx * dy
        sum_xx += dx * dx
        sum_yy += dy * dy

    denom = math.sqrt(sum_xx * sum_yy)
    if denom == 0:
        return None  # constant series (zero variance)
    rho = sum_xy / denom
    # Numerical safety: clamp tiny floating-point overshoots
    return max(-1.0, min(1.0, rho))


def align_series(prices_by_symbol: Dict[str, List[Tuple[str, float]]]) -> Dict[str, List[float]]:
    """
    Take per-symbol [(date, close)] series and return aligned close lists
    keyed by symbol. Alignment = intersection of dates across all symbols
    (so all returned lists have the same length and represent the same days).

    Args:
        prices_by_symbol: {symbol: [(YYYY-MM-DD, close), ...] sorted by date asc}

    Returns:
        {symbol: [close_1, close_2, ...]} all of equal length, same trading days.
        Empty dict if intersection is empty.
    """
    if not prices_by_symbol:
        return {}

    # Find intersection of dates
    date_sets = [set(d for d, _ in series) for series in prices_by_symbol.values()]
    common_dates = sorted(set.intersection(*date_sets))
    if not common_dates:
        return {}

    aligned: Dict[str, List[float]] = {}
    for symbol, series in prices_by_symbol.items():
        date_to_close = dict(series)
        aligned[symbol] = [date_to_close[d] for d in common_dates]
    return aligned


# ─────────────────────────────────────────────────────────────────────────────
# Top-level: build correlation matrix from aligned closes
# ─────────────────────────────────────────────────────────────────────────────

def compute_correlation_matrix(
    prices_by_symbol: Dict[str, List[Tuple[str, float]]],
    window_days: int = 180,
) -> Dict:
    """
    Build a pairwise correlation matrix for a portfolio of symbols.

    Args:
        prices_by_symbol: {symbol: [(date, close)]} — date strings as YYYY-MM-DD,
                          sorted ascending. May contain unequal-length series.
        window_days:      Trailing window in days (used for documentation/diagnostics
                          only; alignment is by date intersection).

    Returns:
        {
          "success": bool,
          "symbols": [str],
          "matrix": [[float]],         # symmetric, diagonal=1
          "n_observations": int,       # number of return points used (after alignment)
          "window_days": int,
          "diagnostics": {
              "highest_pair":   {"a": str, "b": str, "corr": float} or None,
              "best_diversifier": {"symbol": str, "avg_corr_excluding_self": float} or None,
              "data_coverage_pct": float,  # 0..100
          },
          "computed_at": str (ISO 8601),
          "disclosure_text": str,
        }
    """
    symbols = list(prices_by_symbol.keys())

    if len(symbols) < 1:
        return _empty_response(symbols, window_days, "No assets supplied.")

    if len(symbols) == 1:
        return {
            "success": True,
            "symbols": symbols,
            "matrix": [[1.0]],
            "n_observations": 0,
            "window_days": window_days,
            "diagnostics": {
                "highest_pair": None,
                "best_diversifier": None,
                "data_coverage_pct": 100.0,
                "note": "Single-asset portfolio; correlation matrix is trivial.",
            },
            "computed_at": _now_iso(),
            "disclosure_text": _disclosure_text(window_days),
        }

    # Align by date intersection
    aligned = align_series(prices_by_symbol)
    if not aligned or any(len(closes) < 3 for closes in aligned.values()):
        return _empty_response(
            symbols, window_days,
            "Insufficient overlapping daily data across symbols (need ≥3 common days)."
        )

    # Convert each aligned price series to returns
    returns_by_symbol = {s: daily_returns_from_closes(c) for s, c in aligned.items()}
    n_obs = len(next(iter(returns_by_symbol.values())))
    if n_obs < 2:
        return _empty_response(symbols, window_days, "Too few return observations.")

    # Pairwise matrix
    matrix: List[List[float]] = []
    for s1 in symbols:
        row: List[float] = []
        for s2 in symbols:
            if s1 == s2:
                row.append(1.0)
            else:
                rho = pearson_correlation(returns_by_symbol[s1], returns_by_symbol[s2])
                row.append(round(rho, 4) if rho is not None else 0.0)
        matrix.append(row)

    # Diagnostics
    highest_pair = _find_highest_pair(symbols, matrix)
    best_diversifier = _find_best_diversifier(symbols, matrix)
    coverage_pct = round(min(100.0, n_obs / max(window_days, 1) * 100.0), 1)

    return {
        "success": True,
        "symbols": symbols,
        "matrix": matrix,
        "n_observations": n_obs,
        "window_days": window_days,
        "diagnostics": {
            "highest_pair": highest_pair,
            "best_diversifier": best_diversifier,
            "data_coverage_pct": coverage_pct,
        },
        "computed_at": _now_iso(),
        "disclosure_text": _disclosure_text(window_days),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _find_highest_pair(symbols: List[str], matrix: List[List[float]]) -> Optional[Dict]:
    """Find the off-diagonal pair (i < j) with the highest correlation."""
    best = None
    best_corr = -2.0
    for i in range(len(symbols)):
        for j in range(i + 1, len(symbols)):
            c = matrix[i][j]
            if c > best_corr:
                best_corr = c
                best = {"a": symbols[i], "b": symbols[j], "corr": round(c, 4)}
    return best


def _find_best_diversifier(symbols: List[str], matrix: List[List[float]]) -> Optional[Dict]:
    """
    For each symbol, compute mean correlation against all others (excluding self).
    Return the symbol with the LOWEST mean (best diversifier).
    """
    if len(symbols) < 2:
        return None
    best = None
    best_avg = 2.0
    for i, s in enumerate(symbols):
        others = [matrix[i][j] for j in range(len(symbols)) if j != i]
        avg = sum(others) / len(others)
        if avg < best_avg:
            best_avg = avg
            best = {"symbol": s, "avg_corr_excluding_self": round(avg, 4)}
    return best


def _empty_response(symbols: List[str], window_days: int, reason: str) -> Dict:
    return {
        "success": False,
        "symbols": symbols,
        "matrix": [],
        "n_observations": 0,
        "window_days": window_days,
        "diagnostics": {"reason": reason},
        "computed_at": _now_iso(),
        "disclosure_text": _disclosure_text(window_days),
    }


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _disclosure_text(window_days: int) -> str:
    return (
        f"Correlation matrix computed from up to {window_days} days of daily returns. "
        "Past correlations do not predict future correlations, especially during market "
        "stress when correlations historically rise sharply. This is a snapshot of "
        "recent co-movement; it is not a forecast and not investment advice."
    )
