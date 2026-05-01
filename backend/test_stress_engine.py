"""
Tests for application.services.stress_engine.

Run from backend/:
    python -m pytest test_stress_engine.py -v
"""

import re
import pytest

from application.services import stress_engine as se


# ─────────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_portfolio():
    """Mirrors PortfolioPage.MOCK_ASSETS — same 5 assets, same weights."""
    return [
        {"symbol": "BTC",  "name": "Bitcoin",        "category": "crypto",  "weight": 25},
        {"symbol": "AAPL", "name": "Apple Inc.",     "category": "stock",   "weight": 20},
        {"symbol": "Gold", "name": "Gold",           "category": "futures", "weight": 25},
        {"symbol": "ETH",  "name": "Ethereum",       "category": "crypto",  "weight": 15},
        {"symbol": "MSFT", "name": "Microsoft Corp.","category": "stock",   "weight": 15},
    ]


# ─────────────────────────────────────────────────────────────────────────────
# Module / scenario discovery
# ─────────────────────────────────────────────────────────────────────────────

def test_list_modules_returns_six_modules():
    assert se.list_modules() == [
        "historical_replay",
        "market_shock",
        "rate_shock",
        "liquidity_shock",
        "black_swan_proxy",
        "factor_shock",
    ]


def test_historical_replay_has_five_scenarios():
    scenarios = se.list_scenarios("historical_replay")
    ids = {s.id for s in scenarios}
    assert ids == {
        "gfc_2008", "covid_2020", "flash_crash_2010",
        "fed_shock_2022", "liquidity_crisis_2020mar",
    }


def test_unknown_module_raises():
    with pytest.raises(ValueError, match="Unknown module"):
        se.list_scenarios("nonexistent_module")


# ─────────────────────────────────────────────────────────────────────────────
# Asset classification
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("symbol,category,expected", [
    ("BTC", "crypto", "crypto_major"),
    ("ETH", "crypto", "crypto_major"),
    ("DOGE", "crypto", "crypto_alt"),
    ("AAPL", "stock", "us_equity_tech"),
    ("MSFT", "stock", "us_equity_tech"),
    ("JPM", "stock", "us_equity_financial"),
    ("ABBV", "stock", "us_equity_broad"),
    ("Gold", "futures", "precious_metals"),
    ("EUR", "forex", "forex_g10"),
    ("WEIRD", "unknown_category", "us_equity_broad"),
])
def test_classify_asset(symbol, category, expected):
    assert se.classify_asset(symbol, category) == expected


# ─────────────────────────────────────────────────────────────────────────────
# Core math — replay path (no proxy)
# ─────────────────────────────────────────────────────────────────────────────

def test_covid_2020_drawdown_arithmetic(mock_portfolio):
    """
    Manually computed: 25%×-50 + 20%×-30 + 25%×+5 + 15%×-50 + 15%×-30
                     = -12.5 - 6.0 + 1.25 - 7.5 - 4.5 = -29.25
    """
    r = se.apply_module(mock_portfolio, "historical_replay", "covid_2020")
    assert r.portfolio_drawdown_pct == pytest.approx(-29.25, abs=0.01)
    assert r.source_type == "replay"
    assert r.proxy_used_classes == []


def test_covid_2020_per_asset_breakdown(mock_portfolio):
    r = se.apply_module(mock_portfolio, "historical_replay", "covid_2020")
    by_symbol = {row.symbol: row for row in r.per_asset_breakdown}

    assert by_symbol["BTC"].asset_class == "crypto_major"
    assert by_symbol["BTC"].shock_pct == pytest.approx(-50.0)
    assert by_symbol["BTC"].contribution_pct == pytest.approx(-12.5, abs=0.01)
    assert by_symbol["BTC"].proxy_used is False

    assert by_symbol["Gold"].asset_class == "precious_metals"
    assert by_symbol["Gold"].shock_pct == pytest.approx(5.0)
    assert by_symbol["Gold"].contribution_pct == pytest.approx(1.25, abs=0.01)


def test_covid_2020_main_driver_is_btc(mock_portfolio):
    r = se.apply_module(mock_portfolio, "historical_replay", "covid_2020")
    assert "BTC" in r.main_damage_driver
    assert "Gold" in r.buffer_contributor


# ─────────────────────────────────────────────────────────────────────────────
# Proxy path — GFC 2008 (crypto didn't exist)
# ─────────────────────────────────────────────────────────────────────────────

