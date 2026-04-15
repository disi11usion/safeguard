import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Plus, Upload, TrendingUp, TrendingDown, Minus,
  AlertTriangle, Activity, Brain, ChevronDown, ChevronUp,
  RefreshCw, Copy, Check, Zap, Target, BarChart3, PieChart,
  List, X, Search
} from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

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

const MOCK_AI_COMMENTARY = `Your portfolio is moderately concentrated in crypto assets (BTC 25% + ETH 15% = 40%), creating significant correlation risk since these assets tend to move together during market stress. In a pandemic-level shock, your portfolio could lose up to 19.3%.

Your strongest hedge is Gold (25%), which shows positive returns across all stress scenarios. Consider increasing Gold allocation to 35% — this would reduce your worst-case loss by approximately 8.5%.

The most sensitive factor is your BTC position: a 1% change in BTC weight causes a 0.95% swing in overall portfolio risk. If you're looking to reduce volatility without exiting crypto entirely, shifting 5-10% from BTC to stablecoins or bonds would meaningfully improve your risk profile.`;

// ═══════════════════════════════════════════
// UTILITY COMPONENTS
// ═══════════════════════════════════════════

const RISK_CONFIG = {
  LOW:    { color: 'bg-green-500', text: 'text-green-400', border: 'border-green-500/30', bg: 'bg-green-500/10' },
  MEDIUM: { color: 'bg-orange-400', text: 'text-orange-400', border: 'border-orange-400/30', bg: 'bg-orange-400/10' },
  HIGH:   { color: 'bg-red-500', text: 'text-red-400', border: 'border-red-500/30', bg: 'bg-red-500/10' },
};

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

const PIE_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];

const CATEGORY_ICONS = {
  crypto: '₿',
  stock: '📈',
  forex: '💱',
  futures: '🥇',
};

