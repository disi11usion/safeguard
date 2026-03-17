import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, TrendingUp, TrendingDown, Minus, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { apiService } from '../services/api';

// ── helpers ──────────────────────────────────────────────────────────
const sentimentColor = (label) => {
  if (!label) return 'text-muted-foreground';
  const l = label.toLowerCase();
  if (l === 'positive') return 'text-green-500';
  if (l === 'negative') return 'text-red-500';
  return 'text-yellow-500';
};

const sentimentIcon = (label) => {
  if (!label) return <Minus className="w-3.5 h-3.5" />;
  const l = label.toLowerCase();
  if (l === 'positive') return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
  if (l === 'negative') return <TrendingDown className="w-3.5 h-3.5 text-red-500" />;
  return <Minus className="w-3.5 h-3.5 text-yellow-500" />;
};

const countryFlag = (code) => {
  if (!code || code.length !== 2) return '🌍';
  if (code === 'EZ') return '🇪🇺';
  const offset = 127397;
  return String.fromCodePoint(...[...code.toUpperCase()].map(c => c.charCodeAt(0) + offset));
};

const regionLabel = (r) => {
  const map = { major: 'Major Economies', eurozone: 'Eurozone', emerging: 'Emerging Markets' };
  return map[r] || r;
};

const scoreMeta = (label) => {
  const normalized = String(label || '').toLowerCase();
  if (normalized === 'positive') {
    return {
      label: 'Positive',
      className: 'bg-green-500/15 text-green-600 dark:text-green-400',
    };
  }
  if (normalized === 'negative') {
    return {
      label: 'Negative',
      className: 'bg-red-500/15 text-red-600 dark:text-red-400',
    };
  }
  return {
    label: 'Neutral',
    className: 'bg-orange-400/15 text-orange-600 dark:text-orange-300',
  };
};

// Sort order based on GDP / economic scale (descending)
const COUNTRY_SCALE_ORDER = [
  'US', // United States
  'CN', // China
  'JP', // Japan
  'DE', // Germany
  'IN', // India
  'GB', // United Kingdom
  'FR', // France
  'IT', // Italy
  'BR', // Brazil
  'CA', // Canada
  'KR', // South Korea
  'AU', // Australia
  'MX', // Mexico
  'ES', // Spain
  'ID', // Indonesia
  'NL', // Netherlands
  'SA', // Saudi Arabia
  'TR', // Turkey
  'CH', // Switzerland
  'PL', // Poland
  'SE', // Sweden
  'BE', // Belgium
  'TH', // Thailand
  'AT', // Austria
  'IE', // Ireland
  'SG', // Singapore
  'AE', // UAE
  'EZ', // Eurozone
];

const getCountryScaleRank = (code) => {
  const idx = COUNTRY_SCALE_ORDER.indexOf(code);
  return idx === -1 ? 999 : idx;
};

const GovernmentSummaryWidget = () => {
  const navigate = useNavigate();
  const [countries, setCountries] = useState([]);
  const [globalSentiment, setGlobalSentiment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [globalRes, countriesRes] = await Promise.all([
        apiService.makeRequest('/government/global', { method: 'GET' }, '/api'),
        apiService.makeRequest('/government/countries', { method: 'GET' }, '/api'),
      ]);

      const list = countriesRes?.countries || [];
      // Sort by economic scale
      list.sort((a, b) => getCountryScaleRank(a.country_code) - getCountryScaleRank(b.country_code));
      setGlobalSentiment(globalRes || null);
      setCountries(list);
    } catch (err) {
      console.error('Error fetching government summary:', err);
      setError('Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCountryClick = (countryCode) => {
    navigate(`/government?country=${countryCode}`);
  };

  const handleViewAll = () => {
    navigate('/government');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
        <p className="text-xs text-muted-foreground">Loading government data…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <AlertCircle className="w-6 h-6 text-red-500" />
        <p className="text-xs text-red-400">{error}</p>
        <button onClick={fetchData} className="text-xs text-indigo-400 hover:underline">Retry</button>
      </div>
    );
  }

  const totalScoreMeta = scoreMeta(globalSentiment?.global_label);

  return (
    <div className="flex flex-col h-full">
      {globalSentiment && (
        <div className="mb-3 px-1">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Total Score
              </div>
              <div className="mt-1 text-xl font-bold text-foreground">
                {globalSentiment.global_score > 0 ? '+' : ''}
                {Number(globalSentiment.global_score || 0).toFixed(4)}
              </div>
            </div>
            <div className="text-right">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${totalScoreMeta.className}`}>
                {totalScoreMeta.label}
              </span>
              <div className="mt-1 text-xs text-muted-foreground">
                {globalSentiment.countries_count || countries.length || 0} countries
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Country list - scrollable */}
      <div className="flex-1 overflow-y-auto space-y-2 px-1">
        {countries.map((c) => (
          <div
            key={c.country_code}
            onClick={() => handleCountryClick(c.country_code)}
            className={`bg-card border rounded-lg p-3 cursor-pointer transition-all hover:shadow-md group ${
              c.overall_label === 'positive' ? 'border-green-500/20 hover:border-green-500/50'
              : c.overall_label === 'negative' ? 'border-red-500/20 hover:border-red-500/50'
              : 'border-yellow-500/20 hover:border-yellow-500/50'
            }`}
          >
            {/* Header row */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-lg flex-shrink-0">{countryFlag(c.country_code)}</span>
                <div className="min-w-0">
                  <h4 className="font-semibold text-foreground text-xs leading-tight truncate">{c.country_name}</h4>
                  <p className="text-[10px] text-muted-foreground capitalize">{regionLabel(c.region)}</p>
                </div>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition flex-shrink-0" />
            </div>

            {/* Score row */}
            <div className="flex items-center gap-1.5 mb-2">
              {sentimentIcon(c.overall_label)}
              <span className={`font-bold text-sm ${sentimentColor(c.overall_label)}`}>
                {c.overall_label?.toUpperCase()}
              </span>
              <span className="text-xs text-muted-foreground ml-auto">
                {c.overall_score > 0 ? '+' : ''}{c.overall_score?.toFixed(3)}
              </span>
            </div>

            {/* Mini breakdown bar */}
            <div className="flex gap-0.5">
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
          </div>
        ))}
      </div>

      {/* Footer - View All link */}
      <div
        onClick={handleViewAll}
        className="flex items-center justify-center gap-1.5 py-2 mt-2 cursor-pointer text-indigo-400 hover:text-indigo-300 transition-colors border-t border-border"
      >
        <Globe className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">View Full Government Analysis</span>
        <ChevronRight className="w-3 h-3" />
      </div>
    </div>
  );
};

export default GovernmentSummaryWidget;
