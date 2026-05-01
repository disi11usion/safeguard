"""
Tests for application.services.correlation_engine.

Run from backend/:
    python -m pytest test_correlation_engine.py -v
"""

import pytest

from application.services import correlation_engine as ce


# ─────────────────────────────────────────────────────────────────────────────
# pearson_correlation — pure math
# ─────────────────────────────────────────────────────────────────────────────

def test_pearson_hand_example_btc_eth():
    """4-day BTC vs ETH from documentation. Expected ρ ≈ 0.9660."""
    btc = [0.02, -0.01, 0.03, 0.0]
    eth = [0.03, -0.02, 0.04, 0.01]
    rho = ce.pearson_correlation(btc, eth)
    assert abs(rho - 0.9660) < 0.001


def test_pearson_self_is_one():
    x = [0.01, 0.05, -0.02, 0.03, -0.01]
    assert ce.pearson_correlation(x, x) == pytest.approx(1.0)


def test_pearson_negation_is_minus_one():
    x = [0.01, 0.05, -0.02, 0.03, -0.01]
    y = [-v for v in x]
    assert ce.pearson_correlation(x, y) == pytest.approx(-1.0)


def test_pearson_constant_series_returns_none():
    """Constant series has zero variance — undefined correlation."""
    assert ce.pearson_correlation([1, 2, 3, 4], [5, 5, 5, 5]) is None


def test_pearson_mismatched_lengths_returns_none():
    assert ce.pearson_correlation([1, 2, 3], [1, 2]) is None


def test_pearson_too_short_returns_none():
    assert ce.pearson_correlation([1], [2]) is None


def test_pearson_clamps_to_unit_interval():
    """Numerical noise should never produce |rho| > 1."""
    # Very long correlated series — should hit exactly 1.0 not 1.0000000002
    n = 10_000
    x = [i / 100.0 for i in range(n)]
    y = [v + 0.0 for v in x]
    rho = ce.pearson_correlation(x, y)
    assert -1.0 <= rho <= 1.0


# ─────────────────────────────────────────────────────────────────────────────
# daily_returns_from_closes
# ─────────────────────────────────────────────────────────────────────────────

def test_daily_returns_basic():
    closes = [100.0, 102.0, 100.98, 103.0]
    returns = ce.daily_returns_from_closes(closes)
    assert len(returns) == 3
    assert returns[0] == pytest.approx(0.02)
    assert returns[1] == pytest.approx(-0.01, abs=0.001)


def test_daily_returns_too_short():
    assert ce.daily_returns_from_closes([100.0]) == []
    assert ce.daily_returns_from_closes([]) == []


def test_daily_returns_skips_zero_denominator():
    closes = [100.0, 0.0, 50.0]
    returns = ce.daily_returns_from_closes(closes)
    # First step: 0/100 - 1 = -1 → valid
    # Second step: 50/0 → would divide by zero → skipped
    assert len(returns) == 1
    assert returns[0] == pytest.approx(-1.0)


# ─────────────────────────────────────────────────────────────────────────────
# align_series — date intersection
# ─────────────────────────────────────────────────────────────────────────────

def test_align_simple_overlap():
    prices = {
        "A": [("2026-01-01", 100), ("2026-01-02", 101), ("2026-01-03", 102)],
        "B": [("2026-01-02", 50),  ("2026-01-03", 51),  ("2026-01-04", 52)],
    }
    aligned = ce.align_series(prices)
    # Intersection is 01-02 and 01-03
    assert len(aligned["A"]) == 2
    assert len(aligned["B"]) == 2
    assert aligned["A"] == [101, 102]
    assert aligned["B"] == [50, 51]


def test_align_empty_intersection():
    prices = {
        "A": [("2026-01-01", 100)],
        "B": [("2026-02-01", 50)],
    }
    aligned = ce.align_series(prices)
    assert aligned == {}


# ─────────────────────────────────────────────────────────────────────────────
# compute_correlation_matrix — top-level
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def synthetic_perfectly_correlated():
    """Two synthetic price series moving in lockstep."""
    return {
        "X": [(f"2026-01-{i:02d}", 100.0 * (1.01 ** i)) for i in range(1, 31)],
        "Y": [(f"2026-01-{i:02d}", 50.0 * (1.01 ** i)) for i in range(1, 31)],
    }


