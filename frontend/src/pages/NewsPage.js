import React, { useEffect, useState, useMemo } from 'react';
import { Newspaper, Clock, Search, Filter, TrendingUp, TrendingDown, Minus, ExternalLink, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { apiService } from '../services/api';

const SENTIMENT_CONFIG = {
  Bullish:           { color: 'bg-green-500',  textColor: 'text-green-400', icon: TrendingUp },
  'Somewhat Bullish':{ color: 'bg-green-400',  textColor: 'text-green-300', icon: TrendingUp },
  Neutral:           { color: 'bg-orange-400', textColor: 'text-orange-300', icon: Minus },
  'Somewhat Bearish':{ color: 'bg-red-400',    textColor: 'text-red-300',   icon: TrendingDown },
  Bearish:           { color: 'bg-red-500',    textColor: 'text-red-400',   icon: TrendingDown },
  Positive:          { color: 'bg-green-500',  textColor: 'text-green-400', icon: TrendingUp },
  Negative:          { color: 'bg-red-500',    textColor: 'text-red-400',   icon: TrendingDown },
};

const PAGE_SIZE = 20;

function getRelativeTime(timeStr) {
  if (!timeStr) return '';
  try {
    let date;
    if (/^\d{8}T\d{4,6}$/.test(timeStr)) {
      const y = timeStr.slice(0, 4), mo = timeStr.slice(4, 6), d = timeStr.slice(6, 8);
      const h = timeStr.slice(9, 11), mi = timeStr.slice(11, 13);
      date = new Date(`${y}-${mo}-${d}T${h}:${mi}:00Z`);
    } else {
      date = new Date(timeStr);
    }
    if (isNaN(date.getTime())) return timeStr;
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch { return timeStr; }
}

function getSentimentConfig(label) {
  if (!label) return SENTIMENT_CONFIG.Neutral;
  for (const [key, cfg] of Object.entries(SENTIMENT_CONFIG)) {
    if (label.toLowerCase().includes(key.toLowerCase())) return cfg;
  }
  return SENTIMENT_CONFIG.Neutral;
}

export default function NewsPage() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [expandedItems, setExpandedItems] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const fetchNews = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await apiService.makeRequest(
        '/news/sentiment?limit=1000&sort=LATEST',
        { method: 'GET' },
        '/api'
      );

      if (response?.success && Array.isArray(response.items)) {
        const mapped = response.items.map((item, idx) => ({
          id: idx,
          headline: item.title || 'Untitled',
          source: item.source || item.source_domain || 'Unknown',
          time: item.time_published || '',
          url: item.url || '',
          summary: item.summary || '',
          sentiment: item.overall_sentiment_label || 'Neutral',
          sentimentScore: item.overall_sentiment_score || 0,
          authors: item.authors || [],
          bannerImage: item.banner_image,
          category: item.category || '',
          tickers: (item.ticker_sentiments || []).map(t => t.ticker).filter(Boolean),
        }));
        setNews(mapped);
      } else {
        setNews([]);
      }
    } catch (err) {
      setError(err.message || 'Failed to load news');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchNews(); }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchNews();
    setRefreshing(false);
  };

  // Unique sources for filter dropdown
  const sources = useMemo(() => {
    const s = new Set(news.map(n => n.source));
    return ['all', ...Array.from(s).sort()];
  }, [news]);

  // Filtered news
  const filteredNews = useMemo(() => {
    return news.filter(item => {
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch =
          item.headline.toLowerCase().includes(term) ||
          item.source.toLowerCase().includes(term) ||
          item.summary.toLowerCase().includes(term) ||
          item.tickers.some(t => t.toLowerCase().includes(term));
        if (!matchesSearch) return false;
      }
      // Sentiment filter
      if (sentimentFilter !== 'all') {
        const cfg = getSentimentConfig(item.sentiment);
        const sentimentGroup =
          item.sentiment?.toLowerCase().includes('bullish') || item.sentiment === 'Positive' ? 'bullish' :
          item.sentiment?.toLowerCase().includes('bearish') || item.sentiment === 'Negative' ? 'bearish' :
          'neutral';
        if (sentimentFilter !== sentimentGroup) return false;
      }
      // Source filter
      if (sourceFilter !== 'all' && item.source !== sourceFilter) return false;
      return true;
    });
  }, [news, searchTerm, sentimentFilter, sourceFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredNews.length / PAGE_SIZE));
  const displayNews = filteredNews.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [searchTerm, sentimentFilter, sourceFilter]);

  const toggleExpand = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Newspaper className="h-8 w-8 text-primary" />
              News Feed
            </h1>
            <p className="text-muted-foreground mt-2">
              Real-time financial news from {sources.length - 1} sources — {news.length} articles total
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-card border border-border hover:bg-secondary/50 transition-colors text-sm text-foreground disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search headlines, sources, tickers..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Sentiment filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={sentimentFilter}
              onChange={(e) => setSentimentFilter(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="all">All Sentiments</option>
              <option value="bullish">Bullish</option>
              <option value="neutral">Neutral</option>
              <option value="bearish">Bearish</option>
            </select>
          </div>

          {/* Source filter */}
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {sources.map(s => (
              <option key={s} value={s}>{s === 'all' ? 'All Sources' : s}</option>
            ))}
          </select>
        </div>

        {/* Active filter summary */}
        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          <span>Showing {filteredNews.length} of {news.length} articles</span>
          {(searchTerm || sentimentFilter !== 'all' || sourceFilter !== 'all') && (
            <button
              onClick={() => { setSearchTerm(''); setSentimentFilter('all'); setSourceFilter('all'); }}
              className="text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* News List */}
      {loading ? (
        <div className="bg-card border border-border rounded-xl p-12 flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading news...</span>
        </div>
      ) : error ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-red-400">
          {error}
        </div>
      ) : filteredNews.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          No news found matching your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {displayNews.map((item) => {
            const cfg = getSentimentConfig(item.sentiment);
            const SentimentIcon = cfg.icon;
            const isExpanded = expandedItems[item.id];
            const needsExpand = item.summary && item.summary.length > 200;

            return (
              <div
                key={item.id}
                className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-colors"
              >
                {/* Top row: source + time + sentiment */}
                <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-secondary text-foreground">
                      {item.source}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {getRelativeTime(item.time)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.tickers.length > 0 && (
                      <div className="flex items-center gap-1">
                        {item.tickers.slice(0, 4).map(t => (
                          <span key={t} className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">
                            {t}
                          </span>
                        ))}
                        {item.tickers.length > 4 && (
                          <span className="text-xs text-muted-foreground">+{item.tickers.length - 4}</span>
                        )}
                      </div>
                    )}
                    <span className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-white ${cfg.color}`}>
                      <SentimentIcon className="h-3 w-3" />
                      {item.sentiment}
                    </span>
                  </div>
                </div>

                {/* Headline */}
                <div className="mb-2">
                  {item.url ? (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-foreground hover:text-primary transition-colors inline-flex items-start gap-1.5"
                    >
                      {item.headline}
                      <ExternalLink className="h-3 w-3 flex-shrink-0 mt-1 opacity-50" />
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-foreground">{item.headline}</span>
                  )}
                </div>

                {/* Authors */}
                {item.authors && item.authors.length > 0 && (
                  <div className="text-xs text-muted-foreground mb-2">
                    By {item.authors.filter(a => a && !a.startsWith('http')).join(', ')}
                  </div>
                )}

                {/* Summary */}
                {item.summary && (
                  <div className="text-xs text-muted-foreground leading-relaxed">
                    {isExpanded || !needsExpand
                      ? item.summary
                      : `${item.summary.slice(0, 200).trimEnd()}...`}
                    {needsExpand && (
                      <button
                        onClick={() => toggleExpand(item.id)}
                        className="ml-1 text-primary/70 hover:text-primary inline-flex items-center gap-0.5"
                      >
                        {isExpanded ? (
                          <><ChevronUp className="h-3 w-3" /> Less</>
                        ) : (
                          <><ChevronDown className="h-3 w-3" /> More</>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Score bar */}
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Score:</span>
                  <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden max-w-[200px]">
                    <div
                      className={`h-full rounded-full transition-all ${
                        item.sentimentScore >= 0.15 ? 'bg-green-500' :
                        item.sentimentScore <= -0.15 ? 'bg-red-500' :
                        'bg-orange-400'
                      }`}
                      style={{ width: `${Math.min(100, Math.abs(item.sentimentScore) * 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-mono ${cfg.textColor}`}>
                    {item.sentimentScore > 0 ? '+' : ''}{item.sentimentScore.toFixed(4)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {filteredNews.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-4 mt-8 mb-4">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 rounded-lg bg-card border border-border text-sm text-foreground hover:bg-secondary/50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 rounded-lg bg-card border border-border text-sm text-foreground hover:bg-secondary/50 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
