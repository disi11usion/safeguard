import React, { useEffect, useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { getApiBaseUrl, joinUrl } from '../services/apiBaseUrl';
import InfluencerCodesReport, { generateMockInfluencerAnalytics } from './InfluencerCodesReport';
import SearchBar from '../components/SearchBar';
import { fuzzyMatch } from '../utils/search';

// TODO(admin): Mock-only test fixtures. Remove these after backend data is complete.
// After removal, keep the same UI flows but fetch all values from database APIs only.
const MOCK_USERS = [
  {
    user_id: 1001,
    username: 'demo_admin',
    email: 'demo_admin@example.com',
    role: 'admin',
    full_name: 'Demo Admin',
    is_active: true,
    referral_code_used: null,
    referred_influencer_name: null,
    created_at: new Date().toISOString()
  },
  {
    user_id: 1002,
    username: 'alice_demo',
    email: 'alice@example.com',
    role: 'admin',
    full_name: 'Alice Demo',
    is_active: true,
    referral_code_used: 'EMRE01',
    referred_influencer_name: 'Emre',
    created_at: new Date(Date.now() - 86400000 * 3).toISOString()
  },
  {
    user_id: 1003,
    username: 'bob_demo',
    email: 'bob@example.com',
    role: 'admin',
    full_name: 'Bob Demo',
    is_active: true,
    referral_code_used: 'RAIYAN01',
    referred_influencer_name: 'Raiyan',
    created_at: new Date(Date.now() - 86400000 * 9).toISOString()
  }
];

// TODO(admin): Mock-only influencer fixtures for local testing.
// Remove with mock mode cleanup and rely on real auth.influencer_codes data.
const MOCK_INFLUENCER_CODES = [
  {
    influencer_id: 101,
    influencer_name: 'Emre',
    code: 'EMRE01',
    status: 'active',
    usage_count: 12,
    total_revenue_cents: 156000,
    commission_cents: 22800,
    created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString()
  },
  {
    influencer_id: 102,
    influencer_name: 'Raiyan',
    code: 'RAIYAN01',
    status: 'active',
    usage_count: 8,
    total_revenue_cents: 91000,
    commission_cents: 12300,
    created_at: new Date(Date.now() - 86400000 * 18).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 1).toISOString()
  },
  {
    influencer_id: 103,
    influencer_name: 'Hunter',
    code: 'HUNTER01',
    status: 'inactive',
    usage_count: 2,
    total_revenue_cents: 11000,
    commission_cents: 0,
    created_at: new Date(Date.now() - 86400000 * 75).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 30).toISOString()
  }
];

