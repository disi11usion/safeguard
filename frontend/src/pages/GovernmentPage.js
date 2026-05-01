import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Globe, TrendingUp, TrendingDown, Minus, ArrowLeft,
  Building2, BarChart3, Landmark, Activity, Banknote, Users,
  ChevronRight, AlertCircle, Loader2, Info
} from 'lucide-react';
import { apiService } from '../services/api';

// ── helpers ──────────────────────────────────────────────────────────
const sentimentColor = (label) => {
  if (!label) return 'text-muted-foreground';
  const l = label.toLowerCase();
  if (l === 'positive') return 'text-green-500';
  if (l === 'negative') return 'text-red-500';
  return 'text-yellow-500';
};

const sentimentBg = (label) => {
  if (!label) return 'bg-muted/50';
  const l = label.toLowerCase();
  if (l === 'positive') return 'bg-green-500/10 border-green-500/30';
  if (l === 'negative') return 'bg-red-500/10 border-red-500/30';
  return 'bg-yellow-500/10 border-yellow-500/30';
};

const sentimentIcon = (label) => {
  if (!label) return <Minus className="w-4 h-4" />;
  const l = label.toLowerCase();
  if (l === 'positive') return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (l === 'negative') return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-yellow-500" />;
};

const metricIcon = (name) => {
  const icons = {
    inflation: <Banknote className="w-5 h-5" />,
    interest_rate: <Landmark className="w-5 h-5" />,
    employment: <Users className="w-5 h-5" />,
    gdp: <BarChart3 className="w-5 h-5" />,
    pmi: <Activity className="w-5 h-5" />,
    bond_yield_10y: <Building2 className="w-5 h-5" />,
  };
  return icons[name] || <BarChart3 className="w-5 h-5" />;
};

const metricDisplayName = (name) => {
  const names = {
    inflation: 'Inflation',
    interest_rate: 'Interest Rate',
    employment: 'Employment',
    gdp: 'GDP Growth',
    pmi: 'PMI',
    bond_yield_10y: '10Y Bond Yield',
  };
  return names[name] || name;
};

const regionLabel = (r) => {
  const map = { major: 'Major Economies', eurozone: 'Eurozone', emerging: 'Emerging Markets' };
  return map[r] || r;
};

const countryFlag = (code) => {
  // Convert 2-letter ISO to flag emoji
  if (!code || code.length !== 2) return '🌍';
  if (code === 'EZ') return '🇪🇺';
  const offset = 127397;
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => c.charCodeAt(0) + offset));
};

const scoreToPercent = (score) => {
  // Convert -1…+1 to 0…100
  return Math.round(((score + 1) / 2) * 100);
};

// ── animation variants ───────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