def test_gfc_2008_uses_proxy_for_crypto(mock_portfolio):
    r = se.apply_module(mock_portfolio, "historical_replay", "gfc_2008")
    assert r.source_type == "replay_with_proxy"
    assert "crypto_major" in r.proxy_used_classes

    btc_row = next(row for row in r.per_asset_breakdown if row.symbol == "BTC")
    assert btc_row.proxy_used is True
    assert btc_row.proxy_note is not None
    # proxy: us_equity_tech (-55.6) × 1.5 = -83.4
    assert btc_row.shock_pct == pytest.approx(-83.4, abs=0.01)


def test_gfc_2008_disclosure_mentions_proxy(mock_portfolio):
    r = se.apply_module(mock_portfolio, "historical_replay", "gfc_2008")
    assert "approximation" in r.disclosure_text.lower() or "proxy" in r.disclosure_text.lower()


# ─────────────────────────────────────────────────────────────────────────────
# Fallback path — unknown asset class
# ─────────────────────────────────────────────────────────────────────────────

def test_unknown_asset_class_uses_fallback_or_default():
    """
    A weird asset → us_equity_broad (per by_category_fallback default).
    us_equity_broad has shock data in covid_2020, so no fallback triggered.
    """
    portfolio = [{"symbol": "XYZ", "name": "Mystery", "category": "unknown", "weight": 100}]
    r = se.apply_module(portfolio, "historical_replay", "covid_2020")
    assert r.per_asset_breakdown[0].asset_class == "us_equity_broad"
    assert r.per_asset_breakdown[0].shock_pct == pytest.approx(-34.0)


# ─────────────────────────────────────────────────────────────────────────────
# All scenarios runnable — no exceptions
# ─────────────────────────────────────────────────────────────────────────────

def test_every_scenario_in_every_module_runs(mock_portfolio):
    count = 0
    for module in se.list_modules():
        for sc in se.list_scenarios(module):
            r = se.apply_module(mock_portfolio, module, sc.id)
            assert isinstance(r.portfolio_drawdown_pct, float)
            assert r.scenario_id == sc.id
            count += 1
    # 5 historical + 4 market + 4 rate + 4 liquidity + 4 black_swan + 5 factor_shock = 26
    assert count == 26


# ─────────────────────────────────────────────────────────────────────────────
# Compliance — observational only, no directive language
# ─────────────────────────────────────────────────────────────────────────────

FORBIDDEN_PATTERNS = [
    r"\byou should\b",
    r"\byou must\b",
    r"\bconsider buying\b",
    r"\bconsider selling\b",
    r"\bwe recommend\b",
    r"\bbuy now\b",
    r"\bsell now\b",
    r"\bincrease your allocation\b",
    r"\breduce your exposure\b",
    r"\brebalance to\b",
]


def test_no_directive_language_in_outputs(mock_portfolio):
    """Scan every output text field across all 21 scenarios for forbidden directive phrasing."""
    bad = []
    for module in se.list_modules():
        for sc in se.list_scenarios(module):
            r = se.apply_module(mock_portfolio, module, sc.id)
            text = " ".join([
                r.scenario_name,
                r.description,
                r.main_damage_driver,
                r.buffer_contributor,
                r.most_sensitive_class,
                r.disclosure_label,
                r.disclosure_text,
            ]).lower()
            for pat in FORBIDDEN_PATTERNS:
                if re.search(pat, text):
                    bad.append((module, sc.id, pat))
    assert bad == [], f"Directive phrasing found: {bad}"


def test_disclosure_explicitly_states_not_advice(mock_portfolio):
    r = se.apply_module(mock_portfolio, "historical_replay", "covid_2020")
    assert "not investment advice" in r.disclosure_text.lower()
    assert "not forecast" in r.disclosure_text.lower() or "not a forecast" in r.disclosure_text.lower()


# ─────────────────────────────────────────────────────────────────────────────
# Synthetic source type label
# ─────────────────────────────────────────────────────────────────────────────

def test_black_swan_scenarios_labeled_synthetic(mock_portfolio):
    for sc in se.list_scenarios("black_swan_proxy"):
        r = se.apply_module(mock_portfolio, "black_swan_proxy", sc.id)
        assert r.source_type == "synthetic"
        assert "proxy" in r.disclosure_label.lower() or "approximation" in r.disclosure_label.lower()


# ─────────────────────────────────────────────────────────────────────────────
# Weight normalization — non-100% input
# ─────────────────────────────────────────────────────────────────────────────

