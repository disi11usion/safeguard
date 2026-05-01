# Stress Engine Data Sources

This directory contains all configuration data driving the Safeguard stress engine. Every number in these JSON files is documented here — its source, vintage, and methodology — so that compliance reviewers, auditors, and future maintainers can trace any output back to its grounding.

**Status as of 2026-05-02:** All numbers are **heuristic estimates** unless explicitly noted. None are regression-fitted to a specific portfolio. Outputs of this engine are observational risk simulations, not forecasts and not investment advice.

---

## Files in this directory

| File | Purpose | Cardinality |
|------|---------|-------------|
| `asset_classes.json`     | 12-class taxonomy + 48 hardcoded symbol → class mappings | 12 classes, 48 by_symbol |
| `historical_replay.json` | 5 historical crisis scenarios with per-class shocks | 5 × 12 = 60 numbers |
| `market_shock.json`      | 4 stylized broad-market drop scenarios | 4 × 12 = 48 numbers |
| `rate_shock.json`        | 4 yield-curve shift scenarios | 4 × 12 = 48 numbers |
| `liquidity_shock.json`   | 4 credit/liquidity stress scenarios | 4 × 12 = 48 numbers |
| `black_swan_proxy.json`  | 4 synthetic compound tail scenarios | 4 × 12 = 48 numbers |
| `proxy_rules.json`       | Proxy substitutions for assets without historical data | 4 rules + 1 fallback |
| `factor_loadings.json`   | 8-factor exposures (12 classes + 30 per-symbol) | (12+30) × 8 = 336 numbers |
| `factor_shock.json`      | 5 factor-shock scenarios with per-factor moves | 5 × 8 = 40 numbers |

**Total numerical entries:** ~720.

---

## 1. `asset_classes.json` — 12-class taxonomy

### Class definitions

| Class | Description |
|-------|-------------|
| `us_equity_broad`         | US equity index baseline (S&P 500 / Russell 1000 large-cap minus tech / financial / energy carve-outs) |
| `us_equity_tech`          | US large-cap technology (FAAMNG + adjacent) |
| `us_equity_financial`     | US banks and major broker-dealers |
| `global_equity_developed` | Non-US developed market equity (EAFE, MSCI World ex-US) |
| `emerging_markets_equity` | Emerging markets equity (MSCI EM, China-A, Indian large-cap, Latin American banks, ADRs of EM-domiciled companies) |
| `crypto_major`            | BTC, ETH (top-2 by market cap, deepest liquidity) |
| `crypto_alt`              | All other cryptocurrencies (higher beta to majors) |
| `precious_metals`         | Gold, silver, platinum, palladium (XAU/XAG/XPT/XPD spot) |
| `commodities_energy`      | Oil & gas (XLE complex), broader energy futures |
| `treasury_bonds`          | US Treasuries, particularly 7-30Y duration |
| `corporate_bonds`         | US investment-grade and high-yield corporates |
| `forex_g10`               | G10 currency pairs vs USD (EUR, JPY, GBP, CHF, AUD, CAD, NZD, NOK, SEK) |

### Classification source

- **`by_symbol` (48 entries):** Authored manually based on the issuer's known business profile. Examples:
  - `AAPL` → `us_equity_tech` (Apple is a tech mega-cap)
  - `BABA` → `emerging_markets_equity` (Chinese ADR; behaves with EM dynamics, not US equity)
  - `JNJ` → `us_equity_broad` (healthcare — not in our finer-grained classes)
- **`by_category_fallback`:** Used when symbol is not explicitly listed. Conservative defaults:
  - `crypto` → `crypto_alt` (any unrecognized crypto treated as high-beta altcoin)
  - `stock` → `us_equity_broad` (default to broad equity beta)
  - `futures` → `commodities_energy` (most "futures" entries the user types are likely energy or industrial)
  - `forex` → `forex_g10`

---

## 2. `historical_replay.json` — 5 historical crises

All shock magnitudes are **observed peak-to-trough drawdowns** during the named period, as reported by primary financial sources. Numbers are rounded to 1 decimal place; precision beyond that is not warranted given index reconstitution differences.

### `gfc_2008` — Global Financial Crisis (Sep 2008 – Mar 2009)