// ═══════════════════════════════════════════════════════════════════════
//  GovPage
// ═══════════════════════════════════════════════════════════════════════
const GovernmentPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [globalSentiment, setGlobalSentiment] = useState(null);
  const [countries, setCountries] = useState([]);
  const [selectedCountry, setSelectedCountry] = useState(null);
  const [countryDetail, setCountryDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState(null);
  const [regionFilter, setRegionFilter] = useState('all');
  const [sortBy, setSortBy] = useState('score'); // score | name | region

  // ── fetch overview ─────────────────────────────────────────────────
  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [globalRes, countriesRes] = await Promise.all([
        apiService.makeRequest('/government/global', { method: 'GET' }, '/api'),
        apiService.makeRequest('/government/countries', { method: 'GET' }, '/api'),
      ]);
      setGlobalSentiment(globalRes);
      setCountries(countriesRes?.countries || []);
    } catch (err) {
      console.error('Error fetching government data:', err);
      setError('Failed to load government macro sentiment data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchOverview(); }, [fetchOverview]);

  // ── auto-open country from URL query param ─────────────────────────
  useEffect(() => {
    if (loading) return;
    const code = searchParams.get('country');
    if (code && !selectedCountry) {
      openCountryDetail(code);
      // Clear the query param so back navigation returns to overview
      setSearchParams({}, { replace: true });
    }
  }, [loading, searchParams]);

  // ── fetch country detail ───────────────────────────────────────────
  const openCountryDetail = async (countryCode) => {
    setSelectedCountry(countryCode);
    setDetailLoading(true);
    try {
      const res = await apiService.makeRequest(
        `/government/country/${countryCode}`, { method: 'GET' }, '/api'
      );
      setCountryDetail(res);
    } catch (err) {
      console.error('Error loading country detail:', err);
      setCountryDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedCountry(null);
    setCountryDetail(null);
  };

  // ── filter & sort ──────────────────────────────────────────────────
  const filteredCountries = countries
    .filter(c => regionFilter === 'all' || c.region === regionFilter)
    .sort((a, b) => {
      if (sortBy === 'score') return (b.overall_score ?? 0) - (a.overall_score ?? 0);
      if (sortBy === 'name') return (a.country_name || '').localeCompare(b.country_name || '');
      return (a.region || '').localeCompare(b.region || '') || (b.overall_score ?? 0) - (a.overall_score ?? 0);
    });

  const regions = [...new Set(countries.map(c => c.region))];

  // ── loading state ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
          <p className="text-muted-foreground text-lg">Loading macro sentiment data…</p>
        </motion.div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[60vh]">
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 text-center">
          <AlertCircle className="w-10 h-10 text-red-500" />
          <p className="text-red-400 text-lg">{error}</p>
          <button onClick={fetchOverview} className="px-4 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 text-white transition">
            Retry
          </button>
        </motion.div>
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  //  Country Detail View
  // ═════════════════════════════════════════════════════════════════════
  if (selectedCountry && countryDetail) {
    const { country, overall, metrics } = countryDetail;
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-5xl mx-auto space-y-6">
        {/* Back button */}
        <button onClick={closeDetail} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition group">
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          <span className="text-sm">Back to all countries</span>
        </button>

        {/* Country header */}
        <div className="bg-card border border-border rounded-xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <span className="text-4xl">{countryFlag(country?.code)}</span>
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-foreground">{country?.name || selectedCountry}</h2>
              <p className="text-sm text-muted-foreground capitalize">{regionLabel(country?.region)}</p>
            </div>
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full border ${sentimentBg(overall?.label)}`}>
              {sentimentIcon(overall?.label)}
              <span className={`text-lg font-bold ${sentimentColor(overall?.label)}`}>
                {overall?.label?.toUpperCase()}
              </span>
              <span className="text-sm text-muted-foreground ml-1">
                ({overall?.score > 0 ? '+' : ''}{overall?.score?.toFixed(4)})
              </span>
            </div>
          </div>

          {/* Breakdown bar */}
          <div className="mt-4 grid grid-cols-3 gap-3 text-center text-sm">
            <div className="bg-green-500/10 rounded-lg p-2">
              <span className="text-green-500 font-bold text-lg">{overall?.positive_count ?? 0}</span>
              <p className="text-muted-foreground text-xs">Positive</p>
            </div>
            <div className="bg-yellow-500/10 rounded-lg p-2">
              <span className="text-yellow-500 font-bold text-lg">{overall?.neutral_count ?? 0}</span>
              <p className="text-muted-foreground text-xs">Neutral</p>
            </div>
            <div className="bg-red-500/10 rounded-lg p-2">
              <span className="text-red-500 font-bold text-lg">{overall?.negative_count ?? 0}</span>
              <p className="text-muted-foreground text-xs">Negative</p>
            </div>
          </div>
        </div>

        {/* Metrics grid */}
        <motion.div variants={containerVariants} initial="hidden" animate="visible" className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(metrics || []).map((m, i) => (
            <motion.div key={m.metric_name || i} variants={itemVariants}
              className={`bg-card border rounded-xl p-5 transition hover:shadow-lg ${
                m.sentiment_label === 'positive' ? 'border-green-500/30 hover:border-green-500/50'
                : m.sentiment_label === 'negative' ? 'border-red-500/30 hover:border-red-500/50'
                : 'border-yellow-500/30 hover:border-yellow-500/50'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    m.sentiment_label === 'positive' ? 'bg-green-500/15 text-green-500'
                    : m.sentiment_label === 'negative' ? 'bg-red-500/15 text-red-500'
                    : 'bg-yellow-500/15 text-yellow-500'
                  }`}>
                    {metricIcon(m.metric_name)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{metricDisplayName(m.metric_name)}</h3>
                    <p className="text-xs text-muted-foreground capitalize">{m.source} · {m.data_date}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border ${sentimentBg(m.sentiment_label)}`}>
                  {sentimentIcon(m.sentiment_label)}
                  <span className={sentimentColor(m.sentiment_label)}>{m.sentiment_label?.toUpperCase()}</span>
                </div>
              </div>

              {/* Value row */}
              <div className="flex items-end gap-4 mb-3">
                <div>
                  <span className="text-3xl font-bold text-foreground">{m.metric_value}</span>
                  <span className="text-sm text-muted-foreground ml-1">{m.unit}</span>
                </div>
                {m.previous_value != null && (
                  <div className="flex items-center gap-1 text-sm mb-1">
                    {m.metric_value > m.previous_value
                      ? <TrendingUp className="w-3 h-3 text-emerald-400" />
                      : m.metric_value < m.previous_value
                      ? <TrendingDown className="w-3 h-3 text-red-400" />
                      : <Minus className="w-3 h-3 text-yellow-400" />}
                    <span className="text-muted-foreground">from {m.previous_value}{m.unit}</span>
                  </div>
                )}
              </div>

              {/* Note */}
              <div className="flex items-start gap-2 bg-muted/30 rounded-lg p-3 text-sm text-muted-foreground">
                <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{m.analysis_note}</span>
              </div>

              {/* Score bar */}
              <div className="mt-3">
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Score</span>
                  <span>{m.sentiment_score > 0 ? '+' : ''}{m.sentiment_score?.toFixed(2)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      m.sentiment_label === 'positive' ? 'bg-green-500'
                      : m.sentiment_label === 'negative' ? 'bg-red-500'
                      : 'bg-yellow-500'
                    }`}
                    style={{ width: `${scoreToPercent(m.sentiment_score || 0)}%` }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {countryDetail?.is_mock && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
            <Info className="w-3.5 h-3.5" />
            <span>Displaying simulated data. Live data pipeline is not yet active.</span>
          </div>
        )}
      </motion.div>
    );
  }

  // loading detail spinner
  if (selectedCountry && detailLoading) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  // ═════════════════════════════════════════════════════════════════════
  //  Overview (main view)
  // ═════════════════════════════════════════════════════════════════════
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-7xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-1">
            <Globe className="w-7 h-7 text-indigo-500" />
            <h1 className="text-3xl font-bold text-foreground">Government Macro Sentiment</h1>
          </div>
          <p className="text-muted-foreground text-sm ml-10">
            Track 6 macroeconomic indicators across 22 countries — classified as Positive, Neutral, or Negative.
          </p>
        </div>
      </div>

      {/* Global Sentiment Card */}
      {globalSentiment && (
        <motion.div variants={itemVariants} initial="hidden" animate="visible"
          className={`bg-card border rounded-xl p-6 ${sentimentBg(globalSentiment.global_label)}`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 flex items-center justify-center">
              <Globe className="w-8 h-8 text-indigo-500" />
            </div>
            <div className="flex-1">
              <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Global Market Sentiment</h2>
              <div className="flex items-center gap-3 mt-1">
                <span className={`text-3xl font-bold ${sentimentColor(globalSentiment.global_label)}`}>
                  {globalSentiment.global_label?.toUpperCase()}
                </span>
                <span className="text-xl text-muted-foreground">
                  {globalSentiment.global_score > 0 ? '+' : ''}{globalSentiment.global_score?.toFixed(4)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Based on {globalSentiment.countries_count} countries · Updated {globalSentiment.analyzed_at?.split('T')[0]}
              </p>
            </div>
            {/* Score gauge */}
            <div className="flex flex-col items-center">
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" fill="none" strokeWidth="8" className="stroke-muted/30" />
                  <circle cx="50" cy="50" r="40" fill="none" strokeWidth="8"
                    className={`${globalSentiment.global_label === 'positive' ? 'stroke-green-500' : globalSentiment.global_label === 'negative' ? 'stroke-red-500' : 'stroke-yellow-500'}`}
                    strokeDasharray={`${scoreToPercent(globalSentiment.global_score || 0) * 2.51} 251`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-lg font-bold ${sentimentColor(globalSentiment.global_label)}`}>
                    {scoreToPercent(globalSentiment.global_score || 0)}
                  </span>
                </div>
              </div>
              <span className="text-xs text-muted-foreground mt-1">Score Index</span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center bg-card border border-border rounded-lg overflow-hidden">
          {['all', ...regions].map(r => (
            <button key={r} onClick={() => setRegionFilter(r)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                regionFilter === r
                  ? 'bg-indigo-500 text-white'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
              }`}
            >
              {r === 'all' ? 'All' : regionLabel(r)}
            </button>
          ))}
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground cursor-pointer"
        >
          <option value="score">Sort by Score</option>
          <option value="name">Sort by Name</option>
          <option value="region">Sort by Region</option>
        </select>
        <span className="text-xs text-muted-foreground ml-auto">
          Showing {filteredCountries.length} of {countries.length} countries
        </span>
      </div>

      {/* Countries Grid */}
      <motion.div variants={containerVariants} initial="hidden" animate="visible"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      >
        {filteredCountries.map((c) => (
          <motion.div
            key={c.country_code}
            variants={itemVariants}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => openCountryDetail(c.country_code)}
            className={`bg-card border rounded-xl p-4 cursor-pointer transition-shadow hover:shadow-lg group ${
              c.overall_label === 'positive' ? 'border-green-500/20 hover:border-green-500/50'
              : c.overall_label === 'negative' ? 'border-red-500/20 hover:border-red-500/50'
              : 'border-yellow-500/20 hover:border-yellow-500/50'
            }`}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{countryFlag(c.country_code)}</span>
                <div>
                  <h3 className="font-semibold text-foreground text-sm leading-tight">{c.country_name}</h3>
                  <p className="text-xs text-muted-foreground capitalize">{regionLabel(c.region)}</p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition" />
            </div>

            {/* Score */}
            <div className="flex items-center gap-2 mb-3">
              {sentimentIcon(c.overall_label)}
              <span className={`font-bold text-lg ${sentimentColor(c.overall_label)}`}>
                {c.overall_label?.toUpperCase()}
              </span>
              <span className="text-sm text-muted-foreground ml-auto">
                {c.overall_score > 0 ? '+' : ''}{c.overall_score?.toFixed(3)}
              </span>
            </div>

            {/* Mini breakdown */}
            <div className="flex gap-1">
              {[...Array(c.positive_count ?? 0)].map((_, i) => (
                <div key={`p${i}`} className="flex-1 h-1.5 rounded-full bg-green-500" />
              ))}
              {[...Array(c.neutral_count ?? 0)].map((_, i) => (
                <div key={`n${i}`} className="flex-1 h-1.5 rounded-full bg-yellow-500" />
              ))}
              {[...Array(c.negative_count ?? 0)].map((_, i) => (
                <div key={`r${i}`} className="flex-1 h-1.5 rounded-full bg-red-500" />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>{c.positive_count}P / {c.neutral_count}N / {c.negative_count}Neg</span>
              <span>{c.country_code}</span>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {globalSentiment?.is_mock && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-lg px-4 py-2">
          <Info className="w-3.5 h-3.5" />
          <span>Displaying simulated data. Live data pipeline is not yet active.</span>
        </div>
      )}
    </motion.div>
  );
};

export default GovernmentPage;