def test_weights_normalized_when_not_summing_to_100():
    """If weights sum to e.g. 50, engine should scale up to 100%."""
    portfolio = [
        {"symbol": "AAPL", "name": "Apple",     "category": "stock", "weight": 25},
        {"symbol": "MSFT", "name": "Microsoft", "category": "stock", "weight": 25},
    ]  # sums to 50
    r = se.apply_module(portfolio, "historical_replay", "covid_2020")
    # both us_equity_tech, both should now be 50% effective weight, shock -30%
    # so drawdown should be -30%
    assert r.portfolio_drawdown_pct == pytest.approx(-30.0, abs=0.1)


# ─────────────────────────────────────────────────────────────────────────────
# Result serialization — for API
# ─────────────────────────────────────────────────────────────────────────────

def test_result_to_dict_is_json_serializable(mock_portfolio):
    import json
    r = se.apply_module(mock_portfolio, "historical_replay", "covid_2020")
    d = se.result_to_dict(r)
    json_str = json.dumps(d)  # must not raise
    assert "portfolio_drawdown_pct" in json_str
    assert "per_asset_breakdown" in json_str


# ─────────────────────────────────────────────────────────────────────────────
# Reverse Stress Testing
# ─────────────────────────────────────────────────────────────────────────────

def test_reverse_stress_lenient_threshold_breaches_most(mock_portfolio):
    """Threshold of -1% is so lenient nearly every scenario should breach."""
    result = se.find_breach_scenarios(mock_portfolio, -1.0)
    # 5 historical + 4 market + 4 rate + 4 liquidity + 4 black_swan + 5 factor = 26
    assert result["total_scenarios"] == 26
    # Most scenarios produce > 1% drawdown for this portfolio
    assert result["breach_count"] >= 22


def test_reverse_stress_unrealistic_threshold_breaches_none(mock_portfolio):
    """Threshold of -90% is so extreme nothing in the library reaches it."""
    result = se.find_breach_scenarios(mock_portfolio, -90.0)
    assert result["total_scenarios"] == 26
    assert result["breach_count"] == 0
    assert result["breaches"] == []


def test_reverse_stress_results_sorted_by_severity(mock_portfolio):
    """Breaches must be sorted ascending (most negative first)."""
    result = se.find_breach_scenarios(mock_portfolio, -10.0)
    drawdowns = [b["drawdown_pct"] for b in result["breaches"]]
    assert drawdowns == sorted(drawdowns), "breaches must be sorted by severity"


def test_reverse_stress_at_threshold_25_includes_known_scenarios(mock_portfolio):
    """
    For the 5-asset mock portfolio at threshold=-25%:
    - covid_2020 (-29.25%) MUST breach
    - gfc_2008 (~-46% with proxy) MUST breach
    - mild_correction (~-15%) MUST NOT breach
    """
    result = se.find_breach_scenarios(mock_portfolio, -25.0)
    breach_ids = {b["scenario_id"] for b in result["breaches"]}
    assert "covid_2020" in breach_ids
    assert "gfc_2008" in breach_ids
    assert "mild_correction" not in breach_ids


def test_reverse_stress_breach_includes_all_required_fields(mock_portfolio):
    """Every breach entry must carry the fields the UI needs to render."""
    result = se.find_breach_scenarios(mock_portfolio, -25.0)
    assert result["breach_count"] > 0
    required_fields = {
        "module", "scenario_id", "scenario_name", "scenario_description",
        "drawdown_pct", "main_damage_driver", "buffer_contributor",
        "source_type", "disclosure_label", "period",
    }
    for breach in result["breaches"]:
        assert required_fields.issubset(breach.keys()), \
            f"Breach missing fields: {required_fields - breach.keys()}"


# ─────────────────────────────────────────────────────────────────────────────
# Factor Shock Simulation
# ─────────────────────────────────────────────────────────────────────────────

def test_factor_shock_module_registered():
    assert "factor_shock" in se.list_modules()


def test_factor_shock_has_5_scenarios():
    ids = {s.id for s in se.list_scenarios("factor_shock")}
    assert ids == {"growth_crash", "real_rate_surge", "inflation_surprise",
                   "flight_to_quality", "vol_spike"}


