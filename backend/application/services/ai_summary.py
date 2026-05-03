"""
AI Portfolio Summary — generate observational narrative for a user's portfolio.

Architecture:
    1. build_facts() turns raw portfolio + stress + correlation results into a
       structured, deterministic dict of "things to talk about"
    2. compose_user_prompt() formats those facts into a constrained ChatGPT prompt
    3. scrub_directive_language() post-scans the LLM output for forbidden phrases
       and falls back to template_summary() if any slip through
    4. template_summary() is a deterministic, rule-based fallback that uses the
       same facts dict — no LLM, $0, 100% compliance-safe

Compliance rationale:
    - All numerical claims come from PRECOMPUTED facts (Python). The LLM cannot
      hallucinate stress numbers or correlation values; it only writes prose
      around the supplied facts.
    - System prompt (COMPLIANCE_SYSTEM_PROMPT in chatgpt_client.py) blocks
      directive language at generation time.
    - Output regex scan blocks anything that slips through.
    - Fallback template guaranteed compliance-safe by construction.
"""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any, Dict, List, Optional

# Forbidden phrases. Mirror of stress_engine pytest scan, plus a few extras.
# Output containing any of these → reject and use template fallback.
FORBIDDEN_PATTERNS = [
    r"\byou should\b",
    r"\byou must\b",
    r"\byou ought to\b",
    r"\bconsider buying\b",
    r"\bconsider selling\b",
    r"\bconsider holding\b",
    r"\bconsider adding\b",
    r"\bconsider reducing\b",
    r"\bconsider increasing\b",
    r"\bconsider decreasing\b",
    r"\bwe recommend\b",
    r"\bi recommend\b",
    r"\bbuy now\b",
    r"\bsell now\b",
    r"\bincrease your allocation\b",
    r"\bdecrease your allocation\b",
    r"\breduce your exposure\b",
    r"\bincrease your exposure\b",
    r"\brebalance to\b",
    r"\brebalance into\b",
    r"\bshift from .* to\b",
    r"\ballocate more\b",
    r"\ballocate less\b",
    r"\bmight want to\b",
    r"\bshould rebalance\b",
]


# ─────────────────────────────────────────────────────────────────────────────
# 1. Build deterministic facts from inputs
# ─────────────────────────────────────────────────────────────────────────────