| Asset class | Shock | Source |
|-------------|------:|--------|
| us_equity_broad         | -56.8% | S&P 500 peak-to-trough Oct 2007 → Mar 2009 (Bloomberg `SPX Index PX_LAST` series) |
| us_equity_tech          | -55.6% | Nasdaq 100 peak-to-trough (Bloomberg `NDX Index`) |
| us_equity_financial     | -82.6% | KBW Bank Index peak-to-trough |
| global_equity_developed | -57.0% | MSCI World peak-to-trough |
| emerging_markets_equity | -65.0% | MSCI Emerging Markets peak-to-trough |
| precious_metals         | +25.0% | LBMA Gold PM Fix, Sep 2008 → Mar 2009 |
| commodities_energy      | -78.0% | WTI crude peak-to-trough Jul 2008 → Feb 2009 |
| treasury_bonds          | +20.0% | 30Y UST total return (long duration rallied as Fed cut to 0%) |
| corporate_bonds         | -8.0% | LQD ETF (IG corporate) total return through period |
| forex_g10               | -15.0% | DXY appreciated; G10 average vs USD declined |
| **proxy_required:** `crypto_major`, `crypto_alt` (Bitcoin not yet launched) | | |

### `covid_2020` — COVID Shock (Feb 19 – Mar 23, 2020)

33-day peak-to-trough — the fastest bear market on record for US equities.

| Asset class | Shock | Source |
|-------------|------:|--------|
| us_equity_broad         | -34.0% | S&P 500 close Feb 19 → Mar 23 |
| us_equity_tech          | -30.0% | Nasdaq 100 same period |
| us_equity_financial     | -42.0% | KBW Bank Index |
| crypto_major            | -50.0% | BTC: $10,460 (Feb 13) → $5,189 (Mar 13). ETH similar magnitude |
| crypto_alt              | -65.0% | Total altcoin market cap proxy |
| precious_metals         | +5.0%  | Gold relatively stable; brief late-March selloff for liquidity reversed |
| commodities_energy      | -65.0% | WTI peak-to-trough including the negative oil futures episode |
| treasury_bonds          | +8.0%  | 10Y UST yield 1.6% → 0.5%; long bond rallied |
| corporate_bonds         | -5.0%  | LQD; IG drawdown muted by Fed primary dealer credit facility |
| forex_g10               | -8.0%  | DXY surged in dollar funding squeeze |

### `flash_crash_2010` — May 6, 2010 intraday

| Asset class | Shock | Source |
|-------------|------:|--------|
| us_equity_broad         | -9.0%  | S&P 500 intraday low minutes after 14:42 ET |
| us_equity_tech          | -10.0% | Nasdaq similar (some single-stock prints went much lower but recovered) |
| us_equity_financial     | -12.0% | Banks led the collapse |
| precious_metals         | +1.0%  | Gold safe-haven bid muted |
| **proxy_required:** `crypto_major`, `crypto_alt` (cottage-industry pre-2014) | | |

Source: **SEC/CFTC joint report on the events of May 6, 2010** (released Sep 30, 2010).

### `fed_shock_2022` — 9-month rate-driven repricing (Jan – Oct 2022)

Cumulative 425bp Fed funds rate hike. Long-duration assets repriced.

| Asset class | Shock | Source |
|-------------|------:|--------|
| us_equity_broad         | -25.0% | S&P 500 |
| us_equity_tech          | -36.0% | Nasdaq 100 |
| crypto_major            | -65.0% | BTC peak Nov 2021 → trough Nov 2022 ~ -75%; we use -65% for the rate-channel-attributable portion |
| crypto_alt              | -75.0% | Altcoins steeper than majors |
| precious_metals         | -3.0%  | Gold ranged through period; modest negative |
| commodities_energy      | +5.0%  | WTI rose during period (peaked Mar 2022 with Russia-Ukraine) |
| treasury_bonds          | -15.0% | TLT total return through period |
| corporate_bonds         | -16.0% | LQD total return |
| forex_g10               | +16.0% | DXY surged ~20%; G10 average declined |

### `liquidity_crisis_2020mar` — Dollar liquidity squeeze (Mar 9 – 23, 2020)