function RiskBadge({ risk }) {
  const cfg = RISK_CONFIG[risk] || RISK_CONFIG.MEDIUM;
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-white ${cfg.color}`}>
      <Activity className="h-3 w-3" />
      {risk}
    </span>
  );
}

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

function AddAssetModal({ isOpen, onClose }) {
  const [symbol, setSymbol] = useState('');
  const [weight, setWeight] = useState('');
  const [entryPrice, setEntryPrice] = useState('');

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
            <h3 className="text-lg font-semibold text-foreground">Add Asset</h3>
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
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
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

            <div>
              <label className="text-sm text-muted-foreground mb-1 block">Entry Price (optional)</label>
              <input
                type="number"
                placeholder="e.g. 42000"
                value={entryPrice}
                onChange={e => setEntryPrice(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-secondary/50 transition-colors">
              Cancel
            </button>
            <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
              Add Asset
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [chartView, setChartView] = useState('pie');
  const [expandedTests, setExpandedTests] = useState({});
  const [copiedAI, setCopiedAI] = useState(false);

  const totalValue = MOCK_ASSETS.reduce((sum, a) => sum + (a.currentPrice * a.weight), 0);
  const pieData = MOCK_ASSETS.map(a => ({ name: a.symbol, value: a.weight }));
  const healthCfg = HEALTH_CONFIG[MOCK_HEALTH.status];
  const HealthIcon = healthCfg.icon;

  const toggleTest = (id) => {
    setExpandedTests(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyAI = () => {
    navigator.clipboard.writeText(MOCK_AI_COMMENTARY);
    setCopiedAI(true);
    setTimeout(() => setCopiedAI(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto">
      <AddAssetModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />

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
              <p className="text-xl font-bold text-foreground">{MOCK_ASSETS.length}</p>
            </div>
            <div className="bg-background rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground">Categories</p>
              <p className="text-xl font-bold text-foreground">
                {new Set(MOCK_ASSETS.map(a => a.category)).size}
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

      {/* ═══ SECTION 2: YOUR ASSETS ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="bg-card border border-border rounded-2xl p-6 mb-8"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-foreground">Your Assets</h2>
          <div className="flex bg-background rounded-lg p-1">
            {[
              { key: 'pie', icon: PieChart, label: 'Pie Chart' },
              { key: 'list', icon: List, label: 'List' },
              { key: 'stats', icon: BarChart3, label: 'Statistics' },
            ].map(v => (
              <button
                key={v.key}
                onClick={() => setChartView(v.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
                  chartView === v.key
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <v.icon className="h-3.5 w-3.5" />
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Pie Chart */}
        {chartView === 'pie' && (
          <div className="flex flex-col lg:flex-row items-center gap-8 mb-6">
            <div className="w-64 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                    itemStyle={{ color: '#e2e8f0' }}
                    formatter={(value) => [`${value}%`, 'Weight']}
                  />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-wrap gap-3">
              {MOCK_ASSETS.map((a, i) => (
                <div key={a.id} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-sm text-muted-foreground">{a.symbol} ({a.weight}%)</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats View */}
        {chartView === 'stats' && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Total Value', value: formatCurrency(totalValue) },
              { label: 'Highest Risk', value: 'BTC (HIGH)' },
              { label: 'Largest Position', value: `BTC & Gold (25%)` },
              { label: 'Category Spread', value: '3 categories' },
            ].map(s => (
              <div key={s.label} className="bg-background rounded-xl p-4">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className="text-sm font-semibold text-foreground mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* Asset Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs text-muted-foreground font-medium py-3 px-2">Asset</th>
                <th className="text-right text-xs text-muted-foreground font-medium py-3 px-2">Weight</th>
                <th className="text-right text-xs text-muted-foreground font-medium py-3 px-2">Holdings</th>
                <th className="text-right text-xs text-muted-foreground font-medium py-3 px-2">P/L</th>
                <th className="text-right text-xs text-muted-foreground font-medium py-3 px-2">Risk</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_ASSETS.map((asset, i) => {
                const pl = ((asset.currentPrice - asset.entryPrice) / asset.entryPrice) * 100;
                return (
                  <motion.tr
                    key={asset.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.05 * i }}
                    className="border-b border-border/50 hover:bg-secondary/20 transition-colors"
                  >
                    <td className="py-4 px-2">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{CATEGORY_ICONS[asset.category] || '💰'}</span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{asset.symbol}</p>
                          <p className="text-xs text-muted-foreground">{asset.name}</p>
                        </div>
                      </div>
                    </td>
                    <td className="text-right py-4 px-2">
                      <p className="text-sm font-medium text-foreground">{asset.weight}%</p>
                    </td>
                    <td className="text-right py-4 px-2">
                      <p className="text-sm font-medium text-foreground">{formatCurrency(asset.currentPrice * asset.weight)}</p>
                      <p className="text-xs text-muted-foreground">{formatCurrency(asset.currentPrice)}/unit</p>
                    </td>
                    <td className="text-right py-4 px-2">
                      <p className={`text-sm font-medium ${pl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatPercent(pl)}
                      </p>
                    </td>
                    <td className="text-right py-4 px-2">
                      <RiskBadge risk={asset.risk} />
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* ═══ SECTION 3: STRESS TESTS ═══ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="mb-8"
      >
        <h2 className="text-lg font-semibold text-foreground mb-5 flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Stress Test Scenarios
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MOCK_STRESS_TESTS.map((test, i) => (
            <motion.div
              key={test.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 + i * 0.05 }}
              className="bg-card border border-border rounded-2xl overflow-hidden"
            >
              {/* Header */}
              <div
                className="p-5 cursor-pointer hover:bg-secondary/20 transition-colors"
                onClick={() => toggleTest(test.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{test.icon}</span>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{test.name}</p>
                      <p className="text-xs text-muted-foreground">{test.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-bold ${test.portfolioImpact >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {formatPercent(test.portfolioImpact)}
                    </span>
                    {expandedTests[test.id]
                      ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    }
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              <AnimatePresence>
                {expandedTests[test.id] && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-border"
                  >
                    <div className="p-5 space-y-2">
                      {test.assets.map(a => (
                        <div key={a.symbol} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{a.symbol}</span>
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 bg-secondary rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${a.impact >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                                style={{ width: `${Math.min(100, Math.abs(a.impact) * 2)}%` }}
                              />
                            </div>
                            <span className={`font-mono text-xs font-medium w-16 text-right ${a.impact >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {formatPercent(a.impact)}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div className="pt-3 mt-3 border-t border-border/50 flex justify-between items-center">
                        <span className="text-sm font-medium text-foreground">Portfolio Impact</span>
                        <span className={`text-base font-bold ${test.portfolioImpact >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatPercent(test.portfolioImpact)}
                        </span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ═══ SECTION 4: KILLER OUTPUT ═══ */}
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
          {/* Worst Scenario */}
          <div className="bg-card border border-red-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Worst Scenario</p>
            </div>
            <p className="text-lg font-bold text-foreground mb-1">{MOCK_KILLER_OUTPUT.worstScenario.name}</p>
            <p className="text-3xl font-bold text-red-400">{formatPercent(MOCK_KILLER_OUTPUT.worstScenario.impact)}</p>
          </div>

          {/* Best Protection */}
          <div className="bg-card border border-green-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Shield className="h-5 w-5 text-green-400" />
              </div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Best Protection</p>
            </div>
            <p className="text-lg font-bold text-foreground mb-1">{MOCK_KILLER_OUTPUT.bestProtection.action}</p>
            <p className="text-sm text-green-400">Reduces loss by {MOCK_KILLER_OUTPUT.bestProtection.reduction}%</p>
          </div>

          {/* Most Sensitive Factor */}
          <div className="bg-card border border-blue-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Activity className="h-5 w-5 text-blue-400" />
              </div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Most Sensitive</p>
            </div>
            <p className="text-lg font-bold text-foreground mb-1">{MOCK_KILLER_OUTPUT.mostSensitiveFactor.factor}</p>
            <p className="text-sm text-muted-foreground">{MOCK_KILLER_OUTPUT.mostSensitiveFactor.detail}</p>
          </div>
        </div>
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