def test_factor_shock_nvda_growth_crash_arithmetic():
    """
    NVDA per-symbol loadings against growth_crash factor_shocks should give -41.8%.
    Hand calc: 0.9*-25 + -0.5*5 + 0.4*3 + 0.4*-10 + -0.7*20 + -0.8*0 + -0.3*0 + -0.4*0
            = -22.5 -2.5 +1.2 -4 -14 +0 +0 +0 = -41.8
    """
    portfolio = [{"symbol": "NVDA", "name": "NVIDIA", "category": "stock", "weight": 100}]
    r = se.apply_module(portfolio, "factor_shock", "growth_crash")
    assert abs(r.portfolio_drawdown_pct - (-41.8)) < 0.01


def test_factor_shock_msft_growth_crash_differs_from_nvda():
    """
    NVDA and MSFT both us_equity_tech, but factor model should differentiate.
    MSFT (Quality 0.9, Volatility -0.2) should be much less hurt than NVDA in growth crash.
    """
    nvda_r = se.apply_module(
        [{"symbol": "NVDA", "name": "NVIDIA", "category": "stock", "weight": 100}],
        "factor_shock", "growth_crash",
    )
    msft_r = se.apply_module(
        [{"symbol": "MSFT", "name": "Microsoft", "category": "stock", "weight": 100}],
        "factor_shock", "growth_crash",
    )
    # NVDA should drop substantially more than MSFT
    assert nvda_r.portfolio_drawdown_pct < msft_r.portfolio_drawdown_pct - 10


def test_factor_shock_jpm_growth_crash_relatively_resilient():
    """JPM (low Growth, high Value, positive RealRate) should not crash hard in growth_crash."""
    portfolio = [{"symbol": "JPM", "name": "JPMorgan", "category": "stock", "weight": 100}]
    r = se.apply_module(portfolio, "factor_shock", "growth_crash")
    # JPM loss should be much smaller than NVDA loss; absolute < 10%
    assert abs(r.portfolio_drawdown_pct) < 10


def test_factor_shock_per_symbol_vs_per_class_fallback():
    """
    AAPL (in per_symbol) should use per_symbol source.
    A made-up symbol like 'XYZQ' should fall back to per_class us_equity_broad.
    """
    aapl_r = se.apply_module(
        [{"symbol": "AAPL", "name": "Apple", "category": "stock", "weight": 100}],
        "factor_shock", "growth_crash",
    )
    xyzq_r = se.apply_module(
        [{"symbol": "XYZQ", "name": "Mystery", "category": "stock", "weight": 100}],
        "factor_shock", "growth_crash",
    )
    assert aapl_r.per_asset_breakdown[0].factor_loading_source == "per_symbol"
    assert xyzq_r.per_asset_breakdown[0].factor_loading_source == "per_class"


def test_factor_shock_contributions_sum_equals_total():
    portfolio = [{"symbol": "BTC", "name": "Bitcoin", "category": "crypto", "weight": 100}]
    r = se.apply_module(portfolio, "factor_shock", "real_rate_surge")
    btc = r.per_asset_breakdown[0]
    contribs_sum = sum(btc.factor_contributions.values())
    assert abs(contribs_sum - btc.shock_pct) < 0.5


def test_factor_shock_disclosure_mentions_heuristic():
    portfolio = [{"symbol": "AAPL", "name": "Apple", "category": "stock", "weight": 100}]
    r = se.apply_module(portfolio, "factor_shock", "growth_crash")
    text = r.disclosure_text.lower()
    assert "heuristic" in text
    assert "approximation" in text
    assert "not investment advice" in text
    assert "not" in text and "forecast" in text


def test_factor_shock_passes_compliance_no_directive_language():
    """Same compliance scan as other modules — observational only."""
    portfolio = [
        {"symbol": "BTC",  "name": "Bitcoin", "category": "crypto", "weight": 50},
        {"symbol": "AAPL", "name": "Apple",   "category": "stock",  "weight": 50},
    ]
    bad = []
    forbidden = [
        r"\byou should\b", r"\byou must\b", r"\bconsider buying\b",
        r"\bconsider selling\b", r"\bwe recommend\b", r"\bbuy now\b",
        r"\bsell now\b", r"\bincrease your allocation\b",
        r"\breduce your exposure\b", r"\brebalance to\b",
    ]
    for sc in se.list_scenarios("factor_shock"):
        r = se.apply_module(portfolio, "factor_shock", sc.id)
        text = " ".join([
            r.scenario_name, r.description, r.main_damage_driver,
            r.buffer_contributor, r.most_sensitive_class,
            r.disclosure_label, r.disclosure_text,
        ]).lower()
        for pat in forbidden:
            if re.search(pat, text):
                bad.append((sc.id, pat))
    assert bad == [], f"Directive phrasing in factor_shock: {bad}"
