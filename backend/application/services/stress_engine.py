"""
Stress Engine — Historical Crisis Replay & Proxy Stress Modeling.

Public surface:
    apply_module(portfolio, module_name, scenario_name) -> StressResult
    list_modules() -> List[str]
    list_scenarios(module_name) -> List[ScenarioSummary]

Modules:
    historical_replay   — 5 historical crises (GFC, COVID, Flash Crash, Fed Shock, Liquidity)
    market_shock        — generic broad-market drop magnitudes (-10/-20/-30/-40)
    rate_shock          — yield-curve shifts (+50bp/+100bp/+200bp/-100bp)
    liquidity_shock     — credit spread widening / dollar funding
    black_swan_proxy    — synthetic compound tail events

Compliance:
    Output text is strictly observational.
    The engine never recommends buy/sell/hold/allocation/rebalance actions.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, asdict, field
from pathlib import Path
from typing import Any, Dict, List, Optional

CONFIG_DIR = Path(__file__).parent / "stress_configs"

VALID_MODULES = (
    "historical_replay",
    "market_shock",
    "rate_shock",
    "liquidity_shock",
    "black_swan_proxy",
    "factor_shock",
)

# ─────────────────────────────────────────────────────────────────────────────
# Data classes
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class AssetBreakdownRow:
    symbol: str
    name: str
    weight_pct: float
    asset_class: str
    shock_pct: float
    contribution_pct: float
    proxy_used: bool
    proxy_note: Optional[str] = None
    # Per-factor decomposition of the asset's shock_pct (only populated for factor_shock module).
    # Keys are factor names (Growth, Value, Quality, ...), values are percentage contributions.
    factor_contributions: Optional[Dict[str, float]] = None
    # Whether per-symbol loadings were used (vs falling back to per-class). Only meaningful for factor_shock.
    factor_loading_source: Optional[str] = None  # "per_symbol" | "per_class" | None


@dataclass
class StressResult:
    module: str
    scenario_id: str
    scenario_name: str
    description: str
    period: Optional[str]
    duration_label: Optional[str]

    # Core numerical output
    portfolio_drawdown_pct: float
    per_asset_breakdown: List[AssetBreakdownRow]

    # Derived narrative (observational only — no advice)
    main_damage_driver: str
    buffer_contributor: str
    most_sensitive_class: str

    # Provenance / disclosure
    source_type: str           # "replay" | "replay_with_proxy" | "synthetic" | "fallback"
    disclosure_label: str      # short tag for UI badge
    disclosure_text: str       # longer compliance footer
    proxy_used_classes: List[str] = field(default_factory=list)
    fallback_used_classes: List[str] = field(default_factory=list)


@dataclass
class ScenarioSummary:
    id: str
    name: str
    description: str
    period: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# Config loading (cached at import time)
# ─────────────────────────────────────────────────────────────────────────────

def _load_json(filename: str) -> Dict[str, Any]:
    return json.loads((CONFIG_DIR / filename).read_text(encoding="utf-8"))


_ASSET_CLASSES = _load_json("asset_classes.json")
_PROXY_RULES = _load_json("proxy_rules.json")
_FACTOR_LOADINGS = _load_json("factor_loadings.json")
_MODULES = {
    "historical_replay": _load_json("historical_replay.json"),
    "market_shock":      _load_json("market_shock.json"),
    "rate_shock":        _load_json("rate_shock.json"),
    "liquidity_shock":   _load_json("liquidity_shock.json"),
    "black_swan_proxy":  _load_json("black_swan_proxy.json"),
    "factor_shock":      _load_json("factor_shock.json"),
}


# ─────────────────────────────────────────────────────────────────────────────
# Asset → asset_class classification
# ─────────────────────────────────────────────────────────────────────────────

def classify_asset(symbol: str, category: str) -> str:
    """Map a portfolio asset to one of the 12 asset_classes."""
    rules = _ASSET_CLASSES["classification_rules"]
    by_symbol = rules["by_symbol"]
    fallback = rules["by_category_fallback"]
    s = (symbol or "").strip()
    if s in by_symbol:
        return by_symbol[s]
    if s.upper() in by_symbol:
        return by_symbol[s.upper()]
    return fallback.get((category or "").lower(), "us_equity_broad")


# ─────────────────────────────────────────────────────────────────────────────
# Shock resolution per asset_class
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_shock_for_class(
    asset_class: str,
    scenario_id: str,
    scenario: Dict[str, Any],
) -> tuple[float, bool, Optional[str], bool]:
    """
    Returns (shock_pct, proxy_used, proxy_note, fallback_used).

    Resolution order:
      1. Direct shock entry in scenario.shocks
      2. proxy_rules.json entry keyed by "<class>::<scenario_id>"
      3. proxy_rules.json entry keyed by "<class>" (class-wide rule)
      4. fallback shock (broad-market assumption)
    """
    shocks = scenario.get("shocks", {})
    if asset_class in shocks:
        return shocks[asset_class], False, None, False

    # Try scenario-specific proxy
    keyed = f"{asset_class}::{scenario_id}"
    rule = _PROXY_RULES["rules"].get(keyed) or _PROXY_RULES["rules"].get(asset_class)
    if rule:
        proxy_class = rule["proxy_class"]
        leverage = float(rule.get("leverage_factor", 1.0))
        base = shocks.get(proxy_class)
        if base is not None:
            return (
                base * leverage,
                True,
                f"{rule['rationale']} Base shock from {proxy_class} ({base:+.1f}%) × {leverage}.",
                False,
            )

    # Final fallback
    fallback_pct = float(_PROXY_RULES["fallback"]["shock_pct"])
    return (
        fallback_pct,
        False,
        _PROXY_RULES["fallback"]["label"],
        True,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Factor-based shock resolution (used by `factor_shock` module)
# ─────────────────────────────────────────────────────────────────────────────

def _resolve_shock_via_factors(
    symbol: str,
    asset_class: str,
    scenario_id: str,
) -> tuple[float, Dict[str, float], str]:
    """
    Compute an asset's modeled shock by linear factor decomposition.

    Lookup order for factor loadings:
      1. per_symbol[<SYMBOL>]            -> "per_symbol" source
      2. loadings[<asset_class>]         -> "per_class" source
      3. {} (no loadings) → asset_shock = 0, source "missing"

    Returns:
        (asset_shock_pct, factor_contributions_dict, source_label)
    """
    s = (symbol or "").strip().upper()
    per_symbol = _FACTOR_LOADINGS.get("per_symbol", {})
    per_class = _FACTOR_LOADINGS.get("loadings", {})

    if s in per_symbol:
        loadings = per_symbol[s]
        source = "per_symbol"
    elif asset_class in per_class:
        loadings = per_class[asset_class]
        source = "per_class"
    else:
        loadings = {}
        source = "missing"

    factor_shocks = _MODULES["factor_shock"]["scenarios"][scenario_id]["factor_shocks"]

    total = 0.0
    contributions: Dict[str, float] = {}
    for factor, shock in factor_shocks.items():
        loading = float(loadings.get(factor, 0.0))
        contrib = loading * float(shock)
        contributions[factor] = round(contrib, 2)
        total += contrib

    return round(total, 2), contributions, source


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def list_modules() -> List[str]:
    return list(VALID_MODULES)


def list_scenarios(module_name: str) -> List[ScenarioSummary]:
    if module_name not in _MODULES:
        raise ValueError(f"Unknown module: {module_name}")
    cfg = _MODULES[module_name]
    return [
        ScenarioSummary(
            id=sc_id,
            name=sc["name"],
            description=sc.get("description", ""),
            period=sc.get("period"),
        )
        for sc_id, sc in cfg["scenarios"].items()
    ]


def apply_module(
    portfolio: List[Dict[str, Any]],
    module_name: str,
    scenario_id: str,
) -> StressResult:
    """
    Apply a single scenario from a single module to the portfolio.

    `portfolio` is a list of dicts with keys: symbol, name (optional),
    category, weight (percent number, e.g. 25 for 25%).
    """
    if module_name not in _MODULES:
        raise ValueError(f"Unknown module: {module_name}")
    cfg = _MODULES[module_name]
    scenarios = cfg["scenarios"]
    if scenario_id not in scenarios:
        raise ValueError(f"Unknown scenario in module {module_name}: {scenario_id}")
    scenario = scenarios[scenario_id]

    # Normalize weights: if weights don't sum to 100, scale them.
    raw_weights = [float(a.get("weight", 0)) for a in portfolio]
    total_weight = sum(raw_weights) or 100.0
    weights_pct = [w / total_weight * 100.0 for w in raw_weights]

    breakdown: List[AssetBreakdownRow] = []
    proxy_classes: set[str] = set()
    fallback_classes: set[str] = set()

    is_factor_module = (
        cfg.get("_meta", {}).get("module_kind") == "factor"
        or module_name == "factor_shock"
    )

    for asset, w_pct in zip(portfolio, weights_pct):
        cls = classify_asset(asset.get("symbol", ""), asset.get("category", ""))

        if is_factor_module:
            shock_pct, factor_contribs, factor_source = _resolve_shock_via_factors(
                asset.get("symbol", ""), cls, scenario_id,
            )
            proxy_used = False
            proxy_note = None
            fallback_used = (factor_source == "missing")
        else:
            shock_pct, proxy_used, proxy_note, fallback_used = _resolve_shock_for_class(
                cls, scenario_id, scenario,
            )
            factor_contribs = None
            factor_source = None

        contribution = w_pct / 100.0 * shock_pct  # weight as fraction × shock %
        if proxy_used:
            proxy_classes.add(cls)
        if fallback_used and not is_factor_module:
            fallback_classes.add(cls)
        breakdown.append(AssetBreakdownRow(
            symbol=asset.get("symbol", "?"),
            name=asset.get("name") or asset.get("symbol") or "?",
            weight_pct=round(w_pct, 2),
            asset_class=cls,
            shock_pct=round(shock_pct, 2),
            contribution_pct=round(contribution, 2),
            proxy_used=proxy_used or fallback_used,
            proxy_note=proxy_note,
            factor_contributions=factor_contribs,
            factor_loading_source=factor_source,
        ))

    portfolio_drawdown = round(sum(r.contribution_pct for r in breakdown), 2)

    # Derive narrative (observational only)
    sorted_by_negative = sorted(breakdown, key=lambda r: r.contribution_pct)
    sorted_by_positive = sorted(breakdown, key=lambda r: -r.contribution_pct)
    sorted_by_magnitude = sorted(breakdown, key=lambda r: abs(r.shock_pct), reverse=True)

    if sorted_by_negative and sorted_by_negative[0].contribution_pct < 0:
        worst = sorted_by_negative[0]
        main_damage_driver = (
            f"{worst.name} ({worst.symbol}, {worst.asset_class}) contributes the largest "
            f"modeled drawdown ({worst.contribution_pct:+.1f}pp of total)."
        )
    else:
        main_damage_driver = "No asset shows a meaningful negative contribution under this scenario."

    if sorted_by_positive and sorted_by_positive[0].contribution_pct > 0:
        buf = sorted_by_positive[0]
        buffer_contributor = (
            f"{buf.name} ({buf.symbol}, {buf.asset_class}) acts as a partial buffer "
            f"({buf.contribution_pct:+.1f}pp positive contribution)."
        )
    else:
        buffer_contributor = "No asset records a positive contribution under this scenario."

    if sorted_by_magnitude:
        sens = sorted_by_magnitude[0]
        most_sensitive_class = (
            f"{sens.asset_class} shows the largest absolute modeled shock "
            f"({sens.shock_pct:+.1f}%)."
        )
    else:
        most_sensitive_class = "No sensitivity data available."

    # Provenance / disclosure
    is_synthetic = bool(scenario.get("is_synthetic"))
    if is_factor_module:
        source_type = "factor"
        disclosure_label = "Factor decomposition"
    elif is_synthetic:
        source_type = "synthetic"
        disclosure_label = "Proxy approximation"
    elif proxy_classes:
        source_type = "replay_with_proxy"
        disclosure_label = "Historical replay with proxy"
    elif fallback_classes:
        source_type = "fallback"
        disclosure_label = "Replay with broad-market fallback"
    else:
        source_type = "replay"
        disclosure_label = "Historical replay"

    disclosure_text = _build_disclosure_text(
        source_type, sorted(proxy_classes), sorted(fallback_classes),
    )

    return StressResult(
        module=module_name,
        scenario_id=scenario_id,
        scenario_name=scenario["name"],
        description=scenario.get("description", ""),
        period=scenario.get("period"),
        duration_label=scenario.get("duration_label"),
        portfolio_drawdown_pct=portfolio_drawdown,
        per_asset_breakdown=breakdown,
        main_damage_driver=main_damage_driver,
        buffer_contributor=buffer_contributor,
        most_sensitive_class=most_sensitive_class,
        source_type=source_type,
        disclosure_label=disclosure_label,
        disclosure_text=disclosure_text,
        proxy_used_classes=sorted(proxy_classes),
        fallback_used_classes=sorted(fallback_classes),
    )


def _build_disclosure_text(
    source_type: str,
    proxy_classes: List[str],
    fallback_classes: List[str],
) -> str:
    parts = [
        "Stress test outputs are risk-exposure simulations, not forecasts and not investment advice.",
    ]
    if source_type == "synthetic":
        parts.append("This scenario is a synthetic compound stress, not a replay of any single historical event.")
    elif source_type == "replay_with_proxy":
        parts.append(
            "Some asset classes were proxy-modeled because they did not exist (or had de minimis market) "
            f"during the historical period: {', '.join(proxy_classes)}. Output is partly an approximation."
        )
    elif source_type == "fallback":
        parts.append(
            "A conservative broad-market downside assumption was applied for asset classes without scenario data: "
            f"{', '.join(fallback_classes)}."
        )
    elif source_type == "factor":
        parts.append(
            "Factor shock simulation decomposes asset returns into linear exposures to common risk factors "
            "(Growth, Value, Quality, Momentum, Volatility, Real Rate, Inflation, Credit Spread). "
            "Loadings are heuristic estimates based on representative ETF holdings and academic literature, "
            "not regression-fitted to your specific portfolio. This is an approximation framework, "
            "not a precise risk forecast."
        )
    return " ".join(parts)


def result_to_dict(result: StressResult) -> Dict[str, Any]:
    """Convert StressResult to a JSON-serializable dict for API responses."""
    d = asdict(result)
    return d


# ─────────────────────────────────────────────────────────────────────────────
# Reverse Stress Testing — find which scenarios breach a user's loss threshold
# ─────────────────────────────────────────────────────────────────────────────

def find_breach_scenarios(
    portfolio: List[Dict[str, Any]],
    threshold_pct: float,
) -> Dict[str, Any]:
    """
    Reverse stress: scan every scenario across every module. Return scenarios
    whose modeled portfolio drawdown is at or below the user's loss threshold.

    Args:
        portfolio: list of asset dicts (symbol, name, category, weight)
        threshold_pct: a NEGATIVE number, e.g., -25.0 means "lose 25% or more"

    Returns:
        {
          "total_scenarios": int,
          "breach_count": int,
          "breaches": list[dict] sorted by drawdown ascending (most severe first)
        }

    Compliance: this surfaces existing scenario outputs, ranked by severity. It
    does NOT estimate likelihood, recommend action, or constitute investment advice.
    """
    breaches: List[Dict[str, Any]] = []
    total_scanned = 0
    for module_name in list_modules():
        for scenario in list_scenarios(module_name):
            total_scanned += 1
            result = apply_module(portfolio, module_name, scenario.id)
            if result.portfolio_drawdown_pct <= threshold_pct:
                breaches.append({
                    "module": module_name,
                    "scenario_id": scenario.id,
                    "scenario_name": scenario.name,
                    "scenario_description": scenario.description,
                    "drawdown_pct": result.portfolio_drawdown_pct,
                    "main_damage_driver": result.main_damage_driver,
                    "buffer_contributor": result.buffer_contributor,
                    "source_type": result.source_type,
                    "disclosure_label": result.disclosure_label,
                    "period": result.period,
                })
    breaches.sort(key=lambda x: x["drawdown_pct"])  # most negative first
    return {
        "total_scenarios": total_scanned,
        "breach_count": len(breaches),
        "breaches": breaches,
    }
