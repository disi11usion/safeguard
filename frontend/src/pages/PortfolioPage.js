import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Plus, Upload, TrendingUp,
  AlertTriangle, Activity, Brain, ChevronDown, ChevronUp,
  RefreshCw, Copy, Check, Zap, Target,
  X, Search, Info, PieChart, List
} from 'lucide-react';
import PortfolioAssetsSection from '../components/PortfolioAssetsSection';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';

// Mirror of backend asset_classes.json classification → risk level mapping.
// Keep in sync with backend/application/services/stress_configs/asset_classes.json
function inferRisk(symbol, category) {
  const s = (symbol || '').toUpperCase().trim();
  const c = (category || '').toLowerCase();
  if (c === 'crypto') return 'HIGH';
  if (c === 'stock') {
    const tech = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'NVDA', 'META', 'AMZN', 'TSLA', 'NFLX'];
    const high_vol_tech = ['NVDA', 'TSLA'];
    if (high_vol_tech.includes(s)) return 'HIGH';
    if (tech.includes(s)) return 'MEDIUM';
    return 'MEDIUM';
  }
  if (c === 'futures') {
    if (['GOLD', 'GC', 'SILVER', 'SI'].includes(s)) return 'LOW';
    return 'MEDIUM';
  }
  if (c === 'forex') return 'LOW';
  return 'MEDIUM';
}

// ═══════════════════════════════════════════
// MOCK DATA — will be replaced with API calls
// ═══════════════════════════════════════════

const MOCK_ASSETS = [
  // Quantities chosen so that entryPrice × weight produces a balanced cost-basis demo
  // (matches Portfolio_Redesign_Mock.html sample portfolio).
  { id: 1, symbol: 'BTC',  name: 'Bitcoin',        category: 'crypto',  weight: 0.6, entryPrice: 42000, currentPrice: 79534, risk: 'HIGH' },
  { id: 2, symbol: 'AAPL', name: 'Apple Inc.',     category: 'stock',   weight: 100, entryPrice: 178,   currentPrice: 213,   risk: 'LOW' },
  { id: 3, symbol: 'Gold', name: 'Gold',           category: 'futures', weight: 20,  entryPrice: 1950,  currentPrice: 2340,  risk: 'LOW' },
  { id: 4, symbol: 'ETH',  name: 'Ethereum',       category: 'crypto',  weight: 8,   entryPrice: 2200,  currentPrice: 3180,  risk: 'HIGH' },
  { id: 5, symbol: 'MSFT', name: 'Microsoft Corp.',category: 'stock',   weight: 50,  entryPrice: 380,   currentPrice: 425,   risk: 'MEDIUM' },
];

const MOCK_HEALTH = {
  status: 'STRESSED',
  score: 62,
  factors: {
    concentration:    { status: 'warning', label: 'Concentration Risk',    detail: 'Crypto assets exceed 40% of portfolio' },
    correlation:      { status: 'danger',  label: 'Correlation Risk',      detail: 'BTC and ETH are highly correlated (0.87)' },
    macro:            { status: 'ok',      label: 'Macro Exposure',        detail: 'Diversified across asset classes' },
    sentiment:        { status: 'warning', label: 'Sentiment Skew',        detail: 'Social sentiment heavily bullish — potential reversal risk' },
    volatility:       { status: 'ok',      label: 'Volatility Clustering', detail: 'No unusual volatility detected' },
  }
};

const MOCK_STRESS_TESTS = [
  {
    id: 'market_shake',
    name: 'Market Shake',
    icon: '📉',
    description: 'Historical volatility-based market downturn simulation',
    portfolioImpact: -8.2,
    assets: [
      { symbol: 'BTC',  impact: -15.0 },
      { symbol: 'AAPL', impact: -6.5 },
      { symbol: 'Gold', impact: +4.0 },
      { symbol: 'ETH',  impact: -18.2 },
      { symbol: 'MSFT', impact: -7.8 },
    ],
    status: 'completed',
  },
  {
    id: 'rate_surprise',
    name: 'Rate Surprise',
    icon: '📰',
    description: 'Fed unexpected rate hike — impact on rate-sensitive assets',
    portfolioImpact: -11.5,
    assets: [
      { symbol: 'BTC',  impact: -12.0 },
      { symbol: 'AAPL', impact: -9.2 },
      { symbol: 'Gold', impact: +6.0 },
      { symbol: 'ETH',  impact: -18.5 },
      { symbol: 'MSFT', impact: -11.0 },
    ],
    status: 'completed',
  },
  {
    id: 'fear_event',
    name: 'Fear Event',
    icon: '😱',
    description: 'VIX spike / social panic — which assets amplify or absorb shock',
    portfolioImpact: -14.8,
    assets: [
      { symbol: 'BTC',  impact: -22.0 },
      { symbol: 'AAPL', impact: -8.0 },
      { symbol: 'Gold', impact: +8.5 },
      { symbol: 'ETH',  impact: -25.0 },
      { symbol: 'MSFT', impact: -10.5 },
    ],
    status: 'completed',
  },
  {
    id: 'pandemic',
    name: 'Pandemic / Black Swan',
    icon: '🦠',
    description: 'Historical replay — Covid / 2020 style shock',
    portfolioImpact: -19.3,
    assets: [
      { symbol: 'BTC',  impact: -35.0 },
      { symbol: 'AAPL', impact: -15.0 },
      { symbol: 'Gold', impact: +12.0 },
      { symbol: 'ETH',  impact: -42.0 },
      { symbol: 'MSFT', impact: -18.0 },
    ],
    status: 'completed',
  },
];

const MOCK_KILLER_OUTPUT = {
  worstScenario:       { name: 'Pandemic / Black Swan', impact: -19.3 },
  bestProtection:      { action: 'Increase Gold allocation to 35%', reduction: 8.5 },
  mostSensitiveFactor: { factor: 'BTC weight', detail: '1% change causes 0.95% portfolio swing' },
};

const MOCK_AI_COMMENTARY = `Your portfolio is moderately concentrated in crypto assets: BTC (25%) and ETH (15%) together make up 40%. These two assets are highly correlated (0.87 in the current period), so they tend to move in the same direction under market stress. The modeled impact of a pandemic-level shock is -19.3% of portfolio value.

Across the stress scenarios run on this page, Gold (25%) is the only holding with positive scenario impacts. In a counterfactual where Gold's weight were 35% — with other weights scaled proportionally — the modeled worst-case drawdown is approximately 8.5 percentage points smaller. This is a descriptive scenario output, not a suggestion to change positions.

The position with the highest modeled sensitivity is BTC: a 1 percentage-point change in BTC weight moves modeled portfolio volatility by roughly 0.95%. This figure describes an observed sensitivity relationship and is not a recommendation to adjust the portfolio.`;

// ═══════════════════════════════════════════
// STRESS ENGINE — module + disclosure badge config
// ═══════════════════════════════════════════

const STRESS_MODULES = [
  { id: 'historical_replay', label: 'Historical Replay' },
  { id: 'market_shock',      label: 'Market Shock' },
  { id: 'rate_shock',        label: 'Rate Shock' },
  { id: 'liquidity_shock',   label: 'Liquidity Shock' },
  { id: 'black_swan_proxy',  label: 'Black Swan Proxy' },
  { id: 'factor_shock',      label: 'Factor Shock' },
  { id: 'reverse_stress',    label: 'Reverse Stress', isReverse: true },
];

const SOURCE_BADGE_STYLE = {
  replay:             { bg: 'bg-blue-500/15',   text: 'text-blue-300',   border: 'border-blue-500/30' },
  replay_with_proxy:  { bg: 'bg-purple-500/15', text: 'text-purple-300', border: 'border-purple-500/30' },
  synthetic:          { bg: 'bg-amber-500/15',  text: 'text-amber-300',  border: 'border-amber-500/30' },
  fallback:           { bg: 'bg-gray-500/15',   text: 'text-gray-300',   border: 'border-gray-500/30' },
  factor:             { bg: 'bg-emerald-500/15', text: 'text-emerald-300', border: 'border-emerald-500/30' },
};

// ═══════════════════════════════════════════
// CORRELATION MATRIX (Diversification Diagnostic)
// Pairwise correlation heatmap of user's portfolio over a trailing window.
// Reads recent daily returns, NOT a forecast.
// ═══════════════════════════════════════════

function correlationCellStyle(v) {
  // 6-band color scale, with stronger saturation for clearer reading.
  // Using opacity scaling within each band so values close to band edges show subtle
  // gradation instead of hard cliffs.
  const abs = Math.abs(v);
  if (v >= 0.7)  return { bg: `rgba(239, 68, 68, ${0.35 + abs * 0.35})`,   fg: '#fef2f2' };  // red
  if (v >= 0.4)  return { bg: `rgba(249, 115, 22, ${0.25 + abs * 0.30})`,  fg: '#fff7ed' };  // orange
  if (v >= 0.1)  return { bg: `rgba(234, 179, 8, ${0.20 + abs * 0.25})`,   fg: '#fef9c3' };  // yellow
  if (v >= -0.1) return { bg: 'rgba(100, 116, 139, 0.18)',                 fg: '#94a3b8' };  // neutral slate
  if (v >= -0.4) return { bg: `rgba(16, 185, 129, ${0.20 + abs * 0.25})`,  fg: '#d1fae5' };  // light emerald
  return            { bg: `rgba(5, 150, 105, ${0.40 + abs * 0.25})`,       fg: '#ecfdf5' };  // dark emerald
}