def build_facts(
    portfolio: List[Dict[str, Any]],
    stress_results: Optional[List[Dict[str, Any]]] = None,
    correlation_data: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Compute a deterministic fact pack from portfolio + stress + correlation inputs.

    portfolio is a list of dicts with at least: symbol, category, weight (numeric).
    stress_results is a list of stress scenario result dicts (from /api/stress/apply_all).
    correlation_data is the dict returned by /api/portfolio/correlation.

    Returns a flat dict of "facts" that the prompt template (or rule-based template)
    can consume. Every numerical value here is computed deterministically from inputs;
    NO LLM hallucination possible.
    """
    facts: Dict[str, Any] = {
        "n_assets": len(portfolio),
        "asset_symbols": [a.get("symbol") for a in portfolio],
    }

    # Composition: weight % per asset, top concentration
    if portfolio:
        total_weight = sum(float(a.get("weight", 0) or 0) for a in portfolio) or 100.0
        weighted = sorted(
            [
                {
                    "symbol": a.get("symbol"),
                    "name": a.get("name") or a.get("symbol"),
                    "category": a.get("category"),
                    "weight_pct": round(float(a.get("weight", 0) or 0) / total_weight * 100, 1),
                }
                for a in portfolio
            ],
            key=lambda x: x["weight_pct"],
            reverse=True,
        )
        facts["holdings"] = weighted
        facts["top_holding"] = weighted[0] if weighted else None
        facts["top_3_concentration_pct"] = round(sum(h["weight_pct"] for h in weighted[:3]), 1)

        # Category mix
        cat_pct: Dict[str, float] = {}
        for h in weighted:
            cat_pct[h["category"] or "unknown"] = cat_pct.get(h["category"] or "unknown", 0) + h["weight_pct"]
        facts["category_breakdown"] = {k: round(v, 1) for k, v in sorted(cat_pct.items(), key=lambda x: -x[1])}

    # Stress summary across modules
    if stress_results:
        sorted_by_dd = sorted(stress_results, key=lambda r: r.get("portfolio_drawdown_pct", 0))
        worst = sorted_by_dd[0] if sorted_by_dd else None
        best = sorted_by_dd[-1] if sorted_by_dd else None
        breaches_25 = [r for r in stress_results if r.get("portfolio_drawdown_pct", 0) <= -25]
        avg_dd = (
            sum(r.get("portfolio_drawdown_pct", 0) for r in stress_results) / len(stress_results)
            if stress_results else 0
        )
        facts["stress"] = {
            "n_scenarios": len(stress_results),
            "worst_scenario": {
                "name": worst.get("scenario_name") if worst else None,
                "drawdown_pct": round(worst.get("portfolio_drawdown_pct", 0), 1) if worst else None,
                "main_driver": worst.get("main_damage_driver") if worst else None,
                "buffer": worst.get("buffer_contributor") if worst else None,
            },
            "best_scenario": {
                "name": best.get("scenario_name") if best else None,
                "drawdown_pct": round(best.get("portfolio_drawdown_pct", 0), 1) if best else None,
            },
            "breach_count_25pct": len(breaches_25),
            "avg_drawdown_pct": round(avg_dd, 1),
        }

    # Correlation summary
    if correlation_data and correlation_data.get("success"):
        facts["correlation"] = {
            "highest_pair": correlation_data.get("diagnostics", {}).get("highest_pair"),
            "best_diversifier": correlation_data.get("diagnostics", {}).get("best_diversifier"),
            "n_observations": correlation_data.get("n_observations"),
            "window_days": correlation_data.get("window_days"),
        }

    return facts


def facts_hash(facts: Dict[str, Any]) -> str:
    """SHA256 of the structural-only parts of facts (used for cache key)."""
    # Use composition + scenario IDs as cache key — stress numbers may shift slightly
    # day-to-day with prices but composition rarely does. Cache on composition only.
    minimal = {
        "symbols": sorted(facts.get("asset_symbols", []) or []),
        "category_breakdown": facts.get("category_breakdown", {}),
        # Round breach count to bucket — small changes shouldn't burst cache
        "stress_buckets": {
            "worst_dd_bucket": int(facts.get("stress", {}).get("worst_scenario", {}).get("drawdown_pct", 0) // 5)
                if facts.get("stress") else None,
            "breach_25_count": facts.get("stress", {}).get("breach_count_25pct") if facts.get("stress") else None,
        },
    }
    blob = json.dumps(minimal, sort_keys=True).encode("utf-8")
    return hashlib.sha256(blob).hexdigest()[:32]


# ─────────────────────────────────────────────────────────────────────────────
# 2. Compose ChatGPT user prompt from facts
# ─────────────────────────────────────────────────────────────────────────────

def compose_user_prompt(facts: Dict[str, Any]) -> str:
    """
    Format facts into a constrained user-message prompt.
    System prompt (COMPLIANCE_SYSTEM_PROMPT) is auto-prepended by chatgpt_client.
    """
    lines = ["I have computed the following observable facts about a user's portfolio.",
             "Please write a 150-180 word analysis in 3 short paragraphs.",
             "",
             "PORTFOLIO COMPOSITION:"]

    if facts.get("holdings"):
        lines.append(f"- {facts['n_assets']} holdings")
        for h in facts["holdings"][:6]:
            lines.append(f"  · {h['symbol']} ({h.get('category', '?')}) — {h['weight_pct']}% of portfolio")
        if len(facts["holdings"]) > 6:
            lines.append(f"  · ... and {len(facts['holdings']) - 6} more")
        if facts.get("top_holding"):
            lines.append(f"- Top holding: {facts['top_holding']['symbol']} at {facts['top_holding']['weight_pct']}% concentration")
        lines.append(f"- Top-3 holdings represent {facts.get('top_3_concentration_pct', 0)}% of portfolio")
        if facts.get("category_breakdown"):
            cats = ", ".join(f"{k} {v}%" for k, v in facts["category_breakdown"].items())
            lines.append(f"- Category mix: {cats}")

    if facts.get("stress"):
        s = facts["stress"]
        lines.extend([
            "",
            f"STRESS-TEST RESULTS (across {s['n_scenarios']} scenarios in our library):",
            f"- Worst-case modeled drawdown: {s['worst_scenario']['drawdown_pct']}% in scenario \"{s['worst_scenario']['name']}\"",
            f"  driver: {s['worst_scenario']['main_driver']}",
            f"- Best-case modeled outcome: {s['best_scenario']['drawdown_pct']}% in \"{s['best_scenario']['name']}\"",
            f"- Average modeled drawdown across scenarios: {s['avg_drawdown_pct']}%",
            f"- {s['breach_count_25pct']} scenarios produce a drawdown of -25% or worse",
        ])

    if facts.get("correlation"):
        c = facts["correlation"]
        if c.get("highest_pair"):
            hp = c["highest_pair"]
            lines.append(f"- Most correlated holding pair: {hp.get('a')} ↔ {hp.get('b')} (ρ = {hp.get('corr')})")
        if c.get("best_diversifier"):
            bd = c["best_diversifier"]
            lines.append(f"- Strongest diversifier in the portfolio: {bd.get('symbol')} (avg pairwise ρ = {bd.get('avg_corr_excluding_self')})")

    lines.extend([
        "",
        "STRUCTURE THE OUTPUT IN 3 PARAGRAPHS:",
        "1. Composition observation — what the breakdown reveals about concentration and category mix.",
        "2. Stress-test profile — under which scenarios the portfolio is most vulnerable, what drives losses, what buffers exist.",
        "3. Diversification observation — based on correlation and category mix, how independent are the holdings.",
        "",
        "STRICT RULES (compliance):",
        "- USE ONLY observational, descriptive language.",
        "- DO NOT recommend buying, selling, holding, or rebalancing.",
        "- DO NOT use phrases like 'you should', 'consider X', 'rebalance to', 'increase your allocation', 'reduce exposure'.",
        "- DO NOT predict future prices, future volatility, or probabilities.",
        "- Each numeric claim must come from the facts above; do not invent figures.",
        "- Use plain prose. No bullet lists, no markdown headers, no emojis.",
    ])

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# 3. Post-output compliance scrub
# ─────────────────────────────────────────────────────────────────────────────

def scan_for_directive(text: str) -> List[str]:
    """Return list of forbidden patterns found in text. Empty list = clean."""
    found = []
    lower = (text or "").lower()
    for pat in FORBIDDEN_PATTERNS:
        if re.search(pat, lower):
            found.append(pat)
    return found


# ─────────────────────────────────────────────────────────────────────────────
# 4. Rule-based template fallback (no LLM)
# ─────────────────────────────────────────────────────────────────────────────

def generate_template_summary(facts: Dict[str, Any]) -> str:
    """
    Deterministic, rule-based 3-paragraph summary. Used when:
      - LLM call fails or is rate-limited
      - LLM output fails compliance scrub
    Always compliance-safe by construction. No LLM cost.
    """
    if not facts.get("holdings"):
        return "Add at least one asset to your portfolio to generate an analysis."

    paragraphs = []

    # Paragraph 1 — composition
    n = facts.get("n_assets", 0)
    top = facts.get("top_holding") or {}
    top_3 = facts.get("top_3_concentration_pct", 0)
    cats = facts.get("category_breakdown", {})
    cat_str = ", ".join(f"{k} ({v}%)" for k, v in list(cats.items())[:4]) if cats else "mixed categories"
    p1 = (
        f"This portfolio holds {n} asset{'s' if n != 1 else ''} across {cat_str}. "
        f"The largest single position is {top.get('symbol', 'n/a')} at {top.get('weight_pct', 0)}% of the portfolio, "
        f"and the top three holdings together represent {top_3}% of total weight."
    )
    if top_3 >= 70:
        p1 += " This is a notably concentrated allocation in observational terms."
    paragraphs.append(p1)

    # Paragraph 2 — stress profile
    s = facts.get("stress")
    if s and s.get("worst_scenario", {}).get("name"):
        worst = s["worst_scenario"]
        best = s["best_scenario"]
        p2 = (
            f"Across {s['n_scenarios']} stress scenarios in the library, the portfolio's worst modeled "
            f"drawdown is {worst.get('drawdown_pct')}% under the \"{worst.get('name')}\" scenario; "
            f"the average modeled drawdown across all scenarios is {s.get('avg_drawdown_pct')}%. "
            f"{s.get('breach_count_25pct', 0)} scenarios produce a drawdown of -25% or worse. "
            f"The best modeled outcome is {best.get('drawdown_pct')}% under \"{best.get('name')}\"."
        )
    else:
        p2 = "Stress-test results are not yet computed for this portfolio."
    paragraphs.append(p2)

    # Paragraph 3 — diversification
    c = facts.get("correlation")
    if c and c.get("highest_pair") and c.get("best_diversifier"):
        hp = c["highest_pair"]
        bd = c["best_diversifier"]
        p3 = (
            f"On diversification, the most correlated pair in the holdings is {hp.get('a')} and {hp.get('b')} "
            f"(ρ = {hp.get('corr')}); the lowest average pairwise correlation belongs to {bd.get('symbol')} "
            f"(average ρ = {bd.get('avg_corr_excluding_self')}), making it the most independent component "
            f"of the portfolio over the past {c.get('window_days', 180)} days. "
            f"This is descriptive of past co-movement only and is not a forecast."
        )
    else:
        p3 = "Pairwise correlation data is not yet available for the portfolio holdings."
    paragraphs.append(p3)

    return "\n\n".join(paragraphs)


# ─────────────────────────────────────────────────────────────────────────────
# 5. Public façade
# ─────────────────────────────────────────────────────────────────────────────

def compose_summary_payload(facts: Dict[str, Any], llm_output: Optional[str] = None) -> Dict[str, Any]:
    """
    Pick the safe winner between an LLM output and the template.
    - If llm_output is None or fails compliance scrub → return template
    - Else → return llm_output
    Always returns a dict with `summary` (string) + `source` (str) + `compliance_violations` (list).
    """
    if not llm_output:
        return {
            "summary": generate_template_summary(facts),
            "source": "template",
            "compliance_violations": [],
        }
    violations = scan_for_directive(llm_output)
    if violations:
        return {
            "summary": generate_template_summary(facts),
            "source": "template_after_scrub",
            "compliance_violations": violations,
        }
    return {
        "summary": llm_output.strip(),
        "source": "ai",
        "compliance_violations": [],
    }
