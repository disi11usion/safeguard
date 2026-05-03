import React from 'react';
import { motion } from 'framer-motion';
import { Activity, BarChart3, List, Pencil, PieChart, Trash2 } from 'lucide-react';
import {
  PieChart as RechartsPie, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';

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

/**
 * Full 6-column asset table: Asset / Weight / Holdings / P/L / Risk / Actions.
 * Used in:
 *   - 'pie' chart view → embedded inside Section 1 · Current Allocation
 *   - 'list' chart view → main content
 *   - 'stats' chart view → after stats grid
 * The leftmost color band on each row matches that asset's slice in the pie chart above.
 */
function FullAssetTable({ enrichedAssets, formatCurrency, formatPercent, onEditAsset, onDeleteAsset, assetsLength, showColorBand = false }) {
  return (
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
        {enrichedAssets.map((asset, i) => {
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
                  {showColorBand && (
                    <div
                      className="w-1 h-8 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                  )}
                  <span className="text-xl">{CATEGORY_ICONS[asset.category] || '💰'}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{asset.symbol}</p>
                    <p className="text-xs text-muted-foreground">{asset.name}</p>
                  </div>
                </div>
              </td>
              <td className="text-right py-4 px-2">
                <p className="text-sm font-medium text-foreground">{asset._weightPct.toFixed(1)}%</p>
                <p className="text-[10px] text-muted-foreground">auto</p>
              </td>
              <td className="text-right py-4 px-2">
                <p className="text-sm font-medium text-foreground">{formatCurrency(asset._value)}</p>
                <p className="text-xs text-muted-foreground">
                  {asset.weight} × {formatCurrency(asset.entryPrice)}/unit
                </p>
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
        {!assetsLength && (
          <tr>
            <td colSpan={6} className="text-center py-8 text-sm text-muted-foreground">
              No assets yet. Add your first asset to get started.
            </td>
          </tr>
        )}
      </tbody>
    </table>
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
  // Optional: stress comparison
  stressedAssets,           // null when no scenario picked yet; otherwise array with _stressShockPct
  pieScenarioId,
  onPieScenarioChange,
  groupedScenarios,         // [{moduleId, moduleLabel, scenarios: [...]}] across all 6 modules
}) {
  // Enrich assets with derived dollar value + true weight %.
  // The DB column is named `weight` for legacy reasons but stores QUANTITY (units held).
  // Value is based on the user-input entry price (cost basis), not the live market price —
  // current price drives only the P/L column and the price-display chip.
  const enrichedAssets = assets.map(a => {
    const value = (a.entryPrice || 0) * (a.weight || 0);
    return { ...a, _value: value };
  });
  const realTotalValue = enrichedAssets.reduce((s, a) => s + a._value, 0);
  enrichedAssets.forEach(a => {
    a._weightPct = realTotalValue > 0 ? (a._value / realTotalValue) * 100 : 0;
  });

  // Pie data uses true weight %.
  const pieData = enrichedAssets.map(a => ({ name: a.symbol, value: a._weightPct }));

  // Stressed pie data — each asset's value × (1 + shock_pct/100), then re-percentaged.
  let stressedPieData = null;
  let stressedPostValue = 0;
  let stressedPortfolioPctChange = null;
  if (stressedAssets && stressedAssets.length > 0) {
    const stressedValues = stressedAssets.map(a => {
      const baseValue = (a.entryPrice || 0) * (a.weight || 0);
      const shockPct = a._stressShockPct || 0;
      const stressedValue = Math.max(0, baseValue * (1 + shockPct / 100));
      return { symbol: a.symbol, baseValue, stressedValue };
    });
    stressedPostValue = stressedValues.reduce((s, x) => s + x.stressedValue, 0);
    stressedPieData = stressedValues.map(x => ({
      name: x.symbol,
      value: stressedPostValue > 0 ? (x.stressedValue / stressedPostValue) * 100 : 0,
      stressedDollar: x.stressedValue,
      baseDollar: x.baseValue,
    }));
    if (realTotalValue > 0) {
      stressedPortfolioPctChange = ((stressedPostValue - realTotalValue) / realTotalValue) * 100;
    }
  }

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

      {chartView === 'pie' && (() => {
        // Build bar chart data sets — both current and stressed share same Y-axis max for visual comparison
        const currentBarData = enrichedAssets.map(a => ({
          symbol: a.symbol,
          value: a._value,
        }));
        const stressedBarData = (stressedPieData && stressedAssets)
          ? stressedAssets.map(a => {
              const baseValue = (a.entryPrice || 0) * (a.weight || 0);
              const shockPct = a._stressShockPct || 0;
              return {
                symbol: a.symbol,
                value: Math.max(0, baseValue * (1 + shockPct / 100)),
              };
            })
          : currentBarData;
        const sharedYMax = Math.max(
          ...currentBarData.map(d => d.value),
          ...stressedBarData.map(d => d.value),
          1, // avoid 0 domain
        ) * 1.05;
        const fmtCurrencyShort = (v) => {
          if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
          if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}k`;
          return `$${v.toFixed(0)}`;
        };

        const renderBarChart = (data, faded = false) => (
          <ResponsiveContainer width="100%" height={224}>
            <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid stroke="#1f1f23" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="symbol"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={{ stroke: '#27272a' }}
                tickLine={false}
              />
              <YAxis
                domain={[0, sharedYMax]}
                tick={{ fontSize: 10, fill: '#71717a' }}
                tickFormatter={fmtCurrencyShort}
                axisLine={{ stroke: '#27272a' }}
                tickLine={false}
              />
              <Tooltip
                cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(value) => [formatCurrency ? formatCurrency(value) : `$${value.toFixed(0)}`, 'Value']}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} fillOpacity={faded ? 0.35 : 1} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        );

        const renderPie = (data, faded = false) => (
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPie>
              <Pie
                data={data}
                cx="50%" cy="50%"
                innerRadius={50} outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {data.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} opacity={faded ? 0.35 : 1} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(value, _name, props) => {
                  if (!faded && props?.payload?.stressedDollar !== undefined) {
                    return [
                      `${value.toFixed(1)}% · ${formatCurrency ? formatCurrency(props.payload.stressedDollar) : '$' + props.payload.stressedDollar.toFixed(0)}`,
                      'Stressed weight',
                    ];
                  }
                  return [`${value.toFixed(1)}%`, faded ? 'Current (no scenario)' : 'Weight'];
                }}
              />
            </RechartsPie>
          </ResponsiveContainer>
        );

        return (
          <div className="space-y-8 mb-6">

            {/* ════════════ SECTION 1 · Current ════════════ */}
            <div>
              <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
                <p className="text-sm font-semibold text-foreground">
                  Current Allocation
                </p>
                {formatCurrency && (
                  <p className="text-sm text-muted-foreground">
                    Total: <span className="text-foreground font-bold font-mono">{formatCurrency(realTotalValue)}</span>
                  </p>
                )}
              </div>

              {/* Pie + Bar side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="flex justify-center">
                  <div className="w-56 h-56">{renderPie(pieData)}</div>
                </div>
                <div>{renderBarChart(currentBarData, false)}</div>
              </div>

              {/* Full asset table — Asset / Weight / Holdings / P/L / Risk / Actions */}
              <div className="overflow-x-auto">
                <FullAssetTable
                  enrichedAssets={enrichedAssets}
                  formatCurrency={formatCurrency}
                  formatPercent={formatPercent}
                  onEditAsset={onEditAsset}
                  onDeleteAsset={onDeleteAsset}
                  assetsLength={assets.length}
                  showColorBand={true}
                />
              </div>
            </div>

            {/* divider */}
            <div className="border-t border-border/40" />

            {/* ════════════ SECTION 2 · Under Stress ════════════ */}
            <div>
              <div className="flex items-baseline justify-between mb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">
                    Under Stress
                  </p>
                  {groupedScenarios && groupedScenarios.length > 0 ? (
                    <select
                      value={pieScenarioId || ''}
                      onChange={e => onPieScenarioChange?.(e.target.value || null)}
                      className="px-2 py-1 bg-background border border-border rounded text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 max-w-[260px]"
                    >
                      <option value="">— None —</option>
                      {groupedScenarios.map(group => (
                        <optgroup key={group.moduleId} label={group.moduleLabel}>
                          {group.scenarios.map(s => (
                            <option key={s.scenario_id} value={s.scenario_id}>
                              {s.scenario_name} ({s.portfolio_drawdown_pct >= 0 ? '+' : ''}{s.portfolio_drawdown_pct.toFixed(1)}%)
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/60 italic">Loading…</span>
                  )}
                </div>
                {stressedPortfolioPctChange != null ? (
                  <p className="text-sm text-muted-foreground">
                    Total: <span className="text-foreground font-bold font-mono">{formatCurrency(stressedPostValue)}</span>
                    <span className={`ml-2 font-bold ${stressedPortfolioPctChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      ({stressedPortfolioPctChange >= 0 ? '+' : ''}{stressedPortfolioPctChange.toFixed(2)}%)
                    </span>
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground/70 italic">
                    No scenario · baseline only
                  </p>
                )}
              </div>

              {/* Pie + Bar side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="flex justify-center">
                  <div className="w-56 h-56">{renderPie(stressedPieData || pieData, !stressedPieData)}</div>
                </div>
                <div>{renderBarChart(stressedBarData, !stressedPieData)}</div>
              </div>

              {/* List below */}
              <div className="bg-background/50 border border-border rounded-xl divide-y divide-border/50 overflow-hidden">
                {(stressedPieData ? stressedAssets : enrichedAssets).map((a, i) => {
                  const baseValue = (a.entryPrice || 0) * (a.weight || 0);
                  const shockPct = stressedPieData ? (a._stressShockPct || 0) : 0;
                  const stressedValue = baseValue * (1 + shockPct / 100);
                  const dollarChange = stressedValue - baseValue;
                  const isLoss = dollarChange < 0;
                  return (
                    <div key={a.id || a.symbol} className="flex items-center justify-between px-4 py-2.5 hover:bg-secondary/20 transition-colors">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length], opacity: stressedPieData ? 1 : 0.35 }} />
                        <span className="text-base">{CATEGORY_ICONS[a.category] || '💰'}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{a.symbol}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {stressedPieData ? (
                              <>
                                <span className="font-mono">{formatCurrency ? formatCurrency(baseValue) : '$' + baseValue.toFixed(0)}</span>
                                <span className="mx-1.5">→</span>
                                <span className="font-mono">{formatCurrency ? formatCurrency(stressedValue) : '$' + stressedValue.toFixed(0)}</span>
                              </>
                            ) : (
                              <span>{a.name}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 ml-3">
                        {stressedPieData ? (
                          <>
                            <p className={`text-sm font-bold font-mono ${isLoss ? 'text-red-400' : dollarChange > 0 ? 'text-green-400' : 'text-muted-foreground'}`}>
                              {dollarChange >= 0 ? '+' : ''}{formatCurrency ? formatCurrency(dollarChange) : '$' + dollarChange.toFixed(0)}
                            </p>
                            <p className={`text-[11px] font-medium ${isLoss ? 'text-red-400/80' : dollarChange > 0 ? 'text-green-400/80' : 'text-muted-foreground'}`}>
                              {shockPct >= 0 ? '+' : ''}{shockPct.toFixed(1)}%
                            </p>
                          </>
                        ) : (
                          <p className="text-sm font-medium text-foreground/60 font-mono">
                            {formatCurrency ? formatCurrency(baseValue) : '$' + baseValue.toFixed(0)}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        );
      })()}

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

      {/* Full asset table — only shown in 'list' and 'stats' views.
          In 'pie' view it's embedded inside Section 1 · Current Allocation. */}
      {(chartView === 'list' || chartView === 'stats') && (
        <div className="overflow-x-auto">
          <FullAssetTable
            enrichedAssets={enrichedAssets}
            formatCurrency={formatCurrency}
            formatPercent={formatPercent}
            onEditAsset={onEditAsset}
            onDeleteAsset={onDeleteAsset}
            assetsLength={assets.length}
          />
        </div>
      )}
    </motion.div>
  );
}