const formatReadableError = (message) => {
  if (!message) return '';
  if (message.includes('Failed to fetch')) {
    return `${message} Possible causes: backend not running, wrong API host, or CORS/network blocked.`;
  }
  return message;
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

const safeDateInRange = (value, from, to) => {
  if (!value) return true;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return true;
  return d >= startOfDay(from) && d <= endOfDay(to);
};

const xmlEscape = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const buildExcelXml = (sheets) => {
  const sheetXml = sheets
    .map((sheet) => {
      const rows = sheet.rows || [];
      return `
        <Worksheet ss:Name="${xmlEscape(sheet.name || 'Sheet1')}">
          <Table>
            ${rows
              .map(
                (row) => `
              <Row>
                ${row
                  .map(
                    (cell) => `<Cell><Data ss:Type="String">${xmlEscape(cell)}</Data></Cell>`
                  )
                  .join('')}
              </Row>`
              )
              .join('')}
          </Table>
        </Worksheet>`;
    })
    .join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  ${sheetXml}
</Workbook>`;
};

const downloadExcelXml = (filename, xmlContent) => {
  const blob = new Blob([xmlContent], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const SectionHeader = ({ title, subtitle, onRefresh = null, right = null }) => (
  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
    <div>
      <h2 className="text-lg font-semibold">{title}</h2>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
    <div className="flex items-center gap-2">
      {right}
      {typeof onRefresh === 'function' && (
        <button
          type="button"
          className="px-3 py-2 text-xs border border-border rounded-md hover:bg-muted/40 transition"
          onClick={onRefresh}
        >
          Refresh
        </button>
      )}
    </div>
  </div>
);

const SectionLoading = ({ label }) => (
  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
    {label}
  </div>
);

const SectionEmpty = ({ label }) => (
  <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
    {label}
  </div>
);

const aggregateRevenueFromTransactions = (transactions = []) => {
  const byPlanMap = new Map();
  const dailyMap = new Map();
  const dailyDetails = {};
  let totalRevenue = 0;
  let txCount = 0;

  transactions.forEach((tx) => {
    const amount = Number(tx.amount_cents || 0);
    const plan = tx.plan_key || 'unknown';
    const createdAt = tx.created_at ? new Date(tx.created_at) : null;
    const date = createdAt && !Number.isNaN(createdAt.getTime())
      ? createdAt.toISOString().slice(0, 10)
      : null;

    totalRevenue += amount;
    txCount += 1;

    const planAcc = byPlanMap.get(plan) || { plan_key: plan, count: 0, revenue_cents: 0 };
    planAcc.count += 1;
    planAcc.revenue_cents += amount;
    byPlanMap.set(plan, planAcc);

    if (date) {
      const dayAcc = dailyMap.get(date) || { date, transactions: 0, revenue_cents: 0 };
      dayAcc.transactions += 1;
      dayAcc.revenue_cents += amount;
      dailyMap.set(date, dayAcc);
      if (!dailyDetails[date]) dailyDetails[date] = [];
      dailyDetails[date].push(tx);
    }
  });

  const by_plan = Array.from(byPlanMap.values()).sort((a, b) => b.revenue_cents - a.revenue_cents);
  const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

  return {
    summary: {
      total_revenue_cents: totalRevenue,
      successful_transactions: txCount,
    },
    by_plan,
    daily,
    transactions,
    daily_details: dailyDetails,
  };
};

// TODO(admin): Mock transaction generator for demo/testing only.
// Remove when mock mode is retired; exports/charts should read from /v1/admin/revenue-report.
const generateMockRevenueTransactions = (rangeDays = 30, endDateStr = null) => {
  const today = endDateStr ? new Date(endDateStr) : new Date();
  const mockCodes = (MOCK_INFLUENCER_CODES || []).map((row) => String(row.code || '').toUpperCase()).filter(Boolean);
  const plans = [
    { key: 'basic_monthly', weight: 0.55, base: 1990, span: 800 },
    { key: 'basic_yearly', weight: 0.2, base: 8999, span: 2200 },
    { key: 'premium_monthly', weight: 0.2, base: 2990, span: 1400 },
    { key: 'enterprise', weight: 0.05, base: 19999, span: 4000 },
  ];
  const txs = [];
  let id = 1;

  for (let i = rangeDays - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const daySeed = (date.getDate() * 13 + (date.getMonth() + 1) * 17 + date.getFullYear()) % 97;
    const count = 3 + (daySeed % 4); // 3..6 per day

    for (let t = 0; t < count; t += 1) {
      const pickSeed = (daySeed + t * 19) % 100;
      let acc = 0;
      let plan = plans[0];
      for (const p of plans) {
        acc += p.weight * 100;
        if (pickSeed <= acc) {
          plan = p;
          break;
        }
      }
      const amount = Math.max(100, Math.round(plan.base + ((pickSeed % 11) - 5) * (plan.span / 10)));
      const created = new Date(date);
      created.setHours(8 + (t % 10), (t * 11) % 60, 0, 0);
      txs.push({
        transaction_id: `mock_tx_${id++}`,
        user_id: 1000 + ((daySeed + t) % 9),
        username: `mock_user_${((daySeed + t) % 9) + 1}`,
        email: `mock_user_${((daySeed + t) % 9) + 1}@example.com`,
        influencer_code: mockCodes.length ? mockCodes[(daySeed + t) % mockCodes.length] : null,
        plan_key: plan.key,
        amount_cents: amount,
        currency: 'USD',
        status: 'succeeded',
        payment_method_type: t % 2 === 0 ? 'card' : 'apple_pay',
        stripe_payment_intent_id: `mock_pi_${id}`,
        created_at: created.toISOString(),
        paid_at: created.toISOString(),
      });
    }
  }
  return txs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
};

const AdminPanel = () => {
  const apiBaseUrl = getApiBaseUrl();
  const adminApiBaseUrl = useMemo(() => {
    const trimmed = (apiBaseUrl || '').replace(/\/+$/, '');
    if (trimmed.endsWith('/api')) {
      return trimmed.slice(0, -4);
    }
    return trimmed;
  }, [apiBaseUrl]);

  const token = localStorage.getItem('cryptoai_access_token') || localStorage.getItem('access_token');

  const [users, setUsers] = useState([]);
  const [influencers, setInfluencers] = useState([]);
  const [revenueReport, setRevenueReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sectionErrors, setSectionErrors] = useState({
    users: '',
    influencers: '',
    revenue: ''
  });

  const [newInfluencer, setNewInfluencer] = useState({ name: '', referral_code: '' });
  const [newUser, setNewUser] = useState({ username: '', email: '', full_name: '', password: '' });
  const [thresholdInput, setThresholdInput] = useState('0');
  const [editUser, setEditUser] = useState(null);
  const [editInfluencer, setEditInfluencer] = useState(null);
  const [revenueRange, setRevenueRange] = useState('30d');

  // TODO(admin): Mock toggles are temporary. Delete toggles and localStorage keys when mock mode is removed.
  const [useMockRevenue, setUseMockRevenue] = useState(
    () => localStorage.getItem('admin_use_mock_revenue') === 'true'
  );
  const [influencerRange, setInfluencerRange] = useState('30d');
  const [useMockInfluencers, setUseMockInfluencers] = useState(
    () => localStorage.getItem('admin_mock_influencers') === 'true'
  );
  const [useMockUsers, setUseMockUsers] = useState(
    () => localStorage.getItem('admin_mock_users') === 'true'
  );

  const [influencerSearchInput, setInfluencerSearchInput] = useState('');
  const [influencerSearchQuery, setInfluencerSearchQuery] = useState('');
  const [userSearchInput, setUserSearchInput] = useState('');
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [showRevenueSearch, setShowRevenueSearch] = useState(false);
  const [revenueSearchField, setRevenueSearchField] = useState('user');
  const [revenueSearchKeywordInput, setRevenueSearchKeywordInput] = useState('');
  const [revenueSearchFilter, setRevenueSearchFilter] = useState({ field: 'user', keyword: '' });
  const [activeSectionRefresh, setActiveSectionRefresh] = useState('');
  const todayStr = toDateInput(new Date());
  const defaultFromStr = toDateInput(new Date(Date.now() - 29 * 24 * 3600 * 1000));
  const [showRevenueExport, setShowRevenueExport] = useState(false);
  const [showInfluencerExport, setShowInfluencerExport] = useState(false);
  const [revenueExportFrom, setRevenueExportFrom] = useState(defaultFromStr);
  const [revenueExportTo, setRevenueExportTo] = useState(todayStr);
  const [revenueExportPlan, setRevenueExportPlan] = useState('all');
  const [influencerExportFrom, setInfluencerExportFrom] = useState(defaultFromStr);
  const [influencerExportTo, setInfluencerExportTo] = useState(todayStr);
  const [influencerExportCode, setInfluencerExportCode] = useState('all');
  const [selectedRevenueDetailTitle, setSelectedRevenueDetailTitle] = useState(null);
  const [selectedRevenueDetailTransactions, setSelectedRevenueDetailTransactions] = useState([]);
  const [revenueCustomFrom, setRevenueCustomFrom] = useState(defaultFromStr);
  const [revenueCustomTo, setRevenueCustomTo] = useState(todayStr);

  const headers = useMemo(() => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  }), [token]);

  const thresholdCents = useMemo(() => {
    const parsed = Number(thresholdInput);
    if (Number.isNaN(parsed) || parsed < 0) return 0;
    return Math.round(parsed * 100);
  }, [thresholdInput]);

  const formatCurrency = (cents) => {
    const amount = Number(cents || 0) / 100;
    return `$${amount.toFixed(2)}`;
  };

  const rangeDays = useMemo(() => {
    if (revenueRange === '7d') return 7;
    if (revenueRange === '30d') return 30;
    return 90;
  }, [revenueRange]);
  const customRangeDays = useMemo(() => {
    if (!revenueCustomFrom || !revenueCustomTo) return 30;
    const from = new Date(revenueCustomFrom);
    const to = new Date(revenueCustomTo);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 30;
    const ms = endOfDay(revenueCustomTo).getTime() - startOfDay(revenueCustomFrom).getTime();
    const days = Math.floor(ms / (24 * 3600 * 1000)) + 1;
    return Math.max(1, days);
  }, [revenueCustomFrom, revenueCustomTo]);
  const effectiveRevenueDays = useMemo(
    () => (revenueRange === 'custom' ? customRangeDays : rangeDays),
    [revenueRange, customRangeDays, rangeDays]
  );
  const revenueApiQuery = useMemo(() => {
    if (revenueRange === 'custom' && revenueCustomFrom && revenueCustomTo) {
      const p = new URLSearchParams({
        date_from: revenueCustomFrom,
        date_to: revenueCustomTo,
      });
      return p.toString();
    }
    return `range_days=${rangeDays}`;
  }, [revenueRange, revenueCustomFrom, revenueCustomTo, rangeDays]);

  const influencerRangeDays = useMemo(() => {
    if (influencerRange === '7d') return 7;
    if (influencerRange === '30d') return 30;
    return 90;
  }, [influencerRange]);

  const debouncedInfluencerSearch = influencerSearchQuery;
  const debouncedUserSearch = userSearchQuery;
  // TODO(admin): Mock analytics path. Remove and use server-derived influencer metrics only.
  const mockInfluencerAnalytics = useMemo(() => {
    if (!useMockInfluencers) return null;
    return generateMockInfluencerAnalytics(
      influencers.map((row) => ({
        name: row.name,
        code: row.referral_code,
        status: row.status
      })),
      influencerRangeDays,
      thresholdCents
    );
  }, [useMockInfluencers, influencers, influencerRangeDays, thresholdCents]);

  const influencerTableRows = useMemo(() => {
    if (!useMockInfluencers) return influencers;
    return influencers.map((base) => {
      const match = mockInfluencerAnalytics?.per_code?.find((row) => row.code === base.referral_code);
      return {
        ...base,
        usage_count: match?.usage_count ?? 0,
        total_revenue_cents: match?.revenue_cents ?? 0,
        commission_cents: match?.commission_cents ?? 0
      };
    });
  }, [useMockInfluencers, influencers, mockInfluencerAnalytics]);

  const filteredInfluencerRows = useMemo(() => {
    if (!debouncedInfluencerSearch) return influencerTableRows;
    return influencerTableRows.filter((row) =>
      fuzzyMatch(debouncedInfluencerSearch, row.name, row.referral_code, row.status)
    );
  }, [debouncedInfluencerSearch, influencerTableRows]);

  const filteredUsers = useMemo(() => {
    if (!debouncedUserSearch) return users;
    return users.filter((user) =>
      fuzzyMatch(
        debouncedUserSearch,
        user.full_name,
        user.username,
        user.email,
        user.user_id,
        user.role,
        user.referral_code_used
      )
    );
  }, [debouncedUserSearch, users]);

  const filteredRevenueTransactions = useMemo(() => {
    const txs = revenueReport?.transactions || [];
    const keyword = (revenueSearchFilter?.keyword || '').trim().toLowerCase();
    if (!keyword) return txs;

    const field = revenueSearchFilter?.field || 'user';
    return txs.filter((tx) => {
      if (field === 'email') {
        return String(tx.email || '').toLowerCase().includes(keyword);
      }
      if (field === 'transaction_id') {
        return String(tx.transaction_id || '').toLowerCase().includes(keyword);
      }
      return (
        String(tx.username || '').toLowerCase().includes(keyword) ||
        String(tx.user_id || '').toLowerCase().includes(keyword)
      );
    });
  }, [revenueReport, revenueSearchFilter]);
  const hasRevenueSearch = !!(revenueSearchFilter?.keyword || '').trim();

  const filteredRevenueReport = useMemo(
    () => aggregateRevenueFromTransactions(filteredRevenueTransactions),
    [filteredRevenueTransactions]
  );

  const filteredRevenueDaily = useMemo(() => {
    if (!hasRevenueSearch) return revenueReport?.daily || [];
    return filteredRevenueReport?.daily || [];
  }, [hasRevenueSearch, revenueReport, filteredRevenueReport]);

  const filteredRevenueByPlan = useMemo(() => {
    if (!hasRevenueSearch) return revenueReport?.by_plan || [];
    return filteredRevenueReport?.by_plan || [];
  }, [hasRevenueSearch, revenueReport, filteredRevenueReport]);

  const filteredRevenueSummary = useMemo(() => {
    if (!hasRevenueSearch) return revenueReport?.summary;
    return filteredRevenueReport?.summary || revenueReport?.summary;
  }, [hasRevenueSearch, filteredRevenueReport, revenueReport]);

  const openRevenueDetails = (title, rows) => {
    setSelectedRevenueDetailTitle(title);
    setSelectedRevenueDetailTransactions(rows || []);
  };

  const sectionState = useMemo(() => ({
    influencers: {
      loading: loading && activeSectionRefresh !== 'users' && activeSectionRefresh !== 'revenue',
      error: sectionErrors.influencers,
      empty: !loading && !sectionErrors.influencers && filteredInfluencerRows.length === 0,
    },
    users: {
      loading: loading && activeSectionRefresh === 'users',
      error: sectionErrors.users,
      empty: !loading && !sectionErrors.users && filteredUsers.length === 0,
    },
    revenue: {
      loading: loading && activeSectionRefresh === 'revenue',
      error: sectionErrors.revenue,
      empty: !loading && !sectionErrors.revenue && filteredRevenueByPlan.length === 0,
    }
  }), [
    loading,
    activeSectionRefresh,
    sectionErrors,
    filteredInfluencerRows.length,
    filteredUsers.length,
    filteredRevenueByPlan.length
  ]);

  // TODO(admin): Mock revenue aggregation path. Remove after switching to DB-only revenue report.
  const mockRevenueReport = useMemo(() => {
    const txs = generateMockRevenueTransactions(
      effectiveRevenueDays,
      revenueRange === 'custom' ? revenueCustomTo : null
    );
    return aggregateRevenueFromTransactions(txs);
  }, [effectiveRevenueDays, revenueRange, revenueCustomTo]);

  const revenuePlanOptions = useMemo(() => {
    const plans = (revenueReport?.by_plan || []).map((p) => p.plan_key).filter(Boolean);
    return Array.from(new Set(plans));
  }, [revenueReport]);

  const handleExportRevenue = async () => {
    const from = revenueExportFrom || defaultFromStr;
    const to = revenueExportTo || todayStr;
    const plan = revenueExportPlan || 'all';

    try {
      let exportReport = revenueReport || {};
      // TODO(admin): Mock export branch. Remove when exports are fully DB-driven.
      if (useMockRevenue) {
        const fromTime = startOfDay(from).getTime();
        const toTime = endOfDay(to).getTime();
        const days = Math.max(1, Math.floor((toTime - fromTime) / (24 * 3600 * 1000)) + 1);
        const txs = generateMockRevenueTransactions(days, to);
        exportReport = aggregateRevenueFromTransactions(
          txs.filter((tx) => safeDateInRange(tx.created_at, from, to))
        );
      } else {
        const params = new URLSearchParams({ date_from: from, date_to: to });
        const exportUrl = joinUrl(adminApiBaseUrl, `/v1/admin/revenue-report?${params.toString()}`);
        exportReport = await fetchJson(exportUrl, { headers });
      }

      const txRaw = Array.isArray(exportReport?.transactions) ? exportReport.transactions : [];
      const txFiltered = txRaw.filter((tx) => {
        if (!safeDateInRange(tx.created_at, from, to)) return false;
        if (plan !== 'all' && tx.plan_key !== plan) return false;
        return true;
      });
      const byPlanMap = new Map();
      const byDayMap = new Map();
      txFiltered.forEach((tx) => {
        const planKey = tx.plan_key || 'unknown';
        const amount = Number(tx.amount_cents || 0);
        const dateKey = (tx.created_at || '').slice(0, 10);

        const planAcc = byPlanMap.get(planKey) || { plan_key: planKey, count: 0, revenue_cents: 0 };
        planAcc.count += 1;
        planAcc.revenue_cents += amount;
        byPlanMap.set(planKey, planAcc);

        if (dateKey) {
          const dayAcc = byDayMap.get(dateKey) || { date: dateKey, transactions: 0, revenue_cents: 0 };
          dayAcc.transactions += 1;
          dayAcc.revenue_cents += amount;
          byDayMap.set(dateKey, dayAcc);
        }
      });

      const byPlanRows = [
        ['plan_key', 'count', 'revenue_cents'],
        ...Array.from(byPlanMap.values())
          .sort((a, b) => b.revenue_cents - a.revenue_cents)
          .map((row) => [row.plan_key, row.count, row.revenue_cents]),
      ];
      const dailyRows = [
        ['date', 'transactions', 'revenue_cents'],
        ...Array.from(byDayMap.values())
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((row) => [row.date, row.transactions, row.revenue_cents]),
      ];
      const txRows = [
        [
          'transaction_id',
          'user_id',
          'username',
          'email',
          'plan_key',
          'amount_cents',
          'currency',
          'payment_method_type',
          'status',
          'influencer_code',
          'created_at',
          'paid_at',
        ],
        ...txFiltered.map((tx) => ([
          tx.transaction_id || '',
          tx.user_id || '',
          tx.username || '',
          tx.email || '',
          tx.plan_key || '',
          Number(tx.amount_cents || 0),
          tx.currency || '',
          tx.payment_method_type || '',
          tx.status || '',
          tx.influencer_code || '',
          tx.created_at || '',
          tx.paid_at || '',
        ])),
      ];

      const metaRows = [
        ['export_scope', 'revenue_report'],
        ['mock_mode', String(!!useMockRevenue)],
        ['date_from', from],
        ['date_to', to],
        ['selected_plan', plan],
        ['records', String(txFiltered.length)],
        ['exported_at', new Date().toISOString()],
      ];

      const xml = buildExcelXml([
        { name: 'meta', rows: metaRows },
        { name: 'revenue_transactions', rows: txRows },
        { name: 'revenue_by_plan', rows: byPlanRows },
        { name: 'revenue_daily', rows: dailyRows },
      ]);
      downloadExcelXml(`revenue_report_${from}_to_${to}.xls`, xml);
      setShowRevenueExport(false);
    } catch (err) {
      setError(err.message || 'Failed to export revenue report');
    }
  };

  const handleExportInfluencers = async () => {
    const from = influencerExportFrom || defaultFromStr;
    const to = influencerExportTo || todayStr;
    const code = influencerExportCode || 'all';

    try {
      let sourceTransactions = [];
      // TODO(admin): Mock export branch. Remove when exports are fully DB-driven.
      if (useMockInfluencers) {
        const fromTime = startOfDay(from).getTime();
        const toTime = endOfDay(to).getTime();
        const days = Math.max(1, Math.floor((toTime - fromTime) / (24 * 3600 * 1000)) + 1);
        sourceTransactions = generateMockRevenueTransactions(days, to)
          .filter((tx) => safeDateInRange(tx.created_at, from, to));
      } else {
        const params = new URLSearchParams({ date_from: from, date_to: to });
        const exportUrl = joinUrl(adminApiBaseUrl, `/v1/admin/revenue-report?${params.toString()}`);
        const exportReport = await fetchJson(exportUrl, { headers });
        sourceTransactions = Array.isArray(exportReport?.transactions) ? exportReport.transactions : [];
      }

      const nameMap = new Map(
        (influencerTableRows || []).map((row) => [String(row.referral_code || '').toUpperCase(), row.name || 'Unknown'])
      );

      const txFiltered = sourceTransactions.filter((tx) => {
        const txCode = String(tx.influencer_code || '').toUpperCase();
        if (!txCode) return false;
        if (!safeDateInRange(tx.created_at, from, to)) return false;
        if (code !== 'all' && txCode !== String(code).toUpperCase()) return false;
        return true;
      });

      const byCodeMap = new Map();
      txFiltered.forEach((tx) => {
        const txCode = String(tx.influencer_code || '').toUpperCase();
        const amount = Number(tx.amount_cents || 0);
        const acc = byCodeMap.get(txCode) || {
          code: txCode,
          influencer: nameMap.get(txCode) || 'Unknown',
          usage_count: 0,
          revenue_cents: 0,
          commission_cents: 0,
        };
        acc.usage_count += 1;
        acc.revenue_cents += amount;
        byCodeMap.set(txCode, acc);
      });

      const threshold = Number(thresholdCents || 0);
      const summaryRows = [
        ['code', 'influencer', 'usage', 'revenue_cents', 'commission_cents'],
        ...Array.from(byCodeMap.values())
          .map((row) => ({
            ...row,
            commission_cents: Math.round(Math.max(0, row.revenue_cents - threshold) * 0.3),
          }))
          .sort((a, b) => b.revenue_cents - a.revenue_cents)
          .map((row) => [row.code, row.influencer, row.usage_count, row.revenue_cents, row.commission_cents]),
      ];

      const txRows = [
        [
          'code',
          'influencer',
          'transaction_id',
          'user_id',
          'username',
          'email',
          'plan_key',
          'amount_cents',
          'currency',
          'payment_method_type',
          'status',
          'created_at',
          'paid_at',
        ],
        ...txFiltered.map((tx) => {
          const txCode = String(tx.influencer_code || '').toUpperCase();
          return [
            txCode,
            nameMap.get(txCode) || 'Unknown',
            tx.transaction_id || '',
            tx.user_id || '',
            tx.username || '',
            tx.email || '',
            tx.plan_key || '',
            Number(tx.amount_cents || 0),
            tx.currency || '',
            tx.payment_method_type || '',
            tx.status || '',
            tx.created_at || '',
            tx.paid_at || '',
          ];
        }),
      ];

      const metaRows = [
        ['export_scope', 'influencer_codes_report'],
        ['mock_mode', String(!!useMockInfluencers)],
        ['date_from', from],
        ['date_to', to],
        ['selected_code', code],
        ['records', String(txFiltered.length)],
        ['exported_at', new Date().toISOString()],
      ];

      const xml = buildExcelXml([
        { name: 'meta', rows: metaRows },
        { name: 'influencer_codes_summary', rows: summaryRows },
        { name: 'influencer_code_transactions', rows: txRows },
      ]);
      downloadExcelXml(`influencer_codes_report_${from}_to_${to}.xls`, xml);
      setShowInfluencerExport(false);
    } catch (err) {
      setError(err.message || 'Failed to export influencer codes report');
    }
  };

  const readResponseError = async (res) => {
    let bodyText = '';
    try {
      bodyText = await res.text();
    } catch (err) {
      bodyText = '';
    }
    const detail = bodyText ? ` - ${bodyText}` : '';
    return `HTTP ${res.status} ${res.statusText}${detail} (${res.url || 'unknown url'})`;
  };

  const fetchJson = async (url, options = {}) => {
    let res;
    try {
      res = await fetch(url, {
        credentials: 'include',
        ...options
      });
    } catch (networkError) {
      throw new Error(`Failed to fetch ${url}. Check backend status and browser network access.`);
    }
    if (!res.ok) {
      throw new Error(await readResponseError(res));
    }
    return res.json();
  };

  const normalizeInfluencerRow = (row) => {
    const code = (row.code ?? row.referral_code ?? '').toString();
    const status = row.status ?? (row.is_active ? 'active' : 'inactive');
    const name = row.influencer_name ?? row.name ?? 'Unknown';

    // Important: id is the code now (no numeric IDs)
    return {
      id: code,
      name,
      referral_code: code,
      status,
      is_active: status === 'active',
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      usage_count: Number(row.usage_count || 0),
      total_revenue_cents: Number(row.total_revenue_cents || 0),
      commission_cents: Number(row.commission_cents || 0),
    };
  };

  const fetchAdminData = async (
    nextThresholdCents = thresholdCents,
    nextUseMock = useMockRevenue,
    nextUseMockInfluencers = useMockInfluencers,
    nextUseMockUsers = useMockUsers,
    refreshScope = ''
  ) => {
    setActiveSectionRefresh(refreshScope);
    setLoading(true);
    setError('');
    setSuccess('');
    setSectionErrors({ users: '', influencers: '', revenue: '' });

    try {
      const usersUrl = joinUrl(adminApiBaseUrl, '/v1/admin/users');
      const influencerCodesUrl = joinUrl(adminApiBaseUrl, '/v1/admin/influencer-codes');
      const influencersFallbackUrl = joinUrl(
        adminApiBaseUrl,
        `/v1/admin/influencers?commission_threshold_cents=${nextThresholdCents}`
      );
      const revenueUrl = joinUrl(adminApiBaseUrl, `/v1/admin/revenue?${revenueApiQuery}`);
      const revenueFallbackUrl = joinUrl(adminApiBaseUrl, `/v1/admin/revenue-report?${revenueApiQuery}`);

      // TODO(admin): Mock data branches for testing. Remove and always call APIs in production.
      const usersDataPromise = nextUseMockUsers
        ? Promise.resolve({ users: MOCK_USERS })
        : fetchJson(usersUrl, { headers });

      const codesPromise = nextUseMockInfluencers
        ? Promise.resolve({ codes: MOCK_INFLUENCER_CODES })
        : fetchJson(influencerCodesUrl, { headers }).catch(async () =>
            fetchJson(influencersFallbackUrl, { headers })
          );

      const revenueDataPromise = nextUseMock
        ? Promise.resolve(mockRevenueReport)
        : fetchJson(revenueUrl, { headers }).catch(async () =>
            fetchJson(revenueFallbackUrl, { headers })
          );

      const [usersResult, influencersResult, revenueResult] = await Promise.allSettled([
        usersDataPromise,
        codesPromise,
        revenueDataPromise,
      ]);

      const nextSectionErrors = { users: '', influencers: '', revenue: '' };

      if (usersResult.status === 'fulfilled') {
        setUsers(usersResult.value?.users || []);
      } else {
        setUsers([]);
        nextSectionErrors.users = formatReadableError(usersResult.reason?.message || 'Failed to load users.');
      }

      if (influencersResult.status === 'fulfilled') {
        const influencersData = influencersResult.value;
        const rawCodes = Array.isArray(influencersData?.codes)
          ? influencersData.codes
          : Array.isArray(influencersData?.influencers)
            ? influencersData.influencers
            : [];

        const normalizedInfluencers = rawCodes
          .map(normalizeInfluencerRow)
          .filter((r) => r.referral_code);

        setInfluencers(normalizedInfluencers);
      } else {
        setInfluencers([]);
        nextSectionErrors.influencers = formatReadableError(
          influencersResult.reason?.message || 'Failed to load influencer codes.'
        );
      }

      if (revenueResult.status === 'fulfilled') {
        setRevenueReport(revenueResult.value || null);
      } else {
        setRevenueReport(nextUseMock ? mockRevenueReport : null);
        nextSectionErrors.revenue = formatReadableError(
          revenueResult.reason?.message || 'Failed to load revenue report.'
        );
      }

      setSectionErrors(nextSectionErrors);
      if (nextSectionErrors.users && nextSectionErrors.influencers && nextSectionErrors.revenue) {
        setError('Failed to load admin data. You can enable mock toggles to continue demo.');
      }
    } catch (err) {
      setError(formatReadableError(err.message || 'Failed to load admin data'));
    } finally {
      setLoading(false);
      setActiveSectionRefresh('');
    }
  };

  useEffect(() => {
    fetchAdminData(thresholdCents, useMockRevenue, useMockInfluencers, useMockUsers, '');
  }, [revenueApiQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreateInfluencer = async () => {
    if (!newInfluencer.name || !newInfluencer.referral_code) return;
    setError('');
    setSuccess('');

    try {
      const res = await fetch(joinUrl(adminApiBaseUrl, '/v1/admin/influencers'), {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(newInfluencer)
      });
      if (!res.ok) throw new Error(await readResponseError(res));

      setNewInfluencer({ name: '', referral_code: '' });
      setSuccess('Influencer created successfully.');
      fetchAdminData(thresholdCents, useMockRevenue, useMockInfluencers, useMockUsers, 'influencers');
    } catch (err) {
      setError(err.message || 'Failed to create influencer');
    }
  };

  const handleCreateUser = async () => {
    if (!newUser.username || !newUser.email || !newUser.full_name || !newUser.password) return;
    setError('');
    setSuccess('');

    try {
      const res = await fetch(joinUrl(adminApiBaseUrl, '/v1/admin/users'), {
        method: 'POST',
        credentials: 'include',
        headers,
        body: JSON.stringify(newUser)
      });
      if (!res.ok) throw new Error(await readResponseError(res));
      setNewUser({ username: '', email: '', full_name: '', password: '' });
      setSuccess('User created successfully.');
      fetchAdminData(thresholdCents, useMockRevenue, useMockInfluencers, useMockUsers, 'users');
    } catch (err) {
      setError(err.message || 'Failed to create user');
    }
  };

  const handleUpdateUser = async () => {
    if (!editUser) return;
    setError('');
    setSuccess('');

    try {
      const res = await fetch(joinUrl(adminApiBaseUrl, `/v1/admin/users/${editUser.user_id}`), {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify(editUser)
      });
      if (!res.ok) throw new Error(await readResponseError(res));
      setEditUser(null);
      setSuccess('User updated successfully.');
      fetchAdminData(thresholdCents, useMockRevenue, useMockInfluencers, useMockUsers, 'users');
    } catch (err) {
      setError(err.message || 'Failed to update user');
    }
  };

  const handleDeleteUser = async (user) => {
    if (!window.confirm(`Delete user ${user.username}?`)) return;
    setError('');
    setSuccess('');

    try {
      const res = await fetch(joinUrl(adminApiBaseUrl, `/v1/admin/users/${user.user_id}`), {
        method: 'DELETE',
        credentials: 'include',
        headers
      });
      if (!res.ok) throw new Error(await readResponseError(res));
      setSuccess('User deleted.');
      fetchAdminData(thresholdCents, useMockRevenue, useMockInfluencers, useMockUsers, 'users');
    } catch (err) {
      setError(err.message || 'Failed to delete user');
    }
  };

  const handleUpdateInfluencer = async () => {
    if (!editInfluencer) return;
    setError('');
    setSuccess('');

    const code = (editInfluencer.referral_code || '').trim();
    if (!code) {
      setError('Influencer code is required.');
      return;
    }

    try {
      const targetCode = (
        editInfluencer.original_referral_code ||
        editInfluencer.original_code ||
        editInfluencer.id ||
        editInfluencer.referral_code
      );
      // Backend supports legacy keys: name/referral_code/status
      const payload = {
        name: editInfluencer.name,
        referral_code: editInfluencer.referral_code,
        status: editInfluencer.status
      };

      const res = await fetch(joinUrl(adminApiBaseUrl, `/v1/admin/influencers/${encodeURIComponent(targetCode)}`), {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(await readResponseError(res));
      setEditInfluencer(null);
      setSuccess('Influencer updated successfully.');
      fetchAdminData(thresholdCents, useMockRevenue, useMockInfluencers, useMockUsers, 'influencers');
    } catch (err) {
      setError(err.message || 'Failed to update influencer');
    }
  };

  const handleDeleteInfluencer = async (item) => {
    if (!window.confirm(`Delete influencer ${item.name} (${item.referral_code})?`)) return;
    setError('');
    setSuccess('');

    try {
      const res = await fetch(joinUrl(adminApiBaseUrl, `/v1/admin/influencers/${encodeURIComponent(item.referral_code)}`), {
        method: 'DELETE',
        credentials: 'include',
        headers
      });
      if (!res.ok) throw new Error(await readResponseError(res));
      setSuccess('Influencer deleted.');
      fetchAdminData(thresholdCents, useMockRevenue, useMockInfluencers, useMockUsers, 'influencers');
    } catch (err) {
      setError(err.message || 'Failed to delete influencer');
    }
  };

  const handleToggleInfluencer = async (item) => {
    const nextStatus = item.status === 'active' ? 'inactive' : 'active';
    setError('');
    setSuccess('');

    try {
      const res = await fetch(joinUrl(adminApiBaseUrl, `/v1/admin/influencers/${encodeURIComponent(item.referral_code)}`), {
        method: 'PATCH',
        credentials: 'include',
        headers,
        body: JSON.stringify({ status: nextStatus })
      });
      if (!res.ok) throw new Error(await readResponseError(res));
      setSuccess(`Influencer ${nextStatus}.`);
      fetchAdminData(thresholdCents, useMockRevenue, useMockInfluencers, useMockUsers, 'influencers');
    } catch (err) {
      setError(err.message || 'Failed to update influencer status');
    }
  };

  const handleThresholdBlur = () => {
    fetchAdminData(thresholdCents, useMockRevenue, useMockInfluencers, useMockUsers, 'influencers');
  };

  const handleToggleMockRevenue = () => {
    const nextValue = !useMockRevenue;
    setUseMockRevenue(nextValue);
    localStorage.setItem('admin_use_mock_revenue', String(nextValue));
    fetchAdminData(thresholdCents, nextValue, useMockInfluencers, useMockUsers, 'revenue');
  };

  const handleToggleMockInfluencers = () => {
    const nextValue = !useMockInfluencers;
    setUseMockInfluencers(nextValue);
    localStorage.setItem('admin_mock_influencers', String(nextValue));
    fetchAdminData(thresholdCents, useMockRevenue, nextValue, useMockUsers, 'influencers');
  };

  const handleToggleMockUsers = () => {
    const nextValue = !useMockUsers;
    setUseMockUsers(nextValue);
    localStorage.setItem('admin_mock_users', String(nextValue));
    fetchAdminData(thresholdCents, useMockRevenue, useMockInfluencers, nextValue, 'users');
  };

  const refreshInfluencersSection = () =>
    fetchAdminData(thresholdCents, useMockRevenue, useMockInfluencers, useMockUsers, 'influencers');
  const refreshUsersSection = () =>
    fetchAdminData(thresholdCents, useMockRevenue, useMockInfluencers, useMockUsers, 'users');
  const refreshRevenueSection = () =>
    fetchAdminData(thresholdCents, useMockRevenue, useMockInfluencers, useMockUsers, 'revenue');
  const applyRevenueSearch = () => {
    setRevenueSearchFilter({
      field: revenueSearchField,
      keyword: (revenueSearchKeywordInput || '').trim(),
    });
    setShowRevenueSearch(false);
  };
  const clearRevenueSearch = () => {
    setRevenueSearchFilter({ field: 'user', keyword: '' });
    setRevenueSearchField('user');
    setRevenueSearchKeywordInput('');
    setShowRevenueSearch(false);
  };

  useEffect(() => {
    if (useMockRevenue) {
      setRevenueReport(mockRevenueReport);
    }
  }, [mockRevenueReport, useMockRevenue]);

  return (
    <div className="min-h-screen bg-background text-foreground py-10">
      <div className="max-w-6xl mx-auto px-6 space-y-10">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground text-sm">User management, influencer tracking, revenue reporting.</p>
        </div>

        <div className="bg-muted/30 border border-border rounded-lg px-4 py-3 text-xs text-muted-foreground">
          API base URL: <span className="font-mono text-foreground">{adminApiBaseUrl || '(empty)'}</span>
          <span className="ml-2">Avoid using container hostname in browser mode.</span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
            {formatReadableError(error)}
          </div>
        )}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">
            {success}
          </div>
        )}

        {loading && !activeSectionRefresh && (
          <div className="text-sm text-muted-foreground">Loading admin data...</div>
        )}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Revenue</div>
            <div className="text-2xl font-semibold">
              {revenueReport?.summary?.total_revenue_cents
                ? `$${(revenueReport.summary.total_revenue_cents / 100).toFixed(2)}`
                : '$0.00'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Successful transactions: {revenueReport?.summary?.successful_transactions || 0}
            </div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Influencers</div>
            <div className="text-2xl font-semibold">{influencers.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Active codes in system</div>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Users</div>
            <div className="text-2xl font-semibold">{users.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Most recent 50 users</div>
          </div>
        </section>

        <section className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Create Influencer</h2>
          {useMockInfluencers && (
            <div className="text-xs text-muted-foreground">
              Mock influencer mode is enabled. Write operations are disabled.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              className="px-3 py-2 border border-border rounded-md bg-background"
              placeholder="Name"
              value={newInfluencer.name}
              onChange={(e) => setNewInfluencer({ ...newInfluencer, name: e.target.value })}
            />
            <input
              className="px-3 py-2 border border-border rounded-md bg-background"
              placeholder="Referral Code"
              value={newInfluencer.referral_code}
              onChange={(e) => setNewInfluencer({ ...newInfluencer, referral_code: e.target.value })}
            />
            <button
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium"
              onClick={handleCreateInfluencer}
              disabled={useMockInfluencers}
            >
              Add Influencer
            </button>
          </div>
        </section>

        <section className="bg-card border border-border rounded-xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Create User</h2>
          {useMockUsers && (
            <div className="text-xs text-muted-foreground">
              Mock users mode is enabled. Write operations are disabled.
            </div>
          )}
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <input
                className="px-3 py-2 border border-border rounded-md bg-background"
                placeholder="Username"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
              />
              <input
                className="px-3 py-2 border border-border rounded-md bg-background"
                placeholder="Email"
                value={newUser.email}
                onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
              />
              <input
                className="px-3 py-2 border border-border rounded-md bg-background"
                placeholder="Full name"
                value={newUser.full_name}
                onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
              />
              <input
                className="px-3 py-2 border border-border rounded-md bg-background"
                placeholder="Password"
                type="password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
              />
            </div>
            <div className="flex justify-stretch md:justify-end">
              <button
                className="w-full md:w-48 px-4 py-2 rounded-md bg-primary text-primary-foreground font-medium"
                onClick={handleCreateUser}
                disabled={useMockUsers}
              >
                Add User
              </button>
            </div>
          </div>
        </section>

        <section className="bg-card border border-border rounded-xl p-6 space-y-4">
          <SectionHeader
            title="Influencer Codes"
            subtitle="Manage influencer code status."
            onRefresh={refreshInfluencersSection}
            right={(
              <>
                <SearchBar
                  value={influencerSearchInput}
                  onValueChange={setInfluencerSearchInput}
                  onSearch={() => setInfluencerSearchQuery(influencerSearchInput)}
                  placeholder="Search name, code, status..."
                  className="md:w-80"
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Mock data</span>
                  <button
                    className={`relative w-10 h-5 rounded-full transition ${
                      useMockInfluencers ? 'bg-emerald-500' : 'bg-border'
                    }`}
                    onClick={handleToggleMockInfluencers}
                    aria-label="Toggle mock influencer data"
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition ${
                        useMockInfluencers ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Commission threshold</span>
                  <input
                    className="px-3 py-2 border border-border rounded-md bg-background w-32"
                    value={thresholdInput}
                    onChange={(e) => setThresholdInput(e.target.value)}
                    onBlur={handleThresholdBlur}
                    placeholder="0"
                  />
                </div>
              </>
            )}
          />

          {sectionState.influencers.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
              {sectionState.influencers.error}
            </div>
          )}
          {sectionState.influencers.loading && <SectionLoading label="Loading influencer codes..." />}
          {sectionState.influencers.empty && <SectionEmpty label="No influencer code records found." />}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left py-2">Name</th>
                  <th className="text-left py-2">Code</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-right py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInfluencerRows.map((item) => (
                  <tr key={item.id} className="border-b border-border/60 hover:bg-muted/20 transition">
                    <td className="py-2">{item.name}</td>
                    <td className="py-2 font-mono">{item.referral_code}</td>
                    <td className="py-2">{item.status}</td>
                    <td className="py-2">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="w-16 py-1 text-xs border border-border rounded text-center"
                          onClick={() => setEditInfluencer({
                            ...item,
                            original_referral_code: item.referral_code,
                          })}
                          disabled={useMockInfluencers}
                        >
                          Edit
                        </button>
                        <button
                          className="w-16 py-1 text-xs border border-border rounded text-center"
                          onClick={() => handleDeleteInfluencer(item)}
                          disabled={useMockInfluencers}
                        >
                          Delete
                        </button>
                        {item.status && (
                          <button
                            className="w-16 py-1 text-xs border border-border rounded text-center"
                            onClick={() => handleToggleInfluencer(item)}
                            disabled={useMockInfluencers}
                          >
                            {item.status === 'active' ? 'Disable' : 'Enable'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredInfluencerRows.length && (
                  <tr>
                    <td className="py-4 text-center text-muted-foreground" colSpan={4}>
                      No results found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-card border border-border rounded-xl p-6 space-y-4">
          <SectionHeader
            title="Recent Users"
            subtitle="Latest users from the auth table."
            onRefresh={refreshUsersSection}
            right={(
              <>
                <SearchBar
                  value={userSearchInput}
                  onValueChange={setUserSearchInput}
                  onSearch={() => setUserSearchQuery(userSearchInput)}
                  placeholder="Search name, email, id..."
                  className="md:w-80"
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Mock data</span>
                  <button
                    className={`relative w-10 h-5 rounded-full transition ${
                      useMockUsers ? 'bg-emerald-500' : 'bg-border'
                    }`}
                    onClick={handleToggleMockUsers}
                    aria-label="Toggle mock users data"
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition ${
                        useMockUsers ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
              </>
            )}
          />

          {sectionState.users.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
              {sectionState.users.error}
            </div>
          )}
          {sectionState.users.loading && <SectionLoading label="Loading users..." />}
          {sectionState.users.empty && <SectionEmpty label="No user records found." />}

          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left py-2">Username</th>
                  <th className="text-left py-2">Email</th>
                  <th className="text-left py-2">Role</th>
                  <th className="text-left py-2">Referred?</th>
                  <th className="text-left py-2">Influencer Code</th>
                  <th className="text-left py-2">Influencer</th>
                  <th className="text-left py-2">Status</th>
                  <th className="text-right py-2">Created</th>
                  <th className="text-right py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.user_id} className="border-b border-border/60 hover:bg-muted/20 transition">
                    <td className="py-2">{user.username}</td>
                    <td className="py-2">{user.email}</td>
                    <td className="py-2">{user.role}</td>
                    <td className="py-2">{user.referral_code_used ? 'Yes' : 'No'}</td>
                    <td className="py-2 font-mono">{user.referral_code_used || '-'}</td>
                    <td className="py-2">{user.referred_influencer_name || '-'}</td>
                    <td className="py-2">{user.is_active ? 'active' : 'inactive'}</td>
                    <td className="py-2 text-right">{new Date(user.created_at).toLocaleDateString()}</td>
                    <td className="py-2 text-right space-x-2">
                      <button
                        className="px-2 py-1 text-xs border border-border rounded"
                        onClick={() => setEditUser({ ...user })}
                        disabled={useMockUsers}
                      >
                        Edit
                      </button>
                      <button
                        className="px-2 py-1 text-xs border border-border rounded"
                        onClick={() => handleDeleteUser(user)}
                        disabled={useMockUsers}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
                {!filteredUsers.length && (
                  <tr>
                    <td className="py-4 text-center text-muted-foreground" colSpan={9}>
                      No results found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-card border border-border rounded-xl p-6 space-y-4">
          <SectionHeader
            title="Revenue Report"
            subtitle="Summary, trend and plan split."
            onRefresh={refreshRevenueSection}
            right={(
              <>
                <button
                  className="px-3 py-2 text-xs border border-border rounded-md hover:bg-muted/40 transition"
                  onClick={() => setShowRevenueSearch(true)}
                >
                  Search
                </button>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Mock data</span>
                  <button
                    className={`relative w-10 h-5 rounded-full transition ${
                      useMockRevenue ? 'bg-emerald-500' : 'bg-border'
                    }`}
                    onClick={handleToggleMockRevenue}
                    aria-label="Toggle mock revenue data"
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition ${
                        useMockRevenue ? 'translate-x-5' : ''
                      }`}
                    />
                  </button>
                </div>
                <button
                  className="px-3 py-2 text-xs border border-border rounded-md hover:bg-muted/40 transition"
                  onClick={() => setShowRevenueExport(true)}
                >
                  Export
                </button>
                <select
                  className="px-3 py-2 border border-border rounded-md bg-background text-sm"
                  value={revenueRange}
                  onChange={(e) => setRevenueRange(e.target.value)}
                >
                  <option value="7d">Last 7 days</option>
                  <option value="30d">Last 30 days</option>
                  <option value="90d">Last 90 days</option>
                  <option value="custom">Custom</option>
                </select>
                {revenueRange === 'custom' && (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      className="px-3 py-2 border border-border rounded-md bg-background text-sm"
                      value={revenueCustomFrom}
                      onChange={(e) => setRevenueCustomFrom(e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <input
                      type="date"
                      className="px-3 py-2 border border-border rounded-md bg-background text-sm"
                      value={revenueCustomTo}
                      onChange={(e) => setRevenueCustomTo(e.target.value)}
                    />
                  </div>
                )}
              </>
            )}
          />

          {sectionState.revenue.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded text-sm">
              {sectionState.revenue.error}
            </div>
          )}
          {!!revenueSearchFilter.keyword && (
            <div className="text-xs text-muted-foreground">
              Search: {revenueSearchFilter.field} = "{revenueSearchFilter.keyword}"
            </div>
          )}
          {sectionState.revenue.loading && <SectionLoading label="Loading revenue report..." />}
          {sectionState.revenue.empty && <SectionEmpty label="No revenue rows found for current filters." />}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-background border border-border rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Total Revenue</div>
              <div className="text-2xl font-semibold">{formatCurrency(filteredRevenueSummary?.total_revenue_cents)}</div>
            </div>
            <div className="bg-background border border-border rounded-xl p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Successful Transactions</div>
              <div className="text-2xl font-semibold">{filteredRevenueSummary?.successful_transactions || 0}</div>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Range: {revenueRange === 'custom'
              ? `${revenueCustomFrom || '-'} to ${revenueCustomTo || '-'}`
              : revenueRange === '7d'
                ? 'Last 7 days'
                : revenueRange === '30d'
                  ? 'Last 30 days'
                  : 'Last 90 days'}
          </div>

          <div className="bg-background border border-border rounded-xl p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Revenue Trend</div>
            {filteredRevenueDaily.length ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={filteredRevenueDaily} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.2)" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
                    <Tooltip formatter={(value) => formatCurrency(value)} labelFormatter={(label) => `Date: ${label}`} />
                    <Line type="monotone" dataKey="revenue_cents" stroke="#38bdf8" strokeWidth={2} dot={false} />
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
                  <th className="text-left py-2">Plan</th>
                  <th className="text-right py-2">Count</th>
                  <th className="text-right py-2">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {filteredRevenueByPlan.map((plan) => (
                  <tr
                    key={plan.plan_key}
                    className="border-b border-border/60 hover:bg-muted/20 transition cursor-pointer"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      const details = (filteredRevenueTransactions || []).filter(
                        (tx) => tx.plan_key === plan.plan_key
                      );
                      openRevenueDetails(`Transactions for Plan: ${plan.plan_key}`, details);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        const details = (filteredRevenueTransactions || []).filter(
                          (tx) => tx.plan_key === plan.plan_key
                        );
                        openRevenueDetails(`Transactions for Plan: ${plan.plan_key}`, details);
                      }
                    }}
                  >
                    <td className="py-2">{plan.plan_key}</td>
                    <td className="py-2 text-right">{plan.count}</td>
                    <td className="py-2 text-right">{formatCurrency(plan.revenue_cents)}</td>
                  </tr>
                ))}
                {!filteredRevenueByPlan.length && (
                  <tr>
                    <td className="py-4 text-center text-muted-foreground" colSpan={3}>
                      No results found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {(revenueReport?.daily || []).length > 0 && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left py-2">Date</th>
                    <th className="text-right py-2">Transactions</th>
                    <th className="text-right py-2">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {(revenueReport?.daily || []).map((row) => (
                    <tr
                      key={row.date}
                      className="border-b border-border/60 hover:bg-muted/20 transition cursor-pointer"
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        const details = (filteredRevenueTransactions || []).filter(
                          (tx) => (tx.created_at || '').slice(0, 10) === row.date
                        );
                        openRevenueDetails(`Transactions on ${row.date}`, details);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          const details = (filteredRevenueTransactions || []).filter(
                            (tx) => (tx.created_at || '').slice(0, 10) === row.date
                          );
                          openRevenueDetails(`Transactions on ${row.date}`, details);
                        }
                      }}
                    >
                      <td className="py-2 font-medium">{row.date}</td>
                      <td className="py-2 text-right">{row.transactions}</td>
                      <td className="py-2 text-right">{formatCurrency(row.revenue_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <InfluencerCodesReport
          codes={influencers.map((row) => ({
            name: row.name,
            code: row.referral_code,
            status: row.status
          }))}
          thresholdCents={thresholdCents}
          useMock={useMockInfluencers}
          onToggleMock={handleToggleMockInfluencers}
          range={influencerRange}
          onRangeChange={setInfluencerRange}
          onExportClick={() => setShowInfluencerExport(true)}
        />
      </div>

      {showRevenueSearch && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">Search Revenue</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Field</label>
                <select
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background"
                  value={revenueSearchField}
                  onChange={(e) => setRevenueSearchField(e.target.value)}
                >
                  <option value="user">User</option>
                  <option value="email">Email</option>
                  <option value="transaction_id">Transaction ID</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Keyword</label>
                <input
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background"
                  placeholder="Enter keyword"
                  value={revenueSearchKeywordInput}
                  onChange={(e) => setRevenueSearchKeywordInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') applyRevenueSearch();
                  }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm border border-border rounded"
                onClick={clearRevenueSearch}
              >
                Clear
              </button>
              <button
                className="px-4 py-2 text-sm border border-border rounded"
                onClick={() => setShowRevenueSearch(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded"
                onClick={applyRevenueSearch}
              >
                Search
              </button>
            </div>
          </div>
        </div>
      )}

      {showRevenueExport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">Export Revenue Report</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Date From</label>
                <input
                  type="date"
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background"
                  value={revenueExportFrom}
                  onChange={(e) => setRevenueExportFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Date To</label>
                <input
                  type="date"
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background"
                  value={revenueExportTo}
                  onChange={(e) => setRevenueExportTo(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Plan</label>
                <select
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background"
                  value={revenueExportPlan}
                  onChange={(e) => setRevenueExportPlan(e.target.value)}
                >
                  <option value="all">All Plans</option>
                  {revenuePlanOptions.map((plan) => (
                    <option key={plan} value={plan}>{plan}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm border border-border rounded"
                onClick={() => setShowRevenueExport(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded"
                onClick={handleExportRevenue}
              >
                Export Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {showInfluencerExport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-lg font-semibold">Export Influencer Codes</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Date From</label>
                <input
                  type="date"
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background"
                  value={influencerExportFrom}
                  onChange={(e) => setInfluencerExportFrom(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Date To</label>
                <input
                  type="date"
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background"
                  value={influencerExportTo}
                  onChange={(e) => setInfluencerExportTo(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Influencer</label>
                <select
                  className="w-full mt-1 px-3 py-2 border border-border rounded-md bg-background"
                  value={influencerExportCode}
                  onChange={(e) => setInfluencerExportCode(e.target.value)}
                >
                  <option value="all">All Influencers</option>
                  {influencerTableRows.map((item) => (
                    <option key={item.referral_code} value={item.referral_code}>
                      {item.name} ({item.referral_code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                className="px-4 py-2 text-sm border border-border rounded"
                onClick={() => setShowInfluencerExport(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded"
                onClick={handleExportInfluencers}
              >
                Export Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRevenueDetailTitle && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-6xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{selectedRevenueDetailTitle}</h3>
              <button
                className="px-3 py-2 text-sm border border-border rounded"
                onClick={() => {
                  setSelectedRevenueDetailTitle(null);
                  setSelectedRevenueDetailTransactions([]);
                }}
              >
                Close
              </button>
            </div>

            <div className="rounded-lg border border-border/60 overflow-hidden">
              <div className="overflow-x-auto max-h-[58vh]">
              <table className="w-full table-fixed text-sm">
                <colgroup>
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '20%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '10%' }} />
                </colgroup>
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border bg-muted/20">
                    <th className="text-left py-2 px-3">Transaction ID</th>
                    <th className="text-left py-2 px-3">User ID</th>
                    <th className="text-left py-2 px-3">Username</th>
                    <th className="text-left py-2 px-3">Email</th>
                    <th className="text-left py-2 px-3">Plan</th>
                    <th className="text-right py-2 px-3">Amount</th>
                    <th className="text-left py-2 px-3">Method</th>
                    <th className="text-left py-2 px-3">Created At</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRevenueDetailTransactions.map((tx) => (
                    <tr
                      key={tx.transaction_id || `${tx.user_id}-${tx.created_at}-${tx.amount_cents}`}
                      className="border-b border-border/60"
                    >
                      <td className="py-2 px-3 font-mono truncate" title={tx.transaction_id || ''}>{tx.transaction_id || '-'}</td>
                      <td className="py-2 px-3">{tx.user_id}</td>
                      <td className="py-2 px-3 truncate" title={tx.username || ''}>{tx.username || '-'}</td>
                      <td className="py-2 px-3 truncate" title={tx.email || ''}>{tx.email || '-'}</td>
                      <td className="py-2 px-3 truncate" title={tx.plan_key || ''}>{tx.plan_key || '-'}</td>
                      <td className="py-2 px-3 text-right">{Number(tx.amount_cents || 0)}</td>
                      <td className="py-2 px-3 truncate" title={tx.payment_method_type || ''}>{tx.payment_method_type || '-'}</td>
                      <td className="py-2 px-3 truncate" title={tx.created_at || ''}>
                        {tx.created_at ? new Date(tx.created_at).toLocaleString() : '-'}
                      </td>
                    </tr>
                  ))}
                  {selectedRevenueDetailTransactions.length === 0 && (
                    <tr>
                      <td className="py-4 text-center text-muted-foreground" colSpan={8}>
                        No transactions found for this day.
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

      {editUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Edit User</h3>
            <div className="space-y-3">
              <input
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
                placeholder="Username"
                value={editUser.username || ''}
                onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
              />
              <input
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
                placeholder="Email"
                value={editUser.email || ''}
                onChange={(e) => setEditUser({ ...editUser, email: e.target.value })}
              />
              <input
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
                placeholder="Full name"
                value={editUser.full_name || ''}
                onChange={(e) => setEditUser({ ...editUser, full_name: e.target.value })}
              />
              <input
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
                placeholder="New password (optional)"
                type="password"
                value={editUser.new_password || ''}
                onChange={(e) => setEditUser({ ...editUser, new_password: e.target.value })}
              />
              <div className="flex items-center justify-between">
                <label className="text-sm text-muted-foreground">Active</label>
                <input
                  type="checkbox"
                  checked={!!editUser.is_active}
                  onChange={(e) => setEditUser({ ...editUser, is_active: e.target.checked })}
                />
              </div>
              <div className="border-t border-border/60 pt-3 space-y-2 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">Referral</div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Referred?</span>
                  <span>{editUser.referral_code_used ? 'Yes' : 'No'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Influencer Code</span>
                  <span className="font-mono">{editUser.referral_code_used || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Influencer</span>
                  <span>{editUser.referred_influencer_name || editUser.referred_influencer_id || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Referred At</span>
                  <span>{editUser.referred_at ? new Date(editUser.referred_at).toLocaleString() : '-'}</span>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                className="px-4 py-2 text-sm border border-border rounded"
                onClick={() => setEditUser(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded"
                onClick={handleUpdateUser}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {editInfluencer && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Edit Influencer</h3>
            <div className="space-y-3">
              <input
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
                placeholder="Name"
                value={editInfluencer.name || ''}
                onChange={(e) => setEditInfluencer({ ...editInfluencer, name: e.target.value })}
              />
              <input
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
                placeholder="Referral Code"
                value={editInfluencer.referral_code || ''}
                onChange={(e) => setEditInfluencer({
                  ...editInfluencer,
                  referral_code: e.target.value
                })}
              />
              <select
                className="w-full px-3 py-2 border border-border rounded-md bg-background"
                value={editInfluencer.status || ''}
                onChange={(e) => setEditInfluencer({ ...editInfluencer, status: e.target.value })}
              >
                <option value="active">active</option>
                <option value="inactive">inactive</option>
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                className="px-4 py-2 text-sm border border-border rounded"
                onClick={() => setEditInfluencer(null)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded"
                onClick={handleUpdateInfluencer}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