function CorrelationMatrix({ data, loading, error, assets }) {
  if (!assets || assets.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
        Add at least two assets to see correlation analysis.
      </div>
    );
  }
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm flex items-center justify-center gap-2">
        <RefreshCw className="h-4 w-4 animate-spin" /> Computing correlations from 180 days of price history…
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300">
        Correlation engine error: {error}
      </div>
    );
  }
  if (!data || !data.success) {
    const reason = data?.diagnostics?.reason || data?.error || 'Insufficient data';
    return (
      <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
        {reason}
        {data?.skipped_symbols?.length > 0 && (
          <p className="text-xs mt-2 opacity-70">
            Skipped (no Polygon history): {data.skipped_symbols.join(', ')}
          </p>
        )}
      </div>
    );
  }

  const { symbols, matrix, diagnostics, n_observations, window_days, skipped_symbols } = data;
  const n = symbols.length;
  if (n === 0) return null;

  // Vertical legend bands with explanatory text
  const legendBands = [
    { range: '≥ 0.70',     label: 'Move in lockstep',      tone: 'rgba(239, 68, 68, 0.65)' },
    { range: '0.40 – 0.70', label: 'Moderately co-moving', tone: 'rgba(249, 115, 22, 0.55)' },
    { range: '0.10 – 0.40', label: 'Weakly correlated',    tone: 'rgba(234, 179, 8, 0.45)' },
    { range: '−0.10 – 0.10', label: 'Independent',          tone: 'rgba(100, 116, 139, 0.40)' },
    { range: '−0.40 – −0.10', label: 'Mild diversifier',    tone: 'rgba(16, 185, 129, 0.45)' },
    { range: '< −0.40',     label: 'Strong opposite mover', tone: 'rgba(5, 150, 105, 0.65)' },
  ];

  return (
    <div className="space-y-5">
      {/* Skipped-symbols warning (prominent, before matrix) */}
      {skipped_symbols && skipped_symbols.length > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0 text-orange-400" />
          <div className="text-xs text-orange-200 leading-relaxed">
            <strong className="text-orange-100">{skipped_symbols.length} asset{skipped_symbols.length === 1 ? '' : 's'} not included:</strong>{' '}
            {skipped_symbols.join(', ')}.
            {' '}<span className="text-orange-200/70">No daily price history was available from Polygon for these symbols (could be a less-traded ticker or transient rate-limiting). The matrix below covers the remaining {symbols.length} asset{symbols.length === 1 ? '' : 's'} only.</span>
          </div>
        </div>
      )}

      {/* Top: matrix on left, explainer on right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Heatmap */}
        <div className="lg:col-span-2 bg-card border border-border rounded-2xl p-5">
          <div className="overflow-x-auto">
            <div className="inline-block min-w-full">
              <table className="border-separate" style={{ borderSpacing: '4px' }}>
                <thead>
                  <tr>
                    <th className="p-1 w-14"></th>
                    {symbols.map((s) => (
                      <th key={s} className="px-2 py-1 text-foreground font-semibold text-center text-xs">
                        <span className="inline-block bg-secondary/40 rounded-md px-2 py-0.5">{s}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {symbols.map((rowSym, i) => (
                    <tr key={rowSym}>
                      <th className="px-2 py-1 text-foreground font-semibold text-right">
                        <span className="inline-block bg-secondary/40 rounded-md px-2 py-0.5 text-xs">{rowSym}</span>
                      </th>
                      {matrix[i].map((v, j) => {
                        const isDiag = i === j;
                        const style = correlationCellStyle(v);
                        return (
                          <td
                            key={j}
                            className={`text-center text-xs font-mono font-medium rounded-md transition-transform hover:scale-110 hover:z-10 hover:relative ${
                              isDiag ? 'bg-card border border-border/60 text-muted-foreground' : 'cursor-default'
                            }`}
                            style={isDiag ? {} : { backgroundColor: style.bg, color: style.fg, minWidth: '54px', height: '40px' }}
                            title={`${rowSym} ↔ ${symbols[j]}: ${v.toFixed(3)}`}
                          >
                            {isDiag ? '·' : v.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Coverage line */}
          <div className="mt-4 pt-3 border-t border-border/40 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
            <span><span className="text-foreground font-medium">{n_observations}</span> daily returns</span>
            <span className="opacity-50">·</span>
            <span>{window_days}-day window</span>
            <span className="opacity-50">·</span>
            <span>{n} × {n} matrix</span>
            {skipped_symbols && skipped_symbols.length > 0 && (
              <>
                <span className="opacity-50">·</span>
                <span className="text-orange-300">Skipped: {skipped_symbols.join(', ')}</span>
              </>
            )}
          </div>
        </div>

        {/* Right: explanatory panel */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground mb-2 flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              How to read this
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Each cell shows how closely two assets have moved together over the past {window_days} days. The number ranges from{' '}
              <span className="text-emerald-400 font-mono">−1</span> (perfectly opposite) to{' '}
              <span className="text-red-400 font-mono">+1</span> (perfectly in sync).
            </p>
          </div>

          {/* Vertical legend */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Color scale</p>
            <div className="space-y-1">
              {legendBands.map((b, idx) => (
                <div key={idx} className="flex items-center gap-2 text-[11px]">
                  <span
                    className="w-7 h-4 rounded-sm flex-shrink-0 border border-white/10"
                    style={{ backgroundColor: b.tone }}
                  />
                  <span className="font-mono text-muted-foreground w-24 flex-shrink-0">{b.range}</span>
                  <span className="text-foreground/80">{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Reading tips */}
          <div className="pt-3 border-t border-border/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">What to look for</p>
            <ul className="text-xs text-muted-foreground space-y-1.5 leading-snug">
              <li className="flex items-start gap-1.5">
                <span className="text-red-400 mt-0.5">●</span>
                <span><strong className="text-foreground">Lots of red</strong> = portfolio is concentrated; a single market move hits everything together.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-emerald-400 mt-0.5">●</span>
                <span><strong className="text-foreground">Greens</strong> = real diversification; these assets tend to move opposite to others.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-muted-foreground mt-0.5">●</span>
                <span>The matrix is <strong className="text-foreground">symmetric</strong> — top-right mirrors bottom-left.</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-muted-foreground mt-0.5">●</span>
                <span>The diagonal (an asset with itself) is always 1.</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Diagnostic cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {diagnostics?.highest_pair && (
          <div className="bg-card border border-red-500/30 rounded-xl p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 relative">
              Most Concentrated Pair
            </p>
            <p className="text-sm font-bold text-foreground relative">
              {diagnostics.highest_pair.a} ↔ {diagnostics.highest_pair.b}
            </p>
            <p className="text-3xl font-bold text-red-400 mt-1 relative tracking-tight">
              {diagnostics.highest_pair.corr.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-2 relative leading-relaxed">
              These two have moved <span className="text-foreground font-medium">{Math.abs(diagnostics.highest_pair.corr * 100).toFixed(0)}%</span> in lockstep over the past {window_days} days. Holding both provides limited diversification.
            </p>
          </div>
        )}
        {diagnostics?.best_diversifier && (
          <div className="bg-card border border-emerald-500/30 rounded-xl p-4 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-2xl" />
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1 relative">
              Strongest Diversifier
            </p>
            <p className="text-sm font-bold text-foreground relative">
              {diagnostics.best_diversifier.symbol}
            </p>
            <p className="text-3xl font-bold text-emerald-400 mt-1 relative tracking-tight">
              {diagnostics.best_diversifier.avg_corr_excluding_self.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-2 relative leading-relaxed">
              Average correlation with other holdings is the lowest. This asset reduced your portfolio's typical co-movement most over the window.
            </p>
          </div>
        )}
      </div>

      {/* Disclosure */}
      <div className="bg-muted/20 border border-border rounded-lg p-3 flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground leading-relaxed">
          {data.disclosure_text || 'Past correlations do not predict future correlations. This is observation, not forecast.'}
        </p>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════
// REVERSE STRESS PANEL
// Asks: "Which scenarios in our library would breach my loss threshold?"
// Answers by scanning all 21 scenarios and ranking by severity.
// ═══════════════════════════════════════════

function ReverseStressPanel({ threshold, setThreshold, result, loading, error, assets, onRun }) {
  const hasAssets = assets && assets.length > 0;
  return (
    <div>
      {/* Threshold input */}
      <div className="bg-card border border-border rounded-xl p-5 mb-4">
        <label className="text-sm text-muted-foreground mb-2 block">
          Loss Threshold (negative %)
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="-50" max="-5" step="1"
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="flex-1 accent-red-400"
          />
          <span className="text-2xl font-bold text-red-400 w-20 text-right">
            {threshold}%
          </span>
          <button
            onClick={onRun}
            disabled={loading || !hasAssets}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Running…' : 'Find Breaches'}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Find which scenarios in our library would cause your portfolio to lose at least {Math.abs(threshold)}%.
          {!hasAssets && ' (Add at least one asset first.)'}
        </p>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300 mb-4">
          Reverse stress error: {error}
        </div>
      )}

      {/* Result table */}
      {result && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-border bg-secondary/30">
            <p className="text-sm">
              <span className="font-bold text-red-400">{result.breach_count}</span>
              {' '}of {result.total_scenarios} scenarios breach your threshold of {threshold}%
            </p>
          </div>
          {result.breaches.length === 0 ? (
            <div className="p-6 text-center text-muted-foreground text-sm">
              ✅ No scenarios in our library breach this threshold for your current portfolio.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {result.breaches.map(b => {
                const badgeStyle = SOURCE_BADGE_STYLE[b.source_type] || SOURCE_BADGE_STYLE.replay;
                return (
                  <div key={`${b.module}-${b.scenario_id}`} className="p-4 hover:bg-secondary/20">
                    <div className="flex justify-between items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <p className="font-semibold text-foreground">{b.scenario_name}</p>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                          >
                            {b.disclosure_label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {b.module}{b.period ? ` · ${b.period}` : ''}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {b.main_damage_driver}
                        </p>
                      </div>
                      <span className="text-xl font-bold text-red-400 whitespace-nowrap shrink-0">
                        {formatPercent(b.drawdown_pct)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Disclosure footer */}
          <div className="p-4 border-t border-border bg-muted/20 flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Reverse stress testing identifies scenarios in our library that would breach your specified loss threshold under modeled exposure. This is an observation about which scenarios produce large modeled drawdowns; it is not a prediction of likelihood, not a forecast, and not investment advice. Listed scenarios are not ranked by probability.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// UTILITY COMPONENTS
// ═══════════════════════════════════════════

const HEALTH_CONFIG = {
  HEALTHY:  { color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/30', icon: Shield },
  STRESSED: { color: 'text-orange-400', bg: 'bg-orange-400/10', border: 'border-orange-400/30', icon: AlertTriangle },
  FRAGILE:  { color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', icon: AlertTriangle },
};

const FACTOR_STATUS = {
  ok:      { color: 'text-green-400', icon: Check },
  warning: { color: 'text-orange-400', icon: AlertTriangle },
  danger:  { color: 'text-red-400', icon: AlertTriangle },
};

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value) {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

// ═══════════════════════════════════════════
// ADD ASSET MODAL
// ═══════════════════════════════════════════

function AddAssetModal({ isOpen, onClose, onSubmit, initialAsset = null, mode = 'add' }) {
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('stock');
  const [weight, setWeight] = useState('');
  const [entryPrice, setEntryPrice] = useState('');
  const [currentPrice, setCurrentPrice] = useState('');
  const [risk, setRisk] = useState(inferRisk('', 'stock'));
  const [riskOverridden, setRiskOverridden] = useState(false);
  const [showRiskOverride, setShowRiskOverride] = useState(false);

  // Initialize fields exactly ONCE per open. We use a ref guard so even if `initialAsset`
  // reference changes mid-edit (e.g. parent re-renders pass a recomputed asset object after
  // a price refresh), we don't blow away the user's typed input.
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      initializedRef.current = false;
      return;
    }
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (initialAsset) {
      setSymbol(initialAsset.symbol || '');
      setName(initialAsset.name || '');
      setCategory(initialAsset.category || 'stock');
      setWeight(String(initialAsset.weight ?? ''));
      setEntryPrice(String(initialAsset.entryPrice ?? ''));
      setCurrentPrice(String(initialAsset.currentPrice ?? ''));
      // Risk: only treat as "manually overridden" if saved risk differs from what
      // inferRisk would compute for the saved (symbol, category). If they match,
      // keep it in auto mode so changing the category recomputes risk.
      const computed = inferRisk(initialAsset.symbol, initialAsset.category);
      const savedRisk = initialAsset.risk || computed;
      setRisk(savedRisk);
      setRiskOverridden(savedRisk !== computed);
      setShowRiskOverride(false);
      return;
    }

    setSymbol('');
    setName('');
    setCategory('stock');
    setWeight('');
    setEntryPrice('');
    setCurrentPrice('');
    setRisk(inferRisk('', 'stock'));
    setRiskOverridden(false);
    setShowRiskOverride(false);
  }, [isOpen, initialAsset]);

  // Auto-update risk whenever symbol or category changes — unless user has manually overridden.
  useEffect(() => {
    if (!isOpen) return;
    if (riskOverridden) return;
    setRisk(inferRisk(symbol, category));
  }, [symbol, category, riskOverridden, isOpen]);

  // Symbol autocomplete (debounced 300ms; uses Polygon ticker search)
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  useEffect(() => {
    if (!isOpen) return;
    const sym = (symbol || '').trim();
    if (sym.length < 2) {
      setSearchResults([]);
      setShowDropdown(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      try {
        const resp = await apiService.searchSymbols(sym, category, 8);
        if (resp?.success) {
          const results = resp.results || [];
          setSearchResults(results);
          setShowDropdown(results.length > 0);
        }
      } catch (_) {
        // silent fail — autocomplete is non-critical
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [symbol, category, isOpen]);

  // Auto-fetch current price (debounced 500ms) when symbol or category changes.
  const [priceFetchState, setPriceFetchState] = useState('idle'); // idle | loading | ok | error
  const [priceError, setPriceError] = useState(null);
  useEffect(() => {
    if (!isOpen) return;
    const sym = (symbol || '').trim();
    if (!sym || sym.length < 1) {
      setPriceFetchState('idle');
      return;
    }
    setPriceFetchState('loading');
    setPriceError(null);
    const handle = setTimeout(async () => {
      try {
        const resp = await apiService.getLatestPrice(sym, category);
        if (resp?.success && resp.price != null) {
          setCurrentPrice(String(resp.price));
          setPriceFetchState('ok');
        } else {
          setPriceFetchState('error');
          setPriceError(resp?.error || 'Price unavailable');
        }
      } catch (e) {
        setPriceFetchState('error');
        setPriceError(e.message || 'Network error');
      }
    }, 500);
    return () => clearTimeout(handle);
  }, [symbol, category, isOpen]);

  const handleSubmit = () => {
    if (!symbol.trim()) return;

    const parsedWeight = Number(weight);
    const parsedEntryPrice = Number(entryPrice || 0);
    const parsedCurrentPrice = Number(currentPrice || 0);
    if (Number.isNaN(parsedWeight) || parsedWeight <= 0) return;

    onSubmit({
      symbol: symbol.trim().toUpperCase(),
      name: name.trim() || symbol.trim().toUpperCase(),
      category,
      weight: parsedWeight,
      entryPrice: Number.isNaN(parsedEntryPrice) ? 0 : parsedEntryPrice,
      currentPrice: Number.isNaN(parsedCurrentPrice) ? 0 : parsedCurrentPrice,
      risk,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-card border border-border rounded-2xl p-6 w-full max-w-md mx-4"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-foreground">
              {mode === 'edit' ? 'Edit Asset' : 'Add Asset'}
            </h3>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Asset Symbol</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search BTC, AAPL, Gold, EUR/USD..."
                  value={symbol}
                  onChange={e => setSymbol(e.target.value)}
                  onFocus={() => searchResults.length > 0 && setShowDropdown(true)}
                  onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  autoComplete="off"
                />
                {searching && (
                  <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
                )}
                {/* Autocomplete dropdown */}
                {showDropdown && searchResults.length > 0 && (
                  <div className="absolute z-10 left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-xl max-h-64 overflow-y-auto">
                    {searchResults.map((r) => {
                      // Strip Polygon prefix (X:, C:) for crypto/forex display
                      const displayTicker = r.ticker?.replace(/^[XC]:/, '') || r.ticker;
                      const cleanSymbol = displayTicker?.replace(/USD$/, '') || displayTicker;
                      return (
                        <button
                          key={r.ticker}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}  // prevent input blur before onClick
                          onClick={() => {
                            // For crypto: store base symbol (e.g. BTC, not X:BTCUSD)
                            // For stock: ticker as-is
                            // For forex: store as e.g. EURUSD (no C: prefix)
                            const finalSymbol = (category === 'crypto' || category === 'forex')
                              ? cleanSymbol
                              : r.ticker;
                            setSymbol(finalSymbol);
                            if (r.name) setName(r.name);
                            setShowDropdown(false);
                          }}
                          className="w-full px-3 py-2 text-left hover:bg-secondary/40 transition-colors flex justify-between items-start gap-2 border-b border-border/50 last:border-0"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-foreground">{displayTicker}</p>
                            {r.name && (
                              <p className="text-xs text-muted-foreground truncate">{r.name}</p>
                            )}
                          </div>
                          {r.type && (
                            <span className="text-[10px] text-muted-foreground/70 mt-0.5 whitespace-nowrap">
                              {r.type}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Asset Name</label>
              <input
                type="text"
                placeholder="e.g. Apple Inc."
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Category</label>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="crypto">Crypto</option>
                  <option value="stock">Stock</option>
                  <option value="forex">Forex</option>
                  <option value="futures">Futures</option>
                </select>
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 flex items-center justify-between">
                  <span>Risk {!riskOverridden && <span className="text-[10px] text-muted-foreground/70">· auto</span>}</span>
                  <button
                    type="button"
                    onClick={() => setShowRiskOverride(s => !s)}
                    className="text-[10px] text-primary hover:underline"
                  >
                    {showRiskOverride ? 'Use auto' : 'Override'}
                  </button>
                </label>
                {showRiskOverride ? (
                  <select
                    value={risk}
                    onChange={e => { setRisk(e.target.value); setRiskOverridden(true); }}
                    className="w-full px-3 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="LOW">LOW</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="HIGH">HIGH</option>
                  </select>
                ) : (
                  <div className="w-full px-3 py-2.5 rounded-lg bg-background/50 border border-border text-foreground text-sm">
                    {risk}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Quantity (units held)</label>
              <input
                type="number"
                placeholder="e.g. 0.5 (BTC), 100 (shares), 10 (oz)"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                min="0" step="any"
                className="w-full px-4 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">
                Number of units you hold. Portfolio weight (%) is auto-calculated from quantity × current price ÷ total portfolio value.
              </p>
              {Number(weight) > 0 && Number(entryPrice) > 0 && (
                <p className="text-[11px] text-emerald-300 mt-1 font-mono">
                  ≈ ${(Number(weight) * Number(entryPrice)).toLocaleString(undefined, { maximumFractionDigits: 2 })} value (at your entry price)
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm text-muted-foreground mb-1 block">Entry Price</label>
                <input
                  type="number"
                  placeholder="e.g. 42000"
                  value={entryPrice}
                  onChange={e => setEntryPrice(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground mb-1 flex items-center justify-between">
                  <span>Current Price <span className="text-[10px] text-muted-foreground/70">· auto · live</span></span>
                  {priceFetchState === 'loading' && <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />}
                  {priceFetchState === 'ok' && <Check className="h-3 w-3 text-green-400" />}
                  {priceFetchState === 'error' && <AlertTriangle className="h-3 w-3 text-orange-400" />}
                </label>
                <div
                  className={`w-full px-4 py-2.5 rounded-lg bg-background/50 border border-border text-sm font-mono ${
                    currentPrice ? 'text-foreground' : 'text-muted-foreground'
                  }`}
                  title={priceError || 'Auto-fetched from Polygon.io previous close'}
                >
                  {currentPrice ? `$${currentPrice}` : (priceFetchState === 'loading' ? 'Fetching…' : '—')}
                </div>
                {priceFetchState === 'error' && priceError && (
                  <p className="text-[10px] text-orange-400 mt-1">{priceError}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary/50 transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              {mode === 'edit' ? 'Save Changes' : 'Add Asset'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ═══════════════════════════════════════════
// MAIN PAGE COMPONENT
// ═══════════════════════════════════════════

// localStorage key for anonymous-mode portfolio persistence.
// When the user is not logged in (or auth call fails), we still let them play
// with the portfolio and persist their edits to the browser so navigation /
// page refresh doesn't wipe them out. Logged-in users always operate against DB.
const DEMO_STORAGE_KEY = 'safeguard_demo_assets';

function loadDemoAssetsFromStorage() {
  try {
    const raw = localStorage.getItem(DEMO_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch (_) { /* corrupt storage → ignore */ }
  return null;
}

export default function PortfolioPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState(() => loadDemoAssetsFromStorage() || MOCK_ASSETS);
  const [assetsLoaded, setAssetsLoaded] = useState(false);
  const [usingDemo, setUsingDemo] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAsset, setEditingAsset] = useState(null);
  const [chartView, setChartView] = useState('pie');
  const [expandedTests, setExpandedTests] = useState({});
  const [copiedAI, setCopiedAI] = useState(false);

  // 60s polling — refresh current prices for every asset in the portfolio.
  // Aligned with backend cache TTL (60s), so each poll round triggers exactly one
  // Polygon call per asset. For 5 assets this is ~5 calls/min, exactly at free-tier limit.
  // We patch ONLY currentPrice via a functional update so any concurrent edits to
  // weight/entryPrice/name/risk are never clobbered by a stale closure.
  useEffect(() => {
    if (!assets.length) return;
    let cancelled = false;
    const refreshPrices = async () => {
      try {
        const fetched = await Promise.all(assets.map(async (a) => {
          try {
            const resp = await apiService.getLatestPrice(a.symbol, a.category);
            if (resp?.success && resp.price != null) {
              return { id: a.id, price: resp.price };
            }
          } catch (_) { /* keep existing price on failure */ }
          return null;
        }));
        if (cancelled) return;
        const priceById = new Map(fetched.filter(Boolean).map(x => [x.id, x.price]));
        if (priceById.size === 0) return;
        setAssets(prev => {
          let mutated = false;
          const next = prev.map(a => {
            const newPrice = priceById.get(a.id);
            if (newPrice != null && newPrice !== a.currentPrice) {
              mutated = true;
              return { ...a, currentPrice: newPrice };
            }
            return a;
          });
          return mutated ? next : prev;
        });
      } catch (_) { /* swallow */ }
    };
    // Run once immediately, then every 60s.
    refreshPrices();
    const id = setInterval(refreshPrices, 60000);
    return () => { cancelled = true; clearInterval(id); };
    // Stable dependency: trigger only when set of (symbol+category) changes, not on every price tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.map(a => `${a.symbol}|${a.category}`).join(',')]);

  // On mount or login state change:
  //   - logged in   → fetch user's real assets from DB (may be empty array)
  //   - anonymous   → show MOCK_ASSETS as demo (local-only edits)
  // usingDemo is true only when not logged in. Logged-in users always operate on DB.
  useEffect(() => {
    let cancelled = false;
    const loadAssets = async () => {
      if (!user) {
        // Anonymous: prefer previously-saved demo edits in localStorage; otherwise mock.
        setAssets(loadDemoAssetsFromStorage() || MOCK_ASSETS);
        setUsingDemo(true);
        setAssetsLoaded(true);
        return;
      }
      try {
        const resp = await apiService.listPortfolioAssets();
        if (cancelled) return;
        if (resp?.success && Array.isArray(resp.assets)) {
          setAssets(resp.assets);  // may be []
          setUsingDemo(false);
          setAssetsLoaded(true);
        }
      } catch (e) {
        // Auth/network error — degrade to demo so page isn't broken; preserve any
        // edits the user made in the browser.
        if (!cancelled) {
          setAssets(loadDemoAssetsFromStorage() || MOCK_ASSETS);
          setUsingDemo(true);
          setAssetsLoaded(true);
        }
      }
    };
    loadAssets();
    return () => { cancelled = true; };
  }, [user]);

  // Persist demo-mode edits to localStorage so they survive navigation/refresh.
  // Logged-in users skip this — their source of truth is the DB.
  useEffect(() => {
    if (!assetsLoaded || !usingDemo) return;
    try {
      localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(assets));
    } catch (_) { /* quota / private mode — silently degrade to in-memory only */ }
  }, [assets, usingDemo, assetsLoaded]);

  // Stress Engine state
  const [selectedStressModule, setSelectedStressModule] = useState('historical_replay');
  const [stressResults, setStressResults] = useState([]);
  const [stressLoading, setStressLoading] = useState(false);
  const [stressError, setStressError] = useState(null);

  // Reverse Stress state
  const [reverseThreshold, setReverseThreshold] = useState(-25);
  const [reverseResult, setReverseResult] = useState(null);
  const [reverseLoading, setReverseLoading] = useState(false);
  const [reverseError, setReverseError] = useState(null);

  // Correlation Matrix state
  const [correlationData, setCorrelationData] = useState(null);
  const [correlationLoading, setCorrelationLoading] = useState(false);
  const [correlationError, setCorrelationError] = useState(null);

  // Pie comparison: which scenario is shown in the "stressed" pie next to current allocation
  const [pieScenarioId, setPieScenarioId] = useState(null);

  // ALL stress scenarios across ALL stress modules (fetched once when assets change).
  // Independent of SECTION 3's selectedStressModule — pie picker spans all 26 scenarios.
  const [allStressResults, setAllStressResults] = useState({}); // { module_id: [results...] }

  useEffect(() => {
    if (!assets.length) {
      setAllStressResults({});
      return;
    }
    let cancelled = false;
    const fetchAll = async () => {
      const totalValue = assets.reduce((s, a) => s + (a.entryPrice || 0) * (a.weight || 0), 0);
      const portfolio = assets.map(a => {
        const value = (a.entryPrice || 0) * (a.weight || 0);
        return {
          symbol: a.symbol,
          name: a.name,
          category: a.category,
          weight: totalValue > 0 ? (value / totalValue) * 100 : 0,
        };
      });
      const moduleIds = [
        'historical_replay', 'market_shock', 'rate_shock',
        'liquidity_shock', 'black_swan_proxy', 'factor_shock',
      ];
      const acc = {};
      // Run in parallel — backend stress engine is pure-Python, no rate limit
      try {
        const responses = await Promise.all(
          moduleIds.map(m => apiService.applyAllStress(portfolio, m).catch(() => null))
        );
        moduleIds.forEach((m, i) => {
          const resp = responses[i];
          if (resp?.success && Array.isArray(resp.results)) {
            acc[m] = resp.results;
          }
        });
      } catch (e) { /* swallow */ }
      if (!cancelled) setAllStressResults(acc);
    };
    fetchAll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.map(a => `${a.symbol}|${a.category}|${a.weight}|${a.entryPrice}`).join(',')]);

  // Auto-pick default scenario (first historical replay) once results land
  useEffect(() => {
    if (pieScenarioId) return;
    const firstHist = allStressResults?.historical_replay?.[0];
    if (firstHist) setPieScenarioId(firstHist.scenario_id);
  }, [allStressResults, pieScenarioId]);

  // ── AI Summary state ────────────────────────────────────────────────
  const [aiSummary, setAiSummary] = useState(null);   // { summary, source, cached, ... }
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [aiRefreshTick, setAiRefreshTick] = useState(0);  // bumped by Refresh button

  // Fetch AI summary whenever the portfolio composition changes (debounced 1.5s).
  // Server caches by SHA256(facts) for 24h, so identical compositions are free.
  useEffect(() => {
    if (!assets.length) {
      setAiSummary(null);
      return;
    }
    let cancelled = false;
    const totalValue = assets.reduce((s, a) => s + (a.entryPrice || 0) * (a.weight || 0), 0);
    const portfolio = assets.map(a => {
      const value = (a.entryPrice || 0) * (a.weight || 0);
      return {
        symbol: a.symbol,
        name: a.name,
        category: a.category,
        weight: totalValue > 0 ? (value / totalValue) * 100 : 0,
      };
    });
    // Flatten allStressResults { module: [results] } → list for facts builder
    const flatStress = Object.values(allStressResults || {}).flat();

    const timer = setTimeout(async () => {
      setAiLoading(true);
      setAiError(null);
      try {
        const resp = await apiService.getPortfolioAISummary(portfolio, {
          stressResults: flatStress.length ? flatStress : null,
          correlationData: correlationData || null,
          forceRefresh: aiRefreshTick > 0,
        });
        if (!cancelled) {
          if (resp?.success && resp.summary) {
            setAiSummary(resp);
          } else {
            setAiError('AI summary unavailable.');
          }
        }
      } catch (e) {
        if (!cancelled) setAiError(e?.message || 'Network error.');
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    }, 1500);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    assets.map(a => `${a.symbol}|${a.category}|${a.weight}|${a.entryPrice}`).join(','),
    Object.keys(allStressResults || {}).length,
    correlationData ? 'corr' : 'no-corr',
    aiRefreshTick,
  ]);

  // ── Portfolio Health state ──────────────────────────────────────────
  // Initial value mirrors MOCK_HEALTH so the UI renders immediately on mount;
  // the API response replaces it within a few seconds. On API failure we keep
  // whatever was last set (so the card never empties out mid-session).
  const [health, setHealth] = useState(MOCK_HEALTH);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState(null);

  useEffect(() => {
    if (!assets.length) return;
    let cancelled = false;
    const totalValue = assets.reduce((s, a) => s + (a.entryPrice || 0) * (a.weight || 0), 0);
    const portfolio = assets.map(a => {
      const value = (a.entryPrice || 0) * (a.weight || 0);
      return {
        symbol: a.symbol,
        name: a.name,
        category: a.category,
        weight: totalValue > 0 ? (value / totalValue) * 100 : 0,
      };
    });

    const timer = setTimeout(async () => {
      setHealthLoading(true);
      setHealthError(null);
      try {
        const resp = await apiService.getPortfolioHealth(portfolio);
        if (!cancelled) {
          if (resp?.success && resp.factors) {
            setHealth({
              status: resp.status,
              score: resp.score,
              factors: resp.factors,
            });
          } else {
            setHealthError('Health score unavailable.');
          }
        }
      } catch (e) {
        if (!cancelled) setHealthError(e?.message || 'Network error.');
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    }, 500);
    return () => { cancelled = true; clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.map(a => `${a.symbol}|${a.category}|${a.weight}|${a.entryPrice}`).join(',')]);

  // Build stressedAssets — search across all modules for the picked scenario
  const stressedAssetsForPie = useMemo(() => {
    if (!pieScenarioId || !assets.length) return null;
    for (const moduleResults of Object.values(allStressResults || {})) {
      const result = moduleResults.find(r => r.scenario_id === pieScenarioId);
      if (result && result.per_asset_breakdown) {
        const shockBySymbol = {};
        result.per_asset_breakdown.forEach(row => {
          shockBySymbol[row.symbol] = row.shock_pct;
        });
        return assets.map(a => ({
          ...a,
          _stressShockPct: shockBySymbol[a.symbol] ?? 0,
        }));
      }
    }
    return null;
  }, [pieScenarioId, allStressResults, assets]);

  // Group all scenarios for the dropdown — module label + flat scenario list
  const groupedScenarios = useMemo(() => {
    const moduleLabels = {
      historical_replay: 'Historical Crisis Replay',
      market_shock:      'Market Shock',
      rate_shock:        'Rate Shock',
      liquidity_shock:   'Liquidity Shock',
      black_swan_proxy:  'Black Swan Proxy',
      factor_shock:      'Factor Shock',
    };
    return Object.entries(allStressResults)
      .filter(([_id, results]) => Array.isArray(results) && results.length > 0)
      .map(([moduleId, results]) => ({
        moduleId,
        moduleLabel: moduleLabels[moduleId] || moduleId,
        scenarios: results,
      }));
  }, [allStressResults]);

  // ── Redesign: methodology drawer + page-level derived metrics ────────
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerSection, setDrawerSection] = useState('overview');
  const openDrawer = (section = 'overview') => {
    setDrawerSection(section);
    setDrawerOpen(true);
  };

  // Worst-case modeled drawdown across every scenario in every module.
  // Drives the "Worst-case" tile in the Risk Summary strip.
  const worstCaseScenario = useMemo(() => {
    const all = Object.values(allStressResults || {}).flat();
    if (!all.length) return null;
    return all.reduce(
      (min, r) => ((r.portfolio_drawdown_pct ?? 0) < (min?.portfolio_drawdown_pct ?? 0) ? r : min),
      all[0],
    );
  }, [allStressResults]);

  // Diversification readout for the Risk Summary strip — pulled off the
  // health response so we don't double-fetch correlation. 1 - mean|ρ|, where
  // 1.0 = fully independent, 0 = perfectly correlated.
  const diversificationScore = useMemo(() => {
    const meanAbs = health?.factors?.correlation?.raw?.mean_abs_corr;
    if (typeof meanAbs !== 'number') return null;
    const v = 1 - meanAbs;
    let label = 'Moderate';
    if (v >= 0.65) label = 'Strong';
    else if (v < 0.35) label = 'Weak';
    return { value: v, label };
  }, [health]);

  // Stable symbol → color map. Shared by Your Assets pie/bar and Stress
  // per-asset bars so BTC (etc.) renders the same color everywhere.
  const SLICE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];
  const symbolColor = useMemo(() => {
    const m = {};
    assets.forEach((a, i) => { m[a.symbol] = SLICE_COLORS[i % SLICE_COLORS.length]; });
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.map(a => a.symbol).join('|')]);

  // Fetch correlation when assets change (and there are ≥2)
  useEffect(() => {
    if (!assets || assets.length < 2) {
      setCorrelationData(null);
      return;
    }
    let cancelled = false;
    const fetchCorr = async () => {
      setCorrelationLoading(true);
      setCorrelationError(null);
      try {
        const portfolio = assets.map(a => ({
          symbol: a.symbol,
          name: a.name,
          category: a.category,
          weight: a.weight,
        }));
        const resp = await apiService.getPortfolioCorrelation(portfolio, 180);
        if (!cancelled) setCorrelationData(resp);
      } catch (e) {
        if (!cancelled) setCorrelationError(e.message || 'Failed to fetch correlation');
      } finally {
        if (!cancelled) setCorrelationLoading(false);
      }
    };
    fetchCorr();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets.map(a => `${a.symbol}|${a.category}`).join(',')]);

  // Fetch stress results when module or assets change.
  // Skip for the special "reverse_stress" module — it has its own on-demand trigger.
  useEffect(() => {
    if (selectedStressModule === 'reverse_stress') return;
    let cancelled = false;
    const fetchStress = async () => {
      if (!assets.length) {
        setStressResults([]);
        return;
      }
      setStressLoading(true);
      setStressError(null);
      try {
        // Convert raw quantity (stored as `weight` for legacy reasons) into actual
        // dollar weight % before sending to stress engine. Engine normalizes anyway,
        // but sending true % gives accurate per-asset contribution attribution.
        const totalValue = assets.reduce((s, a) => s + (a.entryPrice || 0) * (a.weight || 0), 0);
        const portfolio = assets.map(a => {
          const value = (a.entryPrice || 0) * (a.weight || 0);
          const weightPct = totalValue > 0 ? (value / totalValue) * 100 : 0;
          return {
            symbol: a.symbol,
            name: a.name,
            category: a.category,
            weight: weightPct,
          };
        });
        const resp = await apiService.applyAllStress(portfolio, selectedStressModule);
        if (!cancelled) {
          if (resp?.success && Array.isArray(resp.results)) {
            setStressResults(resp.results);
          } else {
            setStressError('Unexpected API response shape');
          }
        }
      } catch (e) {
        if (!cancelled) setStressError(e.message || 'Failed to fetch stress results');
      } finally {
        if (!cancelled) setStressLoading(false);
      }
    };
    fetchStress();
    return () => { cancelled = true; };
  }, [selectedStressModule, assets]);

  const totalValue = assets.reduce((sum, a) => sum + ((a.entryPrice || 0) * (a.weight || 0)), 0);
  const healthCfg = HEALTH_CONFIG[health.status] || HEALTH_CONFIG.STRESSED;
  const HealthIcon = healthCfg.icon;

  const portfolioStats = useMemo(() => {
    if (!assets.length) {
      return {
        highestRisk: 'N/A',
        largestPosition: 'N/A',
        categorySpread: '0 categories',
      };
    }

    const riskRank = { LOW: 1, MEDIUM: 2, HIGH: 3 };
    const highestRiskAsset = assets.reduce((highest, current) =>
      riskRank[current.risk] > riskRank[highest.risk] ? current : highest
    );
    const largestWeight = Math.max(...assets.map(a => a.weight));
    const largestAssets = assets.filter(a => a.weight === largestWeight).map(a => a.symbol).join(' & ');
    const categories = new Set(assets.map(a => a.category)).size;

    return {
      highestRisk: `${highestRiskAsset.symbol} (${highestRiskAsset.risk})`,
      largestPosition: `${largestAssets} (${largestWeight}%)`,
      categorySpread: `${categories} categories`,
    };
  }, [assets]);

  const toggleTest = (id) => {
    setExpandedTests(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Derive Key Findings from current stress results
  const derivedKeyFindings = useMemo(() => {
    if (!stressResults.length) return null;
    // Worst = scenario with most negative drawdown
    const worst = stressResults.reduce(
      (acc, r) => (r.portfolio_drawdown_pct < acc.portfolio_drawdown_pct ? r : acc),
      stressResults[0]
    );
    // Lower-downside = scenario with smallest absolute drawdown
    const lowerDownside = stressResults.reduce(
      (acc, r) => (Math.abs(r.portfolio_drawdown_pct) < Math.abs(acc.portfolio_drawdown_pct) ? r : acc),
      stressResults[0]
    );
    // Most sensitive = pick from worst scenario
    return { worst, lowerDownside, mostSensitive: worst.most_sensitive_class };
  }, [stressResults]);

  const handleCopyAI = () => {
    const text = aiSummary?.summary || MOCK_AI_COMMENTARY;
    navigator.clipboard.writeText(text);
    setCopiedAI(true);
    setTimeout(() => setCopiedAI(false), 2000);
  };

  // Convert frontend asset shape (camelCase) → backend API payload (snake_case fields).
  const _toApiAsset = (a) => ({
    symbol: a.symbol,
    name: a.name || null,
    category: a.category || 'stock',
    weight: typeof a.weight === 'number' ? a.weight : parseFloat(a.weight) || 0,
    entry_price: a.entryPrice ?? null,
    current_price: a.currentPrice ?? null,
    risk: a.risk || null,
  });

  const handleAddAsset = async (assetData) => {
    if (user && !usingDemo) {
      // Persist to backend
      try {
        const resp = await apiService.addPortfolioAsset(_toApiAsset(assetData));
        if (resp?.success && resp.asset) {
          setAssets(prev => [...prev, resp.asset]);
          return;
        }
      } catch (e) {
        console.error('addPortfolioAsset failed, falling back to local state:', e);
      }
    }
    // Anonymous / demo / API fallback: keep local state
    setAssets(prev => [...prev, { ...assetData, id: Date.now() }]);
  };

  const handleEditAsset = async (assetData) => {
    if (!editingAsset) return;
    if (user && !usingDemo) {
      try {
        const resp = await apiService.updatePortfolioAsset(editingAsset.id, _toApiAsset(assetData));
        if (resp?.success && resp.asset) {
          setAssets(prev => prev.map(a => (a.id === editingAsset.id ? resp.asset : a)));
          setEditingAsset(null);
          return;
        }
      } catch (e) {
        console.error('updatePortfolioAsset failed, falling back to local state:', e);
      }
    }
    setAssets(prev => prev.map(asset =>
      asset.id === editingAsset.id ? { ...asset, ...assetData } : asset
    ));
    setEditingAsset(null);
  };

  const handleDeleteAsset = async (assetId) => {
    const targetAsset = assets.find(asset => asset.id === assetId);
    if (!targetAsset) return;
    if (!window.confirm(`Delete ${targetAsset.symbol} from portfolio?`)) return;

    if (user && !usingDemo) {
      try {
        const resp = await apiService.deletePortfolioAsset(assetId);
        if (resp?.success) {
          setAssets(prev => prev.filter(asset => asset.id !== assetId));
          if (editingAsset?.id === assetId) setEditingAsset(null);
          return;
        }
      } catch (e) {
        console.error('deletePortfolioAsset failed, falling back to local state:', e);
      }
    }
    setAssets(prev => prev.filter(asset => asset.id !== assetId));
    if (editingAsset?.id === assetId) setEditingAsset(null);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <AddAssetModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddAsset}
      />
      <AddAssetModal
        isOpen={Boolean(editingAsset)}
        onClose={() => setEditingAsset(null)}
        onSubmit={handleEditAsset}
        initialAsset={editingAsset}
        mode="edit"
      />

      {/* ═══ RISK RIBBON — sticky compliance reminder + methodology gateway ═══ */}
      <div className="sticky top-0 z-30 mb-6 border-b border-border bg-background/85 backdrop-blur">
        <div className="py-2 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            <span className="text-foreground/90">Analytical observations only.</span> Not investment advice.
          </span>
          <button
            onClick={() => openDrawer('overview')}
            className="text-foreground/90 hover:text-foreground underline-offset-4 hover:underline"
          >
            Methodology ›
          </button>
        </div>
      </div>

      {/* ═══ PAGE HEADER ═══ */}
      <div className="mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <Shield className="h-8 w-8 text-primary" />
            Portfolio Risk &amp; Scenario Intelligence
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            {assets.length} {assets.length === 1 ? 'holding' : 'holdings'} · refreshed live
          </p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary/50 transition-colors">
            <Upload className="h-4 w-4" /> CSV
          </button>
        </div>
      </div>

      {/* ═══ SECTION 1: HEALTH HERO (left, half-width) + RISK SUMMARY STACK (right) ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-8">
        {/* Left: compact Portfolio Health hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`bg-card border ${healthCfg.border} rounded-2xl p-5 h-full`}
        >
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className={`relative flex-shrink-0 ${healthCfg.color}`}>
              <svg
                viewBox="0 0 36 36"
                width="76"
                height="76"
                style={{ transform: 'rotate(-90deg)', display: 'block' }}
              >
                <circle cx="18" cy="18" r="15.915" fill="none" stroke="currentColor" strokeOpacity={0.2} strokeWidth="2.5" />
                <circle
                  cx="18" cy="18" r="15.915"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeDasharray={`${typeof health.score === 'number' ? health.score : 0} 100`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold tabular-nums leading-none">
                  {healthLoading ? '…' : (health.score ?? '—')}
                </span>
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground mt-0.5">/ 100</span>
              </div>
            </div>

            <div className="flex-1 min-w-0 w-full">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Portfolio Health</p>
                  <p className={`text-lg font-semibold mt-0.5 ${healthCfg.color}`}>{health.status}</p>
                </div>
                <button
                  onClick={() => openDrawer('health')}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex-shrink-0"
                >
                  How calculated ›
                </button>
              </div>

              <div className="space-y-2">
                {Object.entries(health.factors).map(([key, factor]) => {
                  const fCfg = FACTOR_STATUS[factor.status] || FACTOR_STATUS.warning;
                  const FIcon = fCfg.icon;
                  const anchor = key === 'correlation' ? 'correlation' : 'health';
                  return (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <FIcon className={`h-3.5 w-3.5 flex-shrink-0 ${fCfg.color}`} />
                      <span className="text-foreground font-medium flex-shrink-0 w-28 truncate" title={factor.label}>{factor.label}</span>
                      <span className="text-[11px] text-muted-foreground flex-1 min-w-0 truncate" title={factor.detail}>{factor.detail}</span>
                      <button
                        onClick={() => openDrawer(anchor)}
                        className="text-[11px] text-muted-foreground hover:text-foreground flex-shrink-0"
                      >
                        methodology ›
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right: 4 summary cards stacked */}
        <div className="grid grid-cols-1 gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Total value</p>
            <p className="text-2xl font-semibold tabular-nums mt-1">{formatCurrency(totalValue)}</p>
            <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
              <TrendingUp className="h-3.5 w-3.5" /> +3.2% · 24h
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Worst-case scenario</p>
            {worstCaseScenario ? (
              <>
                <p className="text-2xl font-semibold tabular-nums text-red-400 mt-1">
                  {formatPercent(worstCaseScenario.portfolio_drawdown_pct)}
                </p>
                <p className="text-xs text-muted-foreground mt-1 truncate" title={worstCaseScenario.scenario_name}>
                  {worstCaseScenario.scenario_name || 'modeled drawdown'}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums text-muted-foreground mt-1">—</p>
                <p className="text-xs text-muted-foreground mt-1">Stress results loading…</p>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Diversification</p>
            {diversificationScore ? (
              <>
                <p className="text-2xl font-semibold tabular-nums mt-1">{diversificationScore.value.toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-1">{diversificationScore.label} · 1 − mean |ρ|</p>
              </>
            ) : (
              <>
                <p className="text-2xl font-semibold tabular-nums text-muted-foreground mt-1">—</p>
                <p className="text-xs text-muted-foreground mt-1">Need ≥2 priced holdings</p>
              </>
            )}
          </div>

          <button
            onClick={() => openDrawer('overview')}
            className="rounded-2xl border border-border bg-card hover:bg-secondary/50 p-4 text-left transition-colors flex flex-col justify-center items-start gap-1"
          >
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Transparency</span>
            <span className="text-sm text-foreground/90">How this is calculated ›</span>
          </button>
        </div>
      </div>

      {/* ═══ SECTION 2: AI OBSERVATIONS — TL;DR position per redesign mock ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-2xl p-6 mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <Brain className="h-[18px] w-[18px] text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">AI Observations</h2>
              <p className="text-xs text-muted-foreground">
                {aiSummary?.source === 'ai'
                  ? `Powered by Safeguard AI${aiSummary.cached ? ' · cached' : ''}`
                  : aiSummary?.source === 'template'
                    ? 'Rule-based analysis (AI offline)'
                    : 'Powered by Safeguard AI'}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopyAI}
              disabled={!aiSummary?.summary && !aiLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-secondary/50 transition-colors disabled:opacity-40"
            >
              {copiedAI ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedAI ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={() => setAiRefreshTick(t => t + 1)}
              disabled={aiLoading || !assets.length}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-secondary/50 transition-colors disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${aiLoading ? 'animate-spin' : ''}`} />
              {aiLoading ? 'Generating…' : 'Regenerate'}
            </button>
          </div>
        </div>

        <div className="border-l-2 border-purple-500/40 pl-5 space-y-3">
          {!assets.length ? (
            <p className="text-sm text-muted-foreground italic">
              Add at least one asset to generate an analysis.
            </p>
          ) : aiLoading && !aiSummary ? (
            <p className="text-sm text-muted-foreground italic">
              Generating analysis from your portfolio composition…
            </p>
          ) : aiError && !aiSummary ? (
            <p className="text-sm text-red-400">{aiError}</p>
          ) : aiSummary?.summary ? (
            aiSummary.summary.split('\n\n').map((paragraph, i) => (
              <p key={i} className="text-sm text-foreground/85 leading-relaxed">
                {paragraph}
              </p>
            ))
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Waiting for portfolio data…
            </p>
          )}
        </div>

        <p className="text-[11px] text-muted-foreground mt-5">
          Generated from your portfolio composition. Observational only — never advisory.
        </p>
      </motion.div>

      {/* ═══ SECTION 3: YOUR ASSETS — pie + table per mock ═══ */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
        className="mb-8"
      >
        <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <PieChart className="h-[18px] w-[18px] text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Your Assets</h2>
              <p className="text-xs text-muted-foreground">
                {assets.length} {assets.length === 1 ? 'holding' : 'holdings'} · cost-basis weights · prices auto-refresh every 60s
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex gap-1 p-0.5 rounded-lg border border-border bg-card">
              <button
                onClick={() => setChartView('pie')}
                aria-selected={chartView === 'pie'}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  chartView === 'pie' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <PieChart className="h-3 w-3" /> Pie
                </span>
              </button>
              <button
                onClick={() => setChartView('list')}
                aria-selected={chartView === 'list'}
                className={`px-3 py-1.5 text-xs rounded-md transition-colors ${
                  chartView === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="inline-flex items-center gap-1.5">
                  <List className="h-3 w-3" /> List
                </span>
              </button>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="rounded-lg bg-primary text-primary-foreground px-3 py-2 text-xs font-medium hover:bg-primary/90 transition-colors flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" /> Add asset
            </button>
          </div>
        </header>

        {(() => {
          const totalWeight = assets.reduce((s, a) => s + (a.weight || 0), 0) || 1;
          // Cost-basis convention (entryPrice × weight) — matches totalValue and the
          // 92%-vs-... HHI/concentration math used everywhere else on the page.
          const costByAsset = assets.map(a => (a.entryPrice || 0) * (a.weight || 0));
          const totalCost = costByAsset.reduce((s, v) => s + v, 0) || 1;
          let cumulative = 0;
          const slices = assets.map((a, i) => {
            const value = costByAsset[i];
            const pct = (value / totalCost) * 100;
            const seg = { ...a, pct, value, color: symbolColor[a.symbol] || SLICE_COLORS[i % SLICE_COLORS.length], offset: -cumulative };
            cumulative += pct;
            return seg;
          });
          const sortedByValue = [...slices].sort((a, b) => b.value - a.value);
          const maxAssetValue = Math.max(1, ...sortedByValue.map(s => s.value));

          return (
            <div className={chartView === 'list' ? '' : 'grid grid-cols-1 lg:grid-cols-[1fr_1fr_2fr] gap-4'}>
              {chartView !== 'list' && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">Allocation</div>
                  <div className="flex items-center justify-center mb-4">
                    <svg viewBox="0 0 42 42" width="150" height="150">
                      <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="hsl(220 8% 24%)" strokeWidth="6" />
                      {slices.map(s => (
                        <circle
                          key={s.symbol}
                          cx="21" cy="21" r="15.915"
                          fill="transparent"
                          stroke={s.color}
                          strokeWidth="6"
                          strokeDasharray={`${s.pct} ${100 - s.pct}`}
                          strokeDashoffset={s.offset}
                          transform="rotate(-90 21 21)"
                        />
                      ))}
                      <text x="21" y="20" textAnchor="middle" fontSize="3.6" fill="currentColor" className="text-foreground" fontWeight="600">
                        {formatCurrency(totalValue)}
                      </text>
                      <text x="21" y="24" textAnchor="middle" fontSize="2.2" fill="currentColor" className="text-muted-foreground">
                        Total
                      </text>
                    </svg>
                  </div>
                  <div className="grid grid-cols-2 gap-y-1 text-[11px]">
                    {slices.map(s => (
                      <div key={s.symbol} className="flex items-center gap-1.5 min-w-0">
                        <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                        <span className="truncate">{s.symbol}</span>
                        <span className="tabular-nums text-muted-foreground ml-auto">{Math.round(s.pct)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {chartView !== 'list' && (
                <div className="rounded-2xl border border-border bg-card p-5">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">By holdings value</div>
                  <div className="space-y-2">
                    {sortedByValue.map(s => (
                      <div key={s.symbol} className="grid grid-cols-[36px_1fr_60px] items-center gap-2 text-xs">
                        <span className="font-medium truncate">{s.symbol}</span>
                        <div className="h-3 rounded-sm" style={{ width: `${(s.value / maxAssetValue) * 100}%`, background: s.color, minWidth: 4 }} />
                        <span className="text-right tabular-nums text-muted-foreground">
                          {s.value >= 1000 ? `$${(s.value / 1000).toFixed(0)}k` : formatCurrency(s.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-2xl border border-border bg-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wider text-muted-foreground text-left">
                      <th className="font-normal px-5 py-3">Asset</th>
                      <th className="font-normal py-3 text-right">Quantity</th>
                      <th className="font-normal py-3 text-right">Entry</th>
                      <th className="font-normal py-3 text-right">Current</th>
                      <th className="font-normal py-3 text-right">Holdings</th>
                      <th className="font-normal py-3 text-right">P/L</th>
                      <th className="font-normal py-3 pr-5 text-right">Risk</th>
                      <th className="font-normal py-3 pr-5 text-right" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {assets.map(a => {
                      // Holdings = cost basis (entryPrice × quantity) — matches
                      // totalValue, mock convention, and the bar chart above.
                      const value = (a.entryPrice || 0) * (a.weight || 0);
                      const plPct = a.entryPrice > 0
                        ? ((a.currentPrice - a.entryPrice) / a.entryPrice) * 100
                        : 0;
                      const riskClass = a.risk === 'HIGH'
                        ? 'bg-red-500/15 text-red-400'
                        : a.risk === 'LOW'
                          ? 'bg-green-500/15 text-green-400'
                          : 'bg-orange-400/15 text-orange-400';
                      const icon = a.category === 'crypto' ? '₿'
                        : a.category === 'futures' ? '🥇'
                        : a.category === 'forex' ? '💱'
                        : '📈';
                      return (
                        <tr key={a.id || a.symbol} className="hover:bg-secondary/30 transition-colors">
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-base">{icon}</span>
                              <div>
                                <div>{a.symbol}</div>
                                <div className="text-[10px] text-muted-foreground">{a.name} · {a.category}</div>
                              </div>
                            </div>
                          </td>
                          <td className="tabular-nums py-3 text-right">{a.weight}</td>
                          <td className="tabular-nums py-3 text-right">{formatCurrency(a.entryPrice)}</td>
                          <td className="tabular-nums py-3 text-right">{formatCurrency(a.currentPrice)}</td>
                          <td className="tabular-nums py-3 text-right">{formatCurrency(value)}</td>
                          <td className={`tabular-nums py-3 text-right ${plPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatPercent(plPct)}
                          </td>
                          <td className="py-3 pr-5 text-right">
                            <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${riskClass}`}>
                              {a.risk}
                            </span>
                          </td>
                          <td className="py-3 pr-5 text-right text-xs whitespace-nowrap">
                            <button onClick={() => setEditingAsset(a)} className="text-muted-foreground hover:text-foreground mr-2">Edit</button>
                            <button onClick={() => handleDeleteAsset(a.id)} className="text-muted-foreground hover:text-red-400">Del</button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })()}
      </motion.section>

      {/* ═══ SECTION 4: STRESS TESTS (live engine) — mock-style icon-chip header ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-orange-400/10 flex items-center justify-center">
              <Zap className="h-[18px] w-[18px] text-orange-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Stress Test Scenarios</h2>
              <p className="text-xs text-muted-foreground">
                Multi-module library · modeled drawdowns, not forecasts
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {stressLoading && (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3 animate-spin" /> Loading…
              </span>
            )}
            <button
              onClick={() => openDrawer('drawdown')}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              How calculated ›
            </button>
          </div>
        </div>

        {/* Module selector tabs */}
        <div className="flex flex-wrap gap-2 mb-5 bg-card/40 border border-border rounded-xl p-1.5">
          {STRESS_MODULES.map(m => (
            <button
              key={m.id}
              onClick={() => setSelectedStressModule(m.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                selectedStressModule === m.id
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/40'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {selectedStressModule === 'reverse_stress' ? (
          <ReverseStressPanel
            threshold={reverseThreshold}
            setThreshold={setReverseThreshold}
            result={reverseResult}
            loading={reverseLoading}
            error={reverseError}
            assets={assets}
            onRun={async () => {
              setReverseLoading(true);
              setReverseError(null);
              try {
                // Convert raw quantity → derived weight % for accurate stress attribution
                const totalValue = assets.reduce((s, a) => s + (a.entryPrice || 0) * (a.weight || 0), 0);
                const portfolio = assets.map(a => {
                  const value = (a.entryPrice || 0) * (a.weight || 0);
                  return {
                    symbol: a.symbol,
                    name: a.name,
                    category: a.category,
                    weight: totalValue > 0 ? (value / totalValue) * 100 : 0,
                  };
                });
                const resp = await apiService.runReverseStress(portfolio, reverseThreshold);
                if (resp?.success) {
                  setReverseResult(resp);
                } else {
                  setReverseError('Unexpected API response shape');
                }
              } catch (e) {
                setReverseError(e.message || 'Failed to run reverse stress');
              } finally {
                setReverseLoading(false);
              }
            }}
          />
        ) : (
          <>
        {/* Error / Empty state */}
        {stressError && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300 mb-4">
            Stress engine error: {stressError}
          </div>
        )}
        {!stressLoading && !stressError && stressResults.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
            {assets.length === 0 ? 'Add at least one asset to run stress tests.' : 'No scenarios available for this module.'}
          </div>
        )}

        {/* Mock-style scenario rows: divide-y, expandable, w/ horizontal drawdown bars */}
        <div className="rounded-2xl border border-border bg-card divide-y divide-border overflow-hidden">
          {stressResults.map((r, i) => {
            const dd = r.portfolio_drawdown_pct ?? 0;
            const open = !!expandedTests[r.scenario_id];
            // Color bar intensity scales with drawdown severity
            const barColor = dd >= 0
              ? 'bg-green-500/40'
              : dd > -5
                ? 'bg-orange-400/40'
                : dd > -15
                  ? 'bg-orange-400/70'
                  : dd > -25
                    ? 'bg-red-500/60'
                    : 'bg-red-500/80';
            // Source-type badge
            const badgeColor = r.source_type === 'replay'
              ? 'border-blue-500/40 text-blue-300'
              : r.source_type === 'replay_with_proxy'
                ? 'border-orange-400/40 text-orange-300'
                : r.source_type === 'synthetic'
                  ? 'border-amber-400/40 text-amber-300'
                  : r.source_type === 'factor'
                    ? 'border-emerald-400/40 text-emerald-300'
                    : 'border-border text-muted-foreground';
            // Sparkline path: direction reflects sign (gain rises, loss falls),
            // amplitude scales with magnitude. y is inverted in SVG (y=0 is top).
            const amp = Math.min(15, Math.abs(dd));
            const sign = dd >= 0 ? -1 : 1;       // negative dy = visually rising
            const startY = dd >= 0 ? 17 : 5;     // start near floor for gains, near ceiling for losses
            const sparkPath = [0, 10, 20, 30, 40, 50, 60, 70, 80]
              .map((x, j) => `${j === 0 ? 'M' : 'L'}${x} ${(startY + sign * amp * j / 8).toFixed(1)}`)
              .join(' ');
            const sparkColor = dd >= 0 ? 'text-green-400' : dd > -10 ? 'text-orange-400' : 'text-red-400';
            const ddColor = dd >= 0 ? 'text-green-400' : dd > -5 ? 'text-orange-400' : 'text-red-400';

            return (
              <div key={r.scenario_id} className={open ? '' : ''}>
                <button
                  onClick={() => toggleTest(r.scenario_id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-secondary/20 transition-colors"
                >
                  <span className={`w-1.5 h-8 rounded-full flex-shrink-0 ${barColor}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground truncate">{r.scenario_name}</span>
                      {r.period && (
                        <span className="text-[11px] text-muted-foreground">{r.period}</span>
                      )}
                      {r.disclosure_label && (
                        <span className={`text-[10px] uppercase tracking-wider border rounded-full px-2 py-0.5 ${badgeColor}`}>
                          {r.disclosure_label}
                        </span>
                      )}
                    </div>
                    {r.description && (
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{r.description}</div>
                    )}
                  </div>
                  <svg className={`hidden sm:block ${sparkColor}`} width="80" height="22" viewBox="0 0 80 22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d={sparkPath} />
                  </svg>
                  <div className="text-right flex-shrink-0">
                    <div className={`tabular-nums text-lg font-semibold ${ddColor}`}>{formatPercent(dd)}</div>
                    <div className="text-[10px] text-muted-foreground">portfolio impact</div>
                  </div>
                  {open
                    ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                    : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  }
                </button>

                <AnimatePresence>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-5 pb-5">
                        {(() => {
                          const rows = r.per_asset_breakdown || [];
                          const enriched = rows.map(row => {
                            const current = (row.weight_pct / 100) * (totalValue || 0);
                            const stressedRaw = current * (1 + (row.shock_pct ?? 0) / 100);
                            const stressed = Math.max(0, stressedRaw);
                            return { ...row, current, stressed, delta: stressed - current };
                          });
                          const maxVal = Math.max(1, ...enriched.flatMap(x => [x.current, Math.abs(x.stressed)]));
                          const stressedTotal = enriched.reduce((s, x) => s + x.stressed, 0) || 1;
                          // Post-shock allocation slices for the pie
                          let cum = 0;
                          const stressedSlices = enriched.map(row => {
                            const pct = (row.stressed / stressedTotal) * 100;
                            const seg = {
                              symbol: row.symbol,
                              pct,
                              color: symbolColor[row.symbol] || '#64748b',
                              offset: -cum,
                            };
                            cum += pct;
                            return seg;
                          });

                          return (
                            <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr_1fr] gap-4">
                              {/* Post-shock allocation pie */}
                              <div className="rounded-xl border border-border bg-secondary/20 p-4">
                                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
                                  Post-shock allocation
                                </div>
                                <div className="flex items-center justify-center mb-3">
                                  <svg viewBox="0 0 42 42" width="120" height="120">
                                    <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="hsl(220 8% 24%)" strokeWidth="6" />
                                    {stressedSlices.map(s => (
                                      <circle
                                        key={s.symbol}
                                        cx="21" cy="21" r="15.915"
                                        fill="transparent"
                                        stroke={s.color}
                                        strokeWidth="6"
                                        strokeDasharray={`${s.pct} ${100 - s.pct}`}
                                        strokeDashoffset={s.offset}
                                        transform="rotate(-90 21 21)"
                                      />
                                    ))}
                                    <text x="21" y="20" textAnchor="middle" fontSize="3" fill="currentColor" className="text-foreground" fontWeight="600">
                                      {formatCurrency(stressedTotal)}
                                    </text>
                                    <text x="21" y="24" textAnchor="middle" fontSize="2" fill="currentColor" className="text-muted-foreground">
                                      Post-shock
                                    </text>
                                  </svg>
                                </div>
                                <div className="text-[11px] tabular-nums text-muted-foreground text-center mb-3">
                                  <span className="text-foreground/90">{formatCurrency(totalValue)}</span>
                                  <span className="mx-1.5 text-muted-foreground/60">→</span>
                                  <span className={dd >= 0 ? 'text-green-400' : 'text-red-400'}>{formatCurrency(stressedTotal)}</span>
                                </div>
                                <div className="space-y-1 text-[11px]">
                                  {stressedSlices.map(s => (
                                    <div key={s.symbol} className="flex items-center gap-1.5 min-w-0">
                                      <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: s.color }} />
                                      <span className="truncate">{s.symbol}</span>
                                      <span className="tabular-nums text-muted-foreground ml-auto">{Math.round(s.pct)}%</span>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Per-asset paired bars (current vs stressed) */}
                              <div className="rounded-xl border border-border bg-secondary/20 p-4">
                                <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
                                  Per-asset · current vs stressed value
                                </div>
                                <div className="space-y-3">
                                  {enriched
                                    .slice()
                                    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
                                    .map(row => {
                                      const c = symbolColor[row.symbol] || '#64748b';
                                      const cw = (row.current / maxVal) * 100;
                                      const sw = (Math.abs(row.stressed) / maxVal) * 100;
                                      const positive = row.delta >= 0;
                                      return (
                                        <div key={row.symbol} className="grid grid-cols-[50px_1fr_110px] items-center gap-3">
                                          <div className="text-xs font-medium text-foreground truncate">{row.symbol}</div>
                                          <div className="space-y-1.5">
                                            <div className="h-2 rounded-sm" style={{ width: `${cw}%`, background: c }} title={`Current ${formatCurrency(row.current)}`} />
                                            <div className="h-2 rounded-sm" style={{ width: `${sw}%`, background: `${c}55` }} title={`Stressed ${formatCurrency(row.stressed)} · ${formatPercent(row.shock_pct ?? 0)}`} />
                                          </div>
                                          <div className="text-right text-xs tabular-nums">
                                            <div className={`font-medium ${positive ? 'text-green-400' : 'text-red-400'}`}>
                                              {positive ? '+' : ''}{formatCurrency(row.delta)}
                                            </div>
                                            <div className={`text-[11px] ${positive ? 'text-green-400/80' : 'text-red-400/80'}`}>
                                              {formatPercent(row.shock_pct ?? 0)}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })}
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-4 pt-3 border-t border-border">
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3 h-1.5 rounded-sm bg-foreground/80" />Current
                                  </span>
                                  <span className="inline-flex items-center gap-1.5">
                                    <span className="w-3 h-1.5 rounded-sm bg-foreground/30" />Under stress
                                  </span>
                                </div>
                              </div>

                              {/* Sidebar: damage / buffer / sensitivity / source */}
                              <div className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3 text-sm">
                                <div>
                                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Main damage driver</div>
                                  <div className="text-foreground/85">{r.main_damage_driver || '—'}</div>
                                </div>
                                <div>
                                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Buffer</div>
                                  <div className="text-foreground/85">{r.buffer_contributor || '—'}</div>
                                </div>
                                <div>
                                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Sensitivity</div>
                                  <div className="text-foreground/85">{r.most_sensitive_class || '—'}</div>
                                </div>
                                {r.disclosure_text && (
                                  <div className="pt-2 border-t border-border text-[11px] text-muted-foreground">
                                    {r.disclosure_text}
                                  </div>
                                )}
                                <button
                                  onClick={() => openDrawer('drawdown')}
                                  className="block text-[11px] text-foreground/80 hover:text-foreground"
                                >
                                  View methodology ›
                                </button>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {/* Module-level source footer */}
        {stressResults.length > 0 && (
          <div className="text-[11px] text-muted-foreground mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Source: Polygon previous-close · asset-class shocks calibrated from observed peak-to-trough returns</span>
            <span className="opacity-50">·</span>
            <button onClick={() => openDrawer('drawdown')} className="text-foreground/80 hover:text-foreground">
              View methodology
            </button>
          </div>
        )}
          </>
        )}
      </motion.div>

      {/* ═══ SECTION 5: DIVERSIFICATION MATRIX (Correlation) — mock-style icon-chip header ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-green-500/10 flex items-center justify-center">
              <Activity className="h-[18px] w-[18px] text-green-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">Diversification Matrix</h2>
              <p className="text-xs text-muted-foreground">Pairwise correlation · 180-day window</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {correlationLoading && (
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <RefreshCw className="h-3 w-3 animate-spin" /> Loading…
              </span>
            )}
            <button
              onClick={() => openDrawer('correlation')}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              How calculated ›
            </button>
          </div>
        </div>
        {(() => {
          if (correlationError) {
            return (
              <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300">
                Correlation engine error: {correlationError}
              </div>
            );
          }
          if (!correlationData?.success || !correlationData?.matrix?.length) {
            return (
              <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                {correlationLoading
                  ? 'Computing pairwise correlation…'
                  : assets.length < 2
                    ? 'Need at least 2 holdings with overlapping price history.'
                    : 'No correlation data available.'}
              </div>
            );
          }
          const symbols = correlationData.symbols || [];
          const matrix = correlationData.matrix;
          // Color-grade per |ρ|: positive → orange/red ramp, negative → green ramp, near 0 → muted
          const cellStyle = (v) => {
            if (v === null || v === undefined) return { background: 'transparent', color: 'inherit' };
            if (Math.abs(v) < 0.1) return { background: 'hsl(220 8% 30% / 0.35)', color: '#cbd5e1' };
            if (v > 0) {
              const intensity = Math.min(0.5, Math.abs(v) * 0.55);
              const hue = v > 0.7 ? '0 72% 60%' : '36 92% 60%';
              return { background: `hsl(${hue} / ${intensity})`, color: v > 0.7 ? '#fef2f2' : '#fff7ed' };
            }
            return { background: `hsl(152 56% 50% / ${Math.min(0.45, Math.abs(v) * 0.55)})`, color: '#d1fae5' };
          };
          const hp = correlationData.diagnostics?.highest_pair;
          const bd = correlationData.diagnostics?.best_diversifier;
          return (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
                <div className="rounded-2xl border border-border bg-card p-5 overflow-x-auto">
                  <table className="w-full text-xs" style={{ borderSpacing: '4px', borderCollapse: 'separate' }}>
                    <thead>
                      <tr>
                        <th />
                        {symbols.map(s => (
                          <th key={s} className="text-[11px] text-muted-foreground py-1 text-center">{s}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {symbols.map((rowSym, ri) => (
                        <tr key={rowSym}>
                          <th className="text-right text-[11px] text-muted-foreground pr-2">{rowSym}</th>
                          {symbols.map((colSym, ci) => {
                            if (ri === ci) {
                              return <td key={colSym} className="text-center text-muted-foreground/60">·</td>;
                            }
                            const v = matrix[ri][ci];
                            return (
                              <td key={colSym} className="text-center rounded px-1.5 py-1" style={cellStyle(v)}>
                                {v >= 0 ? v.toFixed(2) : '−' + Math.abs(v).toFixed(2)}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="mt-5 flex items-center gap-3">
                    <span className="text-[11px] text-muted-foreground">Independent</span>
                    <div className="flex-1 h-2 rounded-full" style={{ background: 'linear-gradient(to right, hsl(152 56% 50%), hsl(220 8% 35%), hsl(36 92% 60%), hsl(0 72% 60%))' }} />
                    <span className="text-[11px] text-muted-foreground">Lockstep</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Most concentrated pair</div>
                    {hp ? (
                      <>
                        <div className="text-lg font-semibold tabular-nums">{hp.a} ↔ {hp.b} · {hp.corr.toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {Math.abs(hp.corr) > 0.7
                            ? 'Strongly co-moves — diversifying away from one means similar exposure remains.'
                            : 'Moderate co-movement.'}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">—</div>
                    )}
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-4">
                    <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Strongest diversifier</div>
                    {bd ? (
                      <>
                        <div className="text-lg font-semibold tabular-nums text-green-400">
                          {bd.symbol} · {bd.avg_corr_excluding_self >= 0 ? '' : '−'}{Math.abs(bd.avg_corr_excluding_self).toFixed(2)} avg
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Lowest mean pairwise correlation — most independent component of the portfolio.
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground">—</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-muted-foreground mt-4 flex items-center gap-3">
                <span>Source: Polygon daily returns · {correlationData.n_observations} obs · {correlationData.window_days}-day window</span>
                <span className="opacity-50">·</span>
                <button onClick={() => openDrawer('correlation')} className="text-foreground/80 hover:text-foreground">
                  View methodology
                </button>
              </div>
            </>
          );
        })()}
      </motion.div>

      {/* ═══ PAGE FOOTER DISCLAIMER (mock parity) ═══ */}
      <footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
        Safeguard provides analytical observations only. Nothing on this page is investment advice.
        All figures are modeled scenarios derived from your portfolio composition; past observations do not predict future returns.
        <button
          onClick={() => openDrawer('overview')}
          className="text-foreground/80 hover:text-foreground ml-1"
        >
          Methodology ›
        </button>
      </footer>

      {/* ═══ METHODOLOGY DRAWER — single transparency surface for all factors ═══ */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 transition-opacity"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`fixed top-0 right-0 bottom-0 w-full max-w-[480px] bg-card border-l border-border z-50 overflow-y-auto transition-transform duration-200 ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!drawerOpen}
      >
        <div className="sticky top-0 bg-card/95 backdrop-blur border-b border-border p-5 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Methodology</p>
            <p className="text-base font-semibold mt-0.5">How this is calculated</p>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="text-muted-foreground hover:text-foreground p-1"
            aria-label="Close methodology drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-5 text-sm leading-relaxed">
          {drawerSection === 'overview' && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Overview</h3>
              <p className="text-foreground/85">
                Every number on this page is reproducible from the portfolio composition and a small
                set of historical-data lookups. There is no opaque ML model. The engine answers a
                single question: <em>if a specific historical or hypothetical event happened today,
                how would this portfolio behave?</em>
              </p>
            </section>
          )}

          {drawerSection === 'health' && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Portfolio Health composite</h3>
              <p className="text-foreground/85">
                A 0–100 score derived from five independent dimensions. Each dimension produces a
                sub-score (0 = severe, 100 = ideal); the composite is the equally-weighted mean of
                whichever sub-scores have data. <span className="text-orange-400">Stressed</span>{' '}
                = 50–79, <span className="text-red-400">Fragile</span> = below 50.
              </p>
              <ul className="list-disc list-outside pl-5 text-foreground/85 space-y-1.5 mt-2">
                <li><b>Concentration</b> — Herfindahl-Hirschman Index on holdings weights; HHI ≤ 0.10 → 100, ≥ 0.40 → 0.</li>
                <li><b>Correlation</b> — mean of absolute pairwise correlations from the 180-day window.</li>
                <li><b>Macro exposure</b> — class-level HHI (asset-class diversification, not factor-model exposure).</li>
                <li><b>Sentiment skew</b> — symmetric distance of aggregated social-signal mean from neutral; both extremes lower the score.</li>
                <li><b>Volatility</b> — weighted mean of (recent 30-day std / long 180-day std). Ratios well above 1 indicate volatility clustering.</li>
              </ul>
              <p className="text-muted-foreground mt-2">
                Soft-failed factors (no posts, insufficient price history) are excluded from the
                composite mean rather than counted as zero, so cold-start data gaps do not unfairly
                drag the score to Fragile.
              </p>
            </section>
          )}

          {drawerSection === 'correlation' && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Pairwise correlation</h3>
              <p className="text-foreground/85">
                For each pair of assets, compute the Pearson correlation of their daily returns over
                a 180-day trailing window. Cells closer to <span className="text-red-400">+1</span>{' '}
                = move in lockstep; closer to <span className="text-green-400">−1</span> = move
                opposite; near 0 = independent.
              </p>
              <p className="text-muted-foreground mt-2">
                Past correlations do not predict future correlations — this is observation, not
                forecast. Correlations historically rise sharply during market stress.
              </p>
            </section>
          )}

          {drawerSection === 'drawdown' && (
            <section>
              <h3 className="text-sm font-semibold mb-2">Modeled drawdown</h3>
              <p className="text-foreground/85">
                For each holding <span className="tabular-nums">i</span>:{' '}
                <code className="text-xs bg-secondary/50 px-1.5 py-0.5 rounded">
                  contribution_i = weight_i × shock_i
                </code>
                . Portfolio drawdown is the sum across holdings.
              </p>
              <p className="text-muted-foreground mt-2">
                Per-asset shocks come from the chosen scenario's calibrated table — historical
                peak-to-trough returns, factor-loading projections, or directly user-defined shock
                magnitudes.
              </p>
            </section>
          )}

          <p className="text-[11px] text-muted-foreground pt-2 border-t border-border">
            Implementation: backend/application/services/ — portfolio_health.py, correlation_engine.py,
            stress_engine.py
          </p>
        </div>
      </aside>
    </div>
  );
}
