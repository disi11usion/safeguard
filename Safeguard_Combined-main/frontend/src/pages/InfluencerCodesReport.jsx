import React, { useEffect, useMemo, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip } from 'recharts';
import { getApiBaseUrl, joinUrl } from '../services/apiBaseUrl';

const hashString = (value) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const seededFloat = (seed) => {
  let x = seed;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 1000) / 1000;
};

const toDateInput = (date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, '0');
  const d = `${date.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const startOfDay = (value) => {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (value) => {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
};

const formatCurrency = (cents) => {
  const amount = Number(cents || 0) / 100;
  return `$${amount.toFixed(2)}`;
};

const getRangeDays = (range) => {
  if (range === '7d') return 7;
  if (range === '30d') return 30;
  return 90;
};

const buildDateSpan = (from, to) => {
  const days = [];
  const cursor = startOfDay(from);
  const end = startOfDay(to);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
};

const normalizeCodes = (codes) => {
  const map = new Map();
  (codes || []).forEach((row) => {
    const code = String(row.code || row.referral_code || '').trim().toUpperCase();
    if (!code) return;
    map.set(code, {
      code,
      influencer_name: row.name || row.influencer_name || row.influencer || 'Unknown',
      status: (row.status || 'inactive').toLowerCase(),
    });
  });
  return map;
};

const buildInfluencerAnalyticsFromTransactions = (
  transactions = [],
  codes = [],
  thresholdCents = 0,
  dateFrom,
  dateTo,
  searchFilter = { field: 'code', keyword: '' }
) => {
  const codeMetaMap = normalizeCodes(codes);
  const from = startOfDay(dateFrom);
  const to = endOfDay(dateTo);
  const keyword = (searchFilter?.keyword || '').trim().toLowerCase();
  const field = searchFilter?.field || 'code';

  const normalized = (transactions || [])
    .filter((tx) => String(tx.status || 'succeeded').toLowerCase() === 'succeeded')
    .map((tx) => {
      const code = String(tx.influencer_code || '').trim().toUpperCase();
      if (!code) return null;
      const meta = codeMetaMap.get(code);
      return {
        ...tx,
        influencer_code: code,
        influencer_name: meta?.influencer_name || 'Unknown',
        code_status: meta?.status || 'active',
      };
    })
    .filter((tx) => {
      if (!tx) return false;
      const created = tx.created_at ? new Date(tx.created_at) : null;
      if (!created || Number.isNaN(created.getTime())) return false;
      return created >= from && created <= to;
    });

  const filteredTransactions = !keyword
    ? normalized
    : normalized.filter((tx) => {
        if (field === 'influencer') {
          return String(tx.influencer_name || '').toLowerCase().includes(keyword);
        }
        return String(tx.influencer_code || '').toLowerCase().includes(keyword);
      });

  const perCodeMap = new Map();
  const dailyMap = new Map();

  filteredTransactions.forEach((tx) => {
    const code = tx.influencer_code;
    const amount = Number(tx.amount_cents || 0);
    const date = new Date(tx.created_at).toISOString().slice(0, 10);

    const codeAcc = perCodeMap.get(code) || {
      code,
      influencer_name: tx.influencer_name || 'Unknown',
      status: tx.code_status || 'active',
      usage_count: 0,
      revenue_cents: 0,
      commission_cents: 0,
    };
    codeAcc.usage_count += 1;
    codeAcc.revenue_cents += amount;
    perCodeMap.set(code, codeAcc);

    const dayAcc = dailyMap.get(date) || {
      date,
      total_uses: 0,
      total_revenue_cents: 0,
      total_commission_cents: 0,
    };
    dayAcc.total_uses += 1;
    dayAcc.total_revenue_cents += amount;
    dailyMap.set(date, dayAcc);
  });

  const per_code = Array.from(perCodeMap.values()).map((row) => {
    const eligible = Math.max(0, row.revenue_cents - Number(thresholdCents || 0));
    return {
      ...row,
      commission_cents: Math.round(eligible * 0.3),
    };
  }).sort((a, b) => b.revenue_cents - a.revenue_cents);

  const codeIndex = new Map(per_code.map((row) => [row.code, row]));
  const timeseries = buildDateSpan(from, to).map((date) => {
    const row = dailyMap.get(date) || {
      date,
      total_uses: 0,
      total_revenue_cents: 0,
      total_commission_cents: 0,
    };
    return row;
  });

  const kpis = per_code.reduce((acc, row) => {
    acc.total_uses += row.usage_count;
    acc.total_revenue_cents += row.revenue_cents;
    acc.total_commission_cents += row.commission_cents;
    acc.active_codes += row.status === 'active' ? 1 : 0;
    return acc;
  }, {
    active_codes: 0,
    total_uses: 0,
    total_revenue_cents: 0,
    total_commission_cents: 0,
  });

  const transactions_by_code = {};
  filteredTransactions.forEach((tx) => {
    const code = tx.influencer_code;
    if (!codeIndex.has(code)) return;
    if (!transactions_by_code[code]) transactions_by_code[code] = [];
    transactions_by_code[code].push(tx);
  });
  Object.keys(transactions_by_code).forEach((code) => {
    transactions_by_code[code].sort((a, b) => {
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return bTime - aTime;
    });
  });

  return { kpis, timeseries, per_code, transactions_by_code };
};

// TODO(admin): Mock-only influencer transaction generator for UI testing.
// Remove with mock mode retirement; keep analytics based on real DB transactions.
const generateMockInfluencerTransactions = (codes = [], rangeDays = 30, endDateStr = null) => {
  const today = endDateStr ? new Date(endDateStr) : new Date();
  const cleanedCodes = (codes || []).map((row) => ({
    code: String(row.code || row.referral_code || '').trim().toUpperCase(),
    influencer_name: row.name || row.influencer_name || row.influencer || 'Unknown',
    status: (row.status || 'inactive').toLowerCase(),
  })).filter((row) => row.code);

  const txs = [];
  let id = 1;
  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    cleanedCodes.forEach((codeRow, idx) => {
      const seed = hashString(`${codeRow.code}-${date.toISOString().slice(0, 10)}`);
      const activeBoost = codeRow.status === 'active' ? 1 : 0;
      const count = Math.max(0, Math.round(seededFloat(seed + idx) * 3) + activeBoost);
      for (let t = 0; t < count; t += 1) {
        const created = new Date(date);
        created.setHours(9 + ((idx + t) % 9), (t * 13) % 60, 0, 0);
        const amount = Math.max(900, Math.round(1200 + seededFloat(seed + t + 77) * 7800));
        txs.push({
          transaction_id: `mock_inf_tx_${id++}`,
          user_id: 2000 + ((seed + t) % 100),
          username: `mock_influ_user_${((seed + t) % 20) + 1}`,
          email: `mock_influ_user_${((seed + t) % 20) + 1}@example.com`,
          influencer_code: codeRow.code,
          plan_key: ['basic_monthly', 'basic_yearly', 'premium_monthly', 'enterprise'][(seed + t) % 4],
          amount_cents: amount,
          currency: 'USD',
          status: 'succeeded',
          payment_method_type: t % 2 === 0 ? 'card' : 'apple_pay',
          stripe_payment_intent_id: `mock_inf_pi_${id}`,
          created_at: created.toISOString(),
          paid_at: created.toISOString(),
        });
      }
    });
  }
  return txs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
};

// TODO(admin): Mock-only analytics helper. Remove after database-only analytics rollout.
export const generateMockInfluencerAnalytics = (codes, rangeDays, thresholdCents) => {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - Math.max(1, Number(rangeDays || 30)) + 1);
  const txs = generateMockInfluencerTransactions(codes, rangeDays, to.toISOString().slice(0, 10));
  return buildInfluencerAnalyticsFromTransactions(
    txs,
    codes,
    thresholdCents,
    from,
    to,
    { field: 'code', keyword: '' }
  );
};

const InfluencerCodesReport = ({
  codes = [],
  thresholdCents = 0,
  useMock,
  onToggleMock,
  range,
  onRangeChange,
  onExportClick
}) => {
  const apiBaseUrl = getApiBaseUrl();
  const token = useMemo(
    () => localStorage.getItem('cryptoai_access_token') || localStorage.getItem('access_token') || '',
    []
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [transactions, setTransactions] = useState([]);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [searchField, setSearchField] = useState('code');
  const [searchKeywordInput, setSearchKeywordInput] = useState('');
  const [searchFilter, setSearchFilter] = useState({ field: 'code', keyword: '' });
  const todayStr = toDateInput(new Date());
  const defaultFromStr = toDateInput(new Date(Date.now() - 29 * 24 * 3600 * 1000));
  const [customFrom, setCustomFrom] = useState(defaultFromStr);
  const [customTo, setCustomTo] = useState(todayStr);
  const [selectedCodeRow, setSelectedCodeRow] = useState(null);

  const rangeDays = useMemo(() => getRangeDays(range), [range]);
  const effectiveFrom = useMemo(() => {
    if (range === 'custom' && customFrom) return startOfDay(customFrom);
    const from = new Date();
    from.setDate(from.getDate() - rangeDays + 1);
    return startOfDay(from);
  }, [range, customFrom, rangeDays]);
  const effectiveTo = useMemo(() => {
    if (range === 'custom' && customTo) return endOfDay(customTo);
    return endOfDay(new Date());
  }, [range, customTo]);
  const effectiveRangeDays = useMemo(() => {
    const diff = Math.floor((effectiveTo.getTime() - effectiveFrom.getTime()) / (24 * 3600 * 1000)) + 1;
    return Math.max(1, diff);
  }, [effectiveFrom, effectiveTo]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setError('');
      setLoading(true);
      try {
        // TODO(admin): Mock load path for test/demo only.
        // Remove when Influencer Codes Report reads real DB data in all environments.
        if (useMock) {
          const mockTxs = generateMockInfluencerTransactions(
            codes,
            effectiveRangeDays,
            toDateInput(effectiveTo)
          );
          if (active) setTransactions(mockTxs);
          return;
        }

        const params = new URLSearchParams();
        if (range === 'custom' && customFrom && customTo) {
          params.set('date_from', customFrom);
          params.set('date_to', customTo);
        } else {
          params.set('range_days', String(rangeDays));
        }

        const url = joinUrl(apiBaseUrl, `/v1/admin/revenue-report?${params.toString()}`);
        const res = await fetch(url, {
          credentials: 'include',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status} ${res.statusText}${body ? ` - ${body}` : ''}`);
        }
        const payload = await res.json();
        if (active) setTransactions(payload?.transactions || []);
      } catch (err) {
        if (active) {
          setError(err.message || 'Failed to load influencer codes report.');
          setTransactions([]);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [apiBaseUrl, token, useMock, codes, range, rangeDays, customFrom, customTo, effectiveRangeDays, effectiveTo]);

  const reportData = useMemo(
    () => buildInfluencerAnalyticsFromTransactions(
      transactions,
      codes,
      thresholdCents,
      effectiveFrom,
      effectiveTo,
      searchFilter
    ),
    [transactions, codes, thresholdCents, effectiveFrom, effectiveTo, searchFilter]
  );

  const selectedCodeTransactions = useMemo(() => {
    if (!selectedCodeRow?.code) return [];
    return reportData?.transactions_by_code?.[selectedCodeRow.code] || [];
  }, [selectedCodeRow, reportData]);

  const applySearch = () => {
    setSearchFilter({
      field: searchField,
      keyword: (searchKeywordInput || '').trim(),
    });
    setShowSearchModal(false);
  };

  const clearSearch = () => {
    setSearchField('code');
    setSearchKeywordInput('');
    setSearchFilter({ field: 'code', keyword: '' });
    setShowSearchModal(false);
  };

  return (
    <section className="bg-card border border-border rounded-xl p-6 space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Influencer Codes Report</h2>
          <p className="text-xs text-muted-foreground">Code usage, conversions, and commission preview.</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="px-3 py-2 text-xs border border-border rounded-md hover:bg-muted/40 transition"
            onClick={() => setShowSearchModal(true)}
          >
            Search
          </button>
          <button
            type="button"
            className="px-3 py-2 text-xs border border-border rounded-md hover:bg-muted/40 transition"
            onClick={onExportClick}
          >
            Export
          </button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>Mock data</span>
            <button
              className={`relative w-10 h-5 rounded-full transition ${useMock ? 'bg-emerald-500' : 'bg-border'}`}
              onClick={onToggleMock}
              aria-label="Toggle mock influencer analytics"
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition ${
                  useMock ? 'translate-x-5' : ''
                }`}
              />
            </button>
          </div>
          <select
            className="px-3 py-2 border border-border rounded-md bg-background text-sm"
            value={range}
            onChange={(e) => onRangeChange(e.target.value)}
          >
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="90d">Last 90 days</option>
            <option value="custom">Custom</option>
          </select>
          {range === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                className="px-3 py-2 border border-border rounded-md bg-background text-sm"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                className="px-3 py-2 border border-border rounded-md bg-background text-sm"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          )}
        </div>
      </div>

      {!!searchFilter.keyword && (
        <div className="text-xs text-muted-foreground">
          Search: {searchFilter.field} = "{searchFilter.keyword}"
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading influencer analytics...</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-background border border-border rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Active Codes</div>
              <div className="text-2xl font-semibold">{reportData?.kpis?.active_codes || 0}</div>
            </div>
            <div className="bg-background border border-border rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Uses</div>
              <div className="text-2xl font-semibold">{reportData?.kpis?.total_uses || 0}</div>
            </div>
            <div className="bg-background border border-border rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Estimated Commission</div>
              <div className="text-2xl font-semibold">
                {formatCurrency(reportData?.kpis?.total_commission_cents)}
              </div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Range: {range === 'custom'
              ? `${customFrom || '-'} to ${customTo || '-'}`
              : range === '7d'
                ? 'Last 7 days'
                : range === '30d'
                  ? 'Last 30 days'
                  : 'Last 90 days'}
          </div>

          <div className="bg-background border border-border rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Code Usage Trend</div>
            {reportData?.timeseries?.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={reportData.timeseries} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(value) => value} labelFormatter={(label) => `Date: ${label}`} />
                    <Line type="monotone" dataKey="total_uses" stroke="#22c55e" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No results found.</div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left py-2">Code</th>
                  <th className="text-left py-2">Influencer</th>
                  <th className="text-right py-2">Usage</th>
                  <th className="text-right py-2">Revenue</th>
                  <th className="text-right py-2">Commission</th>
                </tr>
              </thead>
              <tbody>
                {(reportData?.per_code || []).map((row) => (
                  <tr
                    key={row.code}
                    className="border-b border-border/60 hover:bg-muted/20 transition cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedCodeRow(row)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedCodeRow(row);
                      }
                    }}
                  >
                    <td className="py-2 font-mono">{row.code}</td>
                    <td className="py-2">{row.influencer_name || '-'}</td>
                    <td className="py-2 text-right">{row.usage_count || 0}</td>
                    <td className="py-2 text-right">{formatCurrency(row.revenue_cents)}</td>
                    <td className="py-2 text-right">{formatCurrency(row.commission_cents)}</td>
                  </tr>
                ))}
                {!reportData?.per_code?.length && (
                  <tr>
                    <td className="py-4 text-center text-muted-foreground" colSpan={5}>
                      No results found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {showSearchModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">Search Influencer Codes Report</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Field</label>
                <select
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background"
                  value={searchField}
                  onChange={(e) => setSearchField(e.target.value)}
                >
                  <option value="code">Code</option>
                  <option value="influencer">Influencer</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Keyword</label>
                <input
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background"
                  placeholder="Enter keyword"
                  value={searchKeywordInput}
                  onChange={(e) => setSearchKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applySearch();
                  }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-4 py-2 text-sm border border-border rounded" onClick={clearSearch}>
                Clear
              </button>
              <button
                className="px-4 py-2 text-sm border border-border rounded"
                onClick={() => setShowSearchModal(false)}
              >
                Cancel
              </button>
              <button className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded" onClick={applySearch}>
                Search
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedCodeRow && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-6xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">
                Transactions for {selectedCodeRow.code} ({selectedCodeRow.influencer_name || '-'})
              </h3>
              <button
                className="px-3 py-2 text-sm border border-border rounded"
                onClick={() => setSelectedCodeRow(null)}
              >
                Close
              </button>
            </div>
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <div className="overflow-x-auto max-h-[58vh]">
                <table className="w-full table-fixed text-sm">
                  <colgroup>
                    <col style={{ width: '18%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '14%' }} />
                    <col style={{ width: '22%' }} />
                    <col style={{ width: '12%' }} />
                    <col style={{ width: '10%' }} />
                    <col style={{ width: '14%' }} />
                  </colgroup>
                  <thead className="text-muted-foreground">
                    <tr className="border-b border-border bg-muted/20">
                      <th className="text-left py-2 px-3">Transaction ID</th>
                      <th className="text-left py-2 px-3">User ID</th>
                      <th className="text-left py-2 px-3">Username</th>
                      <th className="text-left py-2 px-3">Email</th>
                      <th className="text-left py-2 px-3">Plan</th>
                      <th className="text-right py-2 px-3">Amount</th>
                      <th className="text-left py-2 px-3">Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCodeTransactions.map((tx) => (
                      <tr key={tx.transaction_id || `${tx.user_id}-${tx.created_at}`} className="border-b border-border/60">
                        <td className="py-2 px-3 font-mono truncate" title={tx.transaction_id || ''}>
                          {tx.transaction_id || '-'}
                        </td>
                        <td className="py-2 px-3">{tx.user_id}</td>
                        <td className="py-2 px-3 truncate" title={tx.username || ''}>{tx.username || '-'}</td>
                        <td className="py-2 px-3 truncate" title={tx.email || ''}>{tx.email || '-'}</td>
                        <td className="py-2 px-3 truncate" title={tx.plan_key || ''}>{tx.plan_key || '-'}</td>
                        <td className="py-2 px-3 text-right">{Number(tx.amount_cents || 0)}</td>
                        <td className="py-2 px-3 truncate" title={tx.created_at || ''}>
                          {tx.created_at ? new Date(tx.created_at).toLocaleString() : '-'}
                        </td>
                      </tr>
                    ))}
                    {!selectedCodeTransactions.length && (
                      <tr>
                        <td className="py-4 text-center text-muted-foreground" colSpan={7}>
                          No transactions found for this code.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default InfluencerCodesReport;
