import React, { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Plus, Upload, TrendingUp,
  AlertTriangle, Activity, Brain, ChevronDown, ChevronUp,
  RefreshCw, Copy, Check, Zap, Target,
  X, Search, Info
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
  { id: 1, symbol: 'BTC',  name: 'Bitcoin',        category: 'crypto',  weight: 25, entryPrice: 42000, currentPrice: 79534, risk: 'HIGH' },
  { id: 2, symbol: 'AAPL', name: 'Apple Inc.',     category: 'stock',   weight: 20, entryPrice: 178,   currentPrice: 213,   risk: 'LOW' },
  { id: 3, symbol: 'Gold', name: 'Gold',           category: 'futures', weight: 25, entryPrice: 1950,  currentPrice: 2340,  risk: 'LOW' },
  { id: 4, symbol: 'ETH',  name: 'Ethereum',       category: 'crypto',  weight: 15, entryPrice: 2200,  currentPrice: 3180,  risk: 'HIGH' },
  { id: 5, symbol: 'MSFT', name: 'Microsoft Corp.',category: 'stock',   weight: 15, entryPrice: 380,   currentPrice: 425,   risk: 'MEDIUM' },
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
  // v in [-1, 1]. Color band:
  //   v >= 0.7   → strong positive → red (concentration risk)
  //   v in [0.4, 0.7) → moderate positive → orange
  //   v in [0.1, 0.4) → weak positive → yellow
  //   v in [-0.1, 0.1) → near-zero → neutral gray
  //   v in [-0.4, -0.1) → weak negative → light green
  //   v < -0.4   → strong negative → dark green (good diversifier)
  if (v >= 0.7)  return 'bg-red-500/40 text-red-100';
  if (v >= 0.4)  return 'bg-orange-500/30 text-orange-100';
  if (v >= 0.1)  return 'bg-yellow-500/25 text-yellow-100';
  if (v >= -0.1) return 'bg-secondary/50 text-muted-foreground';
  if (v >= -0.4) return 'bg-emerald-500/25 text-emerald-100';
  return 'bg-emerald-600/45 text-emerald-50';
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

  const { symbols, matrix, diagnostics, n_observations, window_days, computed_at, skipped_symbols } = data;
  const n = symbols.length;
  if (n === 0) return null;

  return (
    <div className="space-y-4">
      {/* Heatmap */}
      <div className="bg-card border border-border rounded-2xl p-5 overflow-x-auto">
        <div className="inline-block min-w-full">
          <table className="text-xs font-mono">
            <thead>
              <tr>
                <th className="p-1.5 w-16"></th>
                {symbols.map((s) => (
                  <th key={s} className="p-1.5 text-foreground font-semibold text-center min-w-[64px]">
                    {s}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {symbols.map((rowSym, i) => (
                <tr key={rowSym}>
                  <th className="p-1.5 text-foreground font-semibold text-right pr-3">{rowSym}</th>
                  {matrix[i].map((v, j) => (
                    <td
                      key={j}
                      className={`p-1.5 text-center min-w-[64px] ${correlationCellStyle(v)}`}
                      title={`${rowSym} vs ${symbols[j]}: ${v.toFixed(3)}`}
                    >
                      {i === j ? '—' : v.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Color legend */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
          <span>Color scale:</span>
          <span className="flex items-center gap-1"><span className="w-4 h-3 bg-red-500/40 rounded-sm"></span>≥ 0.7 high concentration</span>
          <span className="flex items-center gap-1"><span className="w-4 h-3 bg-orange-500/30 rounded-sm"></span>0.4 – 0.7</span>
          <span className="flex items-center gap-1"><span className="w-4 h-3 bg-yellow-500/25 rounded-sm"></span>0.1 – 0.4</span>
          <span className="flex items-center gap-1"><span className="w-4 h-3 bg-secondary/50 rounded-sm"></span>≈ 0 (neutral)</span>
          <span className="flex items-center gap-1"><span className="w-4 h-3 bg-emerald-500/25 rounded-sm"></span>negative (diversifier)</span>
        </div>
      </div>

      {/* Narrative diagnostics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {diagnostics?.highest_pair && (
          <div className="bg-card border border-red-500/30 rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Most Concentrated Pair
            </p>
            <p className="text-sm font-bold text-foreground">
              {diagnostics.highest_pair.a} ↔ {diagnostics.highest_pair.b}
            </p>
            <p className="text-2xl font-bold text-red-400 mt-1">
              {diagnostics.highest_pair.corr.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              These two assets have moved {Math.abs(diagnostics.highest_pair.corr * 100).toFixed(0)}% in lockstep over the past {window_days} days. Holding both provides limited diversification.
            </p>
          </div>
        )}
        {diagnostics?.best_diversifier && (
          <div className="bg-card border border-emerald-500/30 rounded-xl p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">
              Strongest Diversifier
            </p>
            <p className="text-sm font-bold text-foreground">
              {diagnostics.best_diversifier.symbol}
            </p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">
              {diagnostics.best_diversifier.avg_corr_excluding_self.toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Average correlation with other holdings is the lowest. This asset reduced your portfolio's typical co-movement most over the window.
            </p>
          </div>
        )}
      </div>

      {/* Coverage + disclosure */}
      <div className="bg-muted/20 border border-border rounded-lg p-3 flex items-start gap-2">
        <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-muted-foreground" />
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            Computed from {n_observations} daily return observations across {window_days} calendar days.
            {skipped_symbols && skipped_symbols.length > 0 && (
              <span className="text-orange-300"> Skipped: {skipped_symbols.join(', ')} (no Polygon history).</span>
            )}
          </p>
          <p>
            {data.disclosure_text || 'Past correlations do not predict future correlations. This is observation, not forecast.'}
          </p>
        </div>
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

  useEffect(() => {
    if (!isOpen) return;

    if (initialAsset) {
      setSymbol(initialAsset.symbol || '');
      setName(initialAsset.name || '');
      setCategory(initialAsset.category || 'stock');
      setWeight(String(initialAsset.weight ?? ''));
      setEntryPrice(String(initialAsset.entryPrice ?? ''));
      setCurrentPrice(String(initialAsset.currentPrice ?? ''));
      // For edits, treat the existing risk as "user-set" so we don't auto-overwrite.
      setRisk(initialAsset.risk || inferRisk(initialAsset.symbol, initialAsset.category));
      setRiskOverridden(true);
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
              <label className="text-sm text-muted-foreground mb-1 block">Weight (%)</label>
              <input
                type="number"
                placeholder="e.g. 25"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                min="0" max="100"
                className="w-full px-4 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
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

export default function PortfolioPage() {
  const { user } = useAuth();
  const [assets, setAssets] = useState(MOCK_ASSETS);
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
  useEffect(() => {
    if (!assets.length) return;
    let cancelled = false;
    const refreshPrices = async () => {
      try {
        const updated = await Promise.all(assets.map(async (a) => {
          try {
            const resp = await apiService.getLatestPrice(a.symbol, a.category);
            if (resp?.success && resp.price != null) {
              return { ...a, currentPrice: resp.price };
            }
          } catch (_) { /* keep existing price on failure */ }
          return a;
        }));
        if (!cancelled) {
          // Avoid noisy re-renders: only update if any price actually changed.
          const changed = updated.some((u, i) => u.currentPrice !== assets[i].currentPrice);
          if (changed) setAssets(updated);
        }
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
        setAssets(MOCK_ASSETS);
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
        // Auth/network error — degrade to demo so page isn't broken
        if (!cancelled) {
          setAssets(MOCK_ASSETS);
          setUsingDemo(true);
          setAssetsLoaded(true);
        }
      }
    };
    loadAssets();
    return () => { cancelled = true; };
  }, [user]);

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
        const portfolio = assets.map(a => ({
          symbol: a.symbol,
          name: a.name,
          category: a.category,
          weight: a.weight,
        }));
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

  const totalValue = assets.reduce((sum, a) => sum + (a.currentPrice * a.weight), 0);
  const healthCfg = HEALTH_CONFIG[MOCK_HEALTH.status];
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
    navigator.clipboard.writeText(MOCK_AI_COMMENTARY);
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

      {/* ═══ PAGE HEADER ═══ */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
          <Shield className="h-8 w-8 text-primary" />
          Portfolio Risk & Scenario Intelligence
        </h1>
        <p className="text-muted-foreground mt-2">
          Not portfolio tracking — Portfolio Risk & Scenario Intelligence.
        </p>
      </div>

      {/* ═══ SECTION 1: HEALTH + OVERVIEW ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Portfolio Health Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`bg-card border ${healthCfg.border} rounded-2xl p-6`}
        >
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-3 rounded-xl ${healthCfg.bg}`}>
              <HealthIcon className={`h-8 w-8 ${healthCfg.color}`} />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Portfolio Health</p>
              <p className={`text-2xl font-bold ${healthCfg.color}`}>{MOCK_HEALTH.status}</p>
            </div>
            <div className={`ml-auto text-3xl font-bold ${healthCfg.color}`}>
              {MOCK_HEALTH.score}
            </div>
          </div>

          <div className="space-y-2.5 mt-5">
            {Object.entries(MOCK_HEALTH.factors).map(([key, factor]) => {
              const fCfg = FACTOR_STATUS[factor.status];
              const FIcon = fCfg.icon;
              return (
                <div key={key} className="flex items-center gap-3 text-sm">
                  <FIcon className={`h-4 w-4 flex-shrink-0 ${fCfg.color}`} />
                  <span className="text-foreground font-medium flex-1">{factor.label}</span>
                  <span className="text-xs text-muted-foreground max-w-[200px] text-right">{factor.detail}</span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Portfolio Value + Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-card border border-border rounded-2xl p-6"
        >
          <p className="text-sm text-muted-foreground mb-1">Total Portfolio Value</p>
          <p className="text-4xl font-bold text-foreground mb-1">{formatCurrency(totalValue)}</p>
          <p className="text-sm text-green-400 flex items-center gap-1 mb-6">
            <TrendingUp className="h-4 w-4" /> +3.2% (24h)
          </p>

          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-background rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Assets</p>
              <p className="text-xl font-bold text-foreground">{assets.length}</p>
            </div>
            <div className="bg-background rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Categories</p>
              <p className="text-xl font-bold text-foreground">
                {new Set(assets.map(a => a.category)).size}
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setShowAddModal(true)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" /> Add Asset
            </button>
            <button className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary/50 transition-colors">
              <Upload className="h-4 w-4" /> CSV
            </button>
          </div>
        </motion.div>
      </div>

      <PortfolioAssetsSection
        assets={assets}
        chartView={chartView}
        onChartViewChange={setChartView}
        totalValue={totalValue}
        portfolioStats={portfolioStats}
        formatCurrency={formatCurrency}
        formatPercent={formatPercent}
        onEditAsset={setEditingAsset}
        onDeleteAsset={handleDeleteAsset}
      />

      {/* ═══ SECTION 3: STRESS TESTS (live engine) ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Stress Test Scenarios
          </h2>
          {stressLoading && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3 animate-spin" /> Loading…
            </span>
          )}
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
                const portfolio = assets.map(a => ({
                  symbol: a.symbol,
                  name: a.name,
                  category: a.category,
                  weight: a.weight,
                }));
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

        {/* Scenario cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stressResults.map((r, i) => {
            const badgeStyle = SOURCE_BADGE_STYLE[r.source_type] || SOURCE_BADGE_STYLE.replay;
            return (
              <motion.div
                key={r.scenario_id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 * i }}
                className="bg-card border border-border rounded-2xl overflow-hidden"
              >
                {/* Header */}
                <div
                  className="p-5 cursor-pointer hover:bg-secondary/20 transition-colors"
                  onClick={() => toggleTest(r.scenario_id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold text-foreground truncate">{r.scenario_name}</p>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded border whitespace-nowrap ${badgeStyle.bg} ${badgeStyle.text} ${badgeStyle.border}`}
                          title={r.disclosure_text}
                        >
                          {r.disclosure_label}
                        </span>
                      </div>
                      {r.period && (
                        <p className="text-xs text-muted-foreground">{r.period}{r.duration_label ? ` · ${r.duration_label}` : ''}</p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.description}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-lg font-bold ${r.portfolio_drawdown_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatPercent(r.portfolio_drawdown_pct)}
                      </span>
                      {expandedTests[r.scenario_id]
                        ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                        : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      }
                    </div>
                  </div>
                </div>

                {/* Expanded breakdown */}
                <AnimatePresence>
                  {expandedTests[r.scenario_id] && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-border"
                    >
                      <div className="p-5 space-y-3">
                        {/* Per-asset breakdown */}
                        <div className="space-y-3">
                          {r.per_asset_breakdown.map((row) => (
                            <div key={row.symbol}>
                              <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="text-foreground font-medium truncate">{row.symbol}</span>
                                  <span className="text-[10px] text-muted-foreground">({row.asset_class})</span>
                                  {row.proxy_used && (
                                    <span className="text-[10px] px-1 py-0.5 rounded bg-purple-500/15 text-purple-300 border border-purple-500/30" title={row.proxy_note || ''}>
                                      proxy
                                    </span>
                                  )}
                                  {row.factor_loading_source === 'per_symbol' && (
                                    <span className="text-[10px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30" title="Per-symbol factor loadings (more precise than per-class)">
                                      symbol-level
                                    </span>
                                  )}
                                  {row.factor_loading_source === 'per_class' && (
                                    <span className="text-[10px] px-1 py-0.5 rounded bg-gray-500/15 text-gray-300 border border-gray-500/30" title={`Class-level factor loadings (no per-symbol data for ${row.symbol})`}>
                                      class-level
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                                    <div
                                      className={`h-full rounded-full ${row.contribution_pct >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                                      style={{ width: `${Math.min(100, Math.abs(row.contribution_pct) * 4)}%` }}
                                    />
                                  </div>
                                  <span className={`font-mono text-xs font-medium w-20 text-right ${row.contribution_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatPercent(row.contribution_pct)}
                                  </span>
                                </div>
                              </div>
                              {/* Factor decomposition (only for factor_shock module) */}
                              {row.factor_contributions && (
                                <div className="ml-6 mt-1.5 pl-3 border-l border-border/50 space-y-0.5">
                                  {Object.entries(row.factor_contributions)
                                    .filter(([_, v]) => Math.abs(v) > 0.01)
                                    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                                    .slice(0, 5)
                                    .map(([factor, contrib]) => (
                                      <div key={factor} className="flex justify-between text-[10px] text-muted-foreground">
                                        <span>{factor}</span>
                                        <span className={`font-mono ${contrib >= 0 ? 'text-green-400/80' : 'text-red-400/80'}`}>
                                          {contrib >= 0 ? '+' : ''}{contrib.toFixed(2)}%
                                        </span>
                                      </div>
                                    ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>

                        {/* Narrative */}
                        <div className="pt-3 mt-3 border-t border-border/50 space-y-2 text-xs text-muted-foreground">
                          <p><span className="text-foreground font-medium">Driver:</span> {r.main_damage_driver}</p>
                          <p><span className="text-foreground font-medium">Buffer:</span> {r.buffer_contributor}</p>
                          <p><span className="text-foreground font-medium">Sensitivity:</span> {r.most_sensitive_class}</p>
                        </div>

                        {/* Per-card disclosure */}
                        {(r.proxy_used_classes?.length > 0 || r.fallback_used_classes?.length > 0 || r.source_type === 'synthetic' || r.source_type === 'factor') && (
                          <div className="pt-3 mt-3 border-t border-border/50 flex items-start gap-2 text-[11px] text-muted-foreground bg-muted/30 rounded-lg p-2">
                            <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                            <span>{r.disclosure_text}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Module-level disclosure footer */}
        {stressResults.length > 0 && (
          <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground bg-muted/20 border border-border rounded-lg p-3">
            <Info className="h-4 w-4 mt-0.5 flex-shrink-0" />
            <span>
              Stress test outputs are risk-exposure simulations applied to your current holdings. They are not forecasts of future performance and not investment advice. Historical replays use peak-to-trough shock magnitudes from documented events; proxy-marked figures use similar-behavior asset substitutions when historical data does not exist; synthetic scenarios stack stresses for tail-risk awareness.
            </span>
          </div>
        )}
          </>
        )}
      </motion.div>

      {/* ═══ SECTION 4: KEY FINDINGS (derived from stress results) ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="mb-8"
      >
        <h2 className="text-lg font-semibold text-foreground mb-5 flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          Key Findings
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Worst Scenario — auto-derived from current stress results */}
          <div className="bg-card border border-red-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Worst Scenario</p>
            </div>
            <p className="text-lg font-bold text-foreground mb-1">
              {derivedKeyFindings ? derivedKeyFindings.worst.scenario_name : '—'}
            </p>
            <p className="text-3xl font-bold text-red-400">
              {derivedKeyFindings ? formatPercent(derivedKeyFindings.worst.portfolio_drawdown_pct) : '—'}
            </p>
          </div>

          {/* Lower Downside Scenario — scenario with smallest absolute drawdown */}
          <div className="bg-card border border-green-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Shield className="h-5 w-5 text-green-400" />
              </div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Lower Downside Scenario</p>
            </div>
            <p className="text-lg font-bold text-foreground mb-1">
              {derivedKeyFindings ? derivedKeyFindings.lowerDownside.scenario_name : '—'}
            </p>
            <p className="text-sm text-green-400">
              {derivedKeyFindings ? `Models ${formatPercent(derivedKeyFindings.lowerDownside.portfolio_drawdown_pct)} drawdown — least severe of this module` : '—'}
            </p>
          </div>

          {/* Most Sensitive — observation derived from worst scenario's most_sensitive_class */}
          <div className="bg-card border border-blue-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Activity className="h-5 w-5 text-blue-400" />
              </div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Most Sensitive</p>
            </div>
            <p className="text-sm text-foreground leading-snug">
              {derivedKeyFindings ? derivedKeyFindings.mostSensitive : '—'}
            </p>
          </div>
        </div>
      </motion.div>

      {/* ═══ SECTION 4.5: DIVERSIFICATION MATRIX (Correlation) ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
        className="mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            Diversification Matrix
          </h2>
          {correlationLoading && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              <RefreshCw className="h-3 w-3 animate-spin" /> Loading…
            </span>
          )}
        </div>
        <CorrelationMatrix
          data={correlationData}
          loading={correlationLoading}
          error={correlationError}
          assets={assets}
        />
      </motion.div>

      {/* ═══ SECTION 5: AI COMMENTARY ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-card border border-border rounded-2xl p-6 mb-8"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/10">
              <Brain className="h-5 w-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-foreground">AI Analysis</h2>
              <p className="text-xs text-muted-foreground">Powered by Safeguard AI</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopyAI}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-secondary/50 transition-colors"
            >
              {copiedAI ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
              {copiedAI ? 'Copied' : 'Copy'}
            </button>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:bg-secondary/50 transition-colors">
              <RefreshCw className="h-3.5 w-3.5" />
              Regenerate
            </button>
          </div>
        </div>

        <div className="border-l-2 border-purple-500/40 pl-5">
          {MOCK_AI_COMMENTARY.split('\n\n').map((paragraph, i) => (
            <p key={i} className="text-sm text-muted-foreground leading-relaxed mb-3 last:mb-0">
              {paragraph}
            </p>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