@pytest.fixture
def synthetic_anti_correlated():
    """Two series whose daily returns are exact negatives of each other."""
    n_days = 30
    # Alternating returns to ensure non-zero variance
    up_returns = [(-1) ** i * 0.01 + 0.005 for i in range(n_days)]
    up_prices = [100.0]
    down_prices = [100.0]
    for r in up_returns:
        up_prices.append(up_prices[-1] * (1 + r))
        down_prices.append(down_prices[-1] * (1 - r))
    return {
        "UP":   [(f"2026-01-{i + 1:02d}", p) for i, p in enumerate(up_prices)],
        "DOWN": [(f"2026-01-{i + 1:02d}", p) for i, p in enumerate(down_prices)],
    }


def test_matrix_perfect_correlation(synthetic_perfectly_correlated):
    r = ce.compute_correlation_matrix(synthetic_perfectly_correlated, window_days=30)
    assert r["success"]
    assert r["matrix"][0][1] == pytest.approx(1.0)
    assert r["matrix"][1][0] == pytest.approx(1.0)


def test_matrix_perfect_anti_correlation(synthetic_anti_correlated):
    r = ce.compute_correlation_matrix(synthetic_anti_correlated, window_days=30)
    assert r["success"]
    assert r["matrix"][0][1] == pytest.approx(-1.0)


def test_matrix_diagonal_is_one(synthetic_perfectly_correlated):
    r = ce.compute_correlation_matrix(synthetic_perfectly_correlated, window_days=30)
    for i in range(len(r["symbols"])):
        assert r["matrix"][i][i] == 1.0


def test_matrix_is_symmetric():
    """Matrix[i][j] == Matrix[j][i]."""
    prices = {
        "A": [(f"2026-01-{i:02d}", 100 + i * (-1) ** i) for i in range(1, 21)],
        "B": [(f"2026-01-{i:02d}", 50 + i * 0.5)        for i in range(1, 21)],
        "C": [(f"2026-01-{i:02d}", 200 - i * 0.7)       for i in range(1, 21)],
    }
    r = ce.compute_correlation_matrix(prices, window_days=20)
    m = r["matrix"]
    n = len(m)
    for i in range(n):
        for j in range(n):
            assert m[i][j] == m[j][i], f"asymmetric at ({i},{j})"


def test_matrix_single_asset():
    """Single-asset portfolio yields a trivial 1×1 identity matrix."""
    prices = {"X": [(f"2026-01-{i:02d}", 100.0) for i in range(1, 31)]}
    r = ce.compute_correlation_matrix(prices, window_days=30)
    assert r["success"]
    assert r["matrix"] == [[1.0]]


def test_matrix_empty_portfolio():
    r = ce.compute_correlation_matrix({}, window_days=30)
    assert r["success"] is False


def test_matrix_insufficient_overlap():
    """Three symbols, no common dates → success=False."""
    prices = {
        "A": [("2026-01-01", 100)],
        "B": [("2026-02-01", 50)],
        "C": [("2026-03-01", 25)],
    }
    r = ce.compute_correlation_matrix(prices, window_days=30)
    assert r["success"] is False


def test_matrix_diagnostics_highest_pair():
    """Confirm highest-pair diagnostic identifies the most correlated pair."""
    n_days = 30
    base = [100 * (1.01 ** i) for i in range(1, n_days + 1)]
    prices = {
        "BTC":  [(f"2026-01-{i:02d}", base[i - 1]) for i in range(1, n_days + 1)],
        "ETH":  [(f"2026-01-{i:02d}", base[i - 1] * 0.5) for i in range(1, n_days + 1)],
        "Gold": [(f"2026-01-{i:02d}", 1000 + i) for i in range(1, n_days + 1)],
    }
    r = ce.compute_correlation_matrix(prices, window_days=n_days)
    assert r["success"]
    hp = r["diagnostics"]["highest_pair"]
    assert {hp["a"], hp["b"]} == {"BTC", "ETH"}
    assert hp["corr"] == pytest.approx(1.0, abs=0.001)


def test_matrix_disclosure_text_present():
    """Compliance: disclosure text must include 'not a forecast' framing."""
    prices = {"A": [(f"2026-01-{i:02d}", 100 + i) for i in range(1, 21)]}
    r = ce.compute_correlation_matrix(prices, window_days=180)
    text = r["disclosure_text"].lower()
    assert "not a forecast" in text or "not forecast" in text
    assert "not investment advice" in text


def test_matrix_n_observations_matches():
    """n_observations = aligned_close_count - 1 (since returns lose one point)."""
    n_days = 50
    prices = {
        "A": [(f"2026-01-{i:02d}", 100 + i) for i in range(1, n_days + 1)],
        "B": [(f"2026-01-{i:02d}", 200 - i) for i in range(1, n_days + 1)],
    }
    r = ce.compute_correlation_matrix(prices, window_days=n_days)
    assert r["n_observations"] == n_days - 1
