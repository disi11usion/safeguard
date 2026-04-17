import React from 'react';
import { motion } from 'framer-motion';
import { Activity, BarChart3, List, Pencil, PieChart, Trash2 } from 'lucide-react';
import { PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const RISK_CONFIG = {
  LOW: { color: 'bg-green-500' },
  MEDIUM: { color: 'bg-orange-400' },
  HIGH: { color: 'bg-red-500' },
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

export default function PortfolioAssetsSection({
  assets,
  chartView,
  onChartViewChange,
  totalValue,
  portfolioStats,
  formatCurrency,
  formatPercent,
  onEditAsset,
  onDeleteAsset,
}) {
  const pieData = assets.map(a => ({ name: a.symbol, value: a.weight }));

  return (
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
              onClick={() => onChartViewChange(v.key)}
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
            {assets.map((a, i) => (
              <div key={a.id} className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-sm text-muted-foreground">{a.symbol} ({a.weight}%)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {chartView === 'stats' && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Value', value: formatCurrency(totalValue) },
            { label: 'Highest Risk', value: portfolioStats.highestRisk },
            { label: 'Largest Position', value: portfolioStats.largestPosition },
            { label: 'Category Spread', value: portfolioStats.categorySpread },
          ].map(s => (
            <div key={s.label} className="bg-background rounded-xl p-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="text-sm font-semibold text-foreground mt-1">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs text-muted-foreground font-medium py-3 px-2">Asset</th>
              <th className="text-right text-xs text-muted-foreground font-medium py-3 px-2">Weight</th>
              <th className="text-right text-xs text-muted-foreground font-medium py-3 px-2">Holdings</th>
              <th className="text-right text-xs text-muted-foreground font-medium py-3 px-2">P/L</th>
              <th className="text-right text-xs text-muted-foreground font-medium py-3 px-2">Risk</th>
              <th className="text-right text-xs text-muted-foreground font-medium py-3 px-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset, i) => {
              const pl = asset.entryPrice > 0
                ? ((asset.currentPrice - asset.entryPrice) / asset.entryPrice) * 100
                : 0;
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
                  <td className="text-right py-4 px-2">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onEditAsset(asset)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <button
                        onClick={() => onDeleteAsset(asset.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-red-500/30 text-xs text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
            {!assets.length && (
              <tr>
                <td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
                  No assets yet. Add your first asset to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