A 2-week sub-window of the broader COVID crash, focusing on the credit-spread and Treasury market dysfunction phase.

| Asset class | Shock | Source |
|-------------|------:|--------|
| us_equity_financial     | -25.0% | Banks led decline as credit risk repriced |
| crypto_major            | -45.0% | BTC's "Black Thursday" Mar 12: $7900 → $3850 in 24h |
| corporate_bonds         | -12.0% | IG spreads widened ~150bp in 10 days |
| treasury_bonds          | +2.0%  | Despite some liquidity stress, treasuries net positive |
| forex_g10               | -8.0%  | DXY surged in funding squeeze |

---

## 3. `market_shock.json`, `rate_shock.json`, `liquidity_shock.json`

These are **stylized scenarios** — not replays of specific historical events, but calibrated to typical magnitudes observed across multiple historical episodes.

- **`market_shock`**: -10% / -20% / -30% / -40% equity drops with cross-asset response calibrated to 2018Q4, 2011Q3, COVID 2020, GFC 2008 patterns respectively.
- **`rate_shock`**: +50bp / +100bp / +200bp / -100bp parallel curve shifts. Tech equity / crypto magnitudes match 2013 Taper Tantrum and 2022 Fed cycle. Bond magnitudes use modified duration of 7Y for treasury, 5Y for corporate.
- **`liquidity_shock`**: IG +100bp, HY +500bp, USD funding squeeze, Treasury market dysfunction. Calibrated to Sep 2019 repo crisis, Mar 2020 squeeze, GFC 2008, and historical IG/HY spread blowouts.

Numbers within these scenarios are **not derived from any single event**; they aggregate analyst-typical magnitudes published in sell-side stress test playbooks (Goldman, Morgan Stanley, BlackRock public commentary 2018-2024).

---

## 4. `black_swan_proxy.json` — Synthetic compound stresses

| Scenario | Reference / inspiration |
|----------|--------------------------|
| `stagflation`           | 1973-1980 stagflation analogue (Brent oil shock + Fed funds 19%) |
| `geopolitical_shock`    | Aggregate of 1990 Gulf War, 2014 Crimea, 2022 Russia-Ukraine, modeled rather than replayed |
| `tech_concentration_unwind` | Hypothetical: top-10 tech mean-revert to historical median forward P/E (~16x). Not a historical replay. |
| `compound_tail`         | Worst case envelope: equity crash (GFC magnitude) + credit blowout (HY +700bp) + USD squeeze simultaneously |

All flagged `is_synthetic: true` in JSON; engine outputs them with `disclosure_label = "Proxy approximation"`.

---

## 5. `proxy_rules.json`

When a historical scenario calls a class that didn't exist (or had de minimis market) at that time, fall back to a similar-behavior class × leverage factor.

| Rule | Maps | × | Rationale |
|------|------|---|-----------|
| `crypto_major::gfc_2008` | `us_equity_tech` | 1.5x | BTC launched Jan 2009 — no market existed. Tech equity is closest behavior analogue (high beta, risk-on). 1.5x reflects historical BTC realized vol vs Nasdaq-100. |
| `crypto_alt`             | `us_equity_tech` | 2.0x | Most altcoin markets emerged 2014-2017. 2x for higher beta and lower liquidity. |
| `crypto_major::flash_crash_2010` | `us_equity_tech` | 1.2x | Bitcoin existed in May 2010 but had de minimis volume; cottage-industry conditions. |
| `crypto_alt::flash_crash_2010`   | `us_equity_tech` | 1.5x | Altcoins did not exist in 2010. |

**Final fallback** (last resort if no direct shock and no proxy rule matches): `-10%` broad-market downside.

Leverage factors are calibrated to ratio-of-realized-vol observed 2017-2024 between BTC and Nasdaq-100 for `crypto_major::*`, scaled higher for altcoins. **These are heuristics; they do not represent forecasts of how crypto would behave in any future analogue of GFC.**

---

## 6. `factor_loadings.json` — 8-factor model

### Factor universe (8 factors)

| Factor | Sign convention | Source |
|--------|------------------|--------|
| `Growth`         | + = growth stocks outperform | Fama-French style factor (HML negative inverse) |
| `Value`          | + = value stocks outperform | Fama-French HML |
| `Quality`        | + = high-quality outperform | MSCI Quality Index methodology |
| `Momentum`       | + = trend-following wins | AQR Carhart momentum |
| `Volatility`     | + = VIX rises | CBOE VIX % change |
| `RealRate`       | + = 10Y real rate rises | TIPS implied real yield |
| `Inflation`      | + = inflation expectations rise | TIPS-Treasury spread |
| `CreditSpread`   | + = IG/HY spreads widen | LQD-IEF spread, HYG-LQD spread |

### Loadings — 12 asset classes + 30 per-symbol overrides

**Per-class loadings (12 × 8 = 96 numbers):** Heuristic estimates from author's reading of:
- MSCI factsheets for representative ETFs (SPY, IVV, EFA, EEM, GLD, etc.)
- AQR research papers (e.g., "Buffett's Alpha" 2013, factor zoo 2018)
- Fama-French data library (https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/data_library.html)
- Sell-side risk model documentation (Barra, Axioma — public excerpts only)

**Per-symbol loadings (30 × 8 = 240 numbers):** For the most common 30 tickers, individual loadings deviate from class-level to reflect known issuer characteristics:
- `NVDA` Growth=0.9 (vs us_equity_tech 0.7) — historically the highest-growth among mega-caps
- `MSFT` Quality=0.9 (vs us_equity_tech 0.4) — best balance-sheet metrics in the class
- `JPM` Quality=0.5 (vs us_equity_financial 0.2) — best-managed of the money-centers
- `JNJ` Quality=0.8 (vs us_equity_broad 0.3) — legendary defensive cash flows

**These loadings are NOT regression-fitted.** A v2 of the engine could compute loadings from Polygon historical returns data via OLS regression on factor return time series. Currently the heuristic is sufficient for relative cross-asset comparison but not for absolute risk forecasting.

---

## 7. `factor_shock.json` — 5 stylized factor scenarios

| Scenario | Driving factor | Reference |
|----------|---------------|-----------|
| `growth_crash`        | Growth -25%, Volatility +20% | 2022 H1 tech repricing concentrated through growth-style factor |
| `real_rate_surge`     | RealRate +25%, Growth -8%    | 2022 Fed cycle effect concentrated through rate channel |
| `inflation_surprise`  | Inflation +25%, Growth -5%   | 2022 CPI surprise prints (June 2022 hot CPI = +9.1% YoY) |
| `flight_to_quality`   | Quality +10%, CreditSpread +30%, Volatility +25% | 2008 Q4, March 2020 |
| `vol_spike`           | Volatility +30%, Quality +5% | August 2015 vol regime shift, February 2018 vol-explosion |

Magnitudes are calibrated to roughly produce realistic asset moves when applied to typical loadings. **Not predictions.**

---

## Compliance notes

Every output of this engine carries:
- A `source_type` label in `{"replay", "replay_with_proxy", "synthetic", "fallback", "factor"}`
- A `disclosure_label` (UI badge) reflecting the source type
- A `disclosure_text` (footer paragraph) explaining the methodology and disclaiming forecasts/advice

The `pytest` suite enforces `test_no_directive_language_in_outputs` — scanning all 26 scenario × 7 output text fields for forbidden directive phrases (e.g., "you should", "consider buying", "increase your allocation"). If any phrase slips into the codebase, CI breaks.

**For audit:** every numerical entry in this directory should be traceable to either:
1. A primary source (Bloomberg / Polygon / FRED) with a date and series ID, OR
2. A secondary source (academic paper, sell-side research) with citation, OR
3. An explicit "heuristic" label — in which case the disclosure_text MUST contain "heuristic" or "approximation".

---

## Maintenance

To upgrade these data:
- **Replays (1-3 above):** Re-pull from Bloomberg/FRED with current vintage. Numbers drift as indices rebuild and time series get extended. Recommend annual review.
- **Stylized (4-5):** Re-calibrate every 3-5 years as base-rate volatility shifts. Tail magnitudes for extrapolation should err conservative.
- **Factor loadings:** Annual review. Long-term aim is to replace heuristics with regression-fitted loadings on Polygon historical-returns data.
