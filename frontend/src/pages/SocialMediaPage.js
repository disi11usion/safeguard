import React, { useEffect, useState, useMemo } from 'react';
import {
  MessageSquare, Clock, Search, Filter, TrendingUp, TrendingDown, Minus,
  ExternalLink, ChevronDown, ChevronUp, RefreshCw, ArrowUp, MessageCircle,
  Users, BarChart3
} from 'lucide-react';
import { apiService } from '../services/api';

// ═══════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════

const MARKETS = [
  { key: 'crypto',  label: 'Crypto',  subreddits: ['CryptoCurrency', 'bitcoin', 'ethereum'] },
  { key: 'stock',   label: 'Stocks',  subreddits: ['stocks', 'wallstreetbets', 'investing'] },
  { key: 'forex',   label: 'Forex',   subreddits: ['Forex'] },
  { key: 'gold',    label: 'Gold',    subreddits: ['Gold', 'commodities'] },
  { key: 'futures', label: 'Futures', subreddits: ['FuturesTrading'] },
];

const SENTIMENT_STYLES = {
  positive:  { color: 'bg-green-500',  text: 'text-green-400', label: 'Positive',  Icon: TrendingUp },
  negative:  { color: 'bg-red-500',    text: 'text-red-400',   label: 'Negative',  Icon: TrendingDown },
  neutral:   { color: 'bg-orange-400', text: 'text-orange-300', label: 'Neutral',  Icon: Minus },
};

const PAGE_SIZE = 15;

function getRelativeTime(utc) {
  if (!utc) return '';
  try {
    const date = typeof utc === 'number' ? new Date(utc * 1000) : new Date(utc);
    if (isNaN(date.getTime())) return '';
    const diff = (Date.now() - date.getTime()) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch { return ''; }
}

function getSentimentStyle(label) {
  if (!label) return SENTIMENT_STYLES.neutral;
  const l = label.toLowerCase();
  if (l === 'positive' || l.includes('bullish')) return SENTIMENT_STYLES.positive;
  if (l === 'negative' || l.includes('bearish')) return SENTIMENT_STYLES.negative;
  return SENTIMENT_STYLES.neutral;
}

// ═══════════════════════════════════════════
// SENTIMENT SUMMARY CARD
// ═══════════════════════════════════════════

function MarketSentimentCard({ market, isActive, onClick }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSentiment = async () => {
      setLoading(true);
      try {
        const response = await apiService.makeRequest(
          `/social/sentiment/summary?market=${market.key}&window_hours=72&limit=50`,
          { method: 'GET' },
          '/api'
        );
        if (response?.success) setData(response);
      } catch (e) {
        console.error(`Failed to fetch ${market.key} sentiment:`, e);
      } finally {
        setLoading(false);
      }
    };
    fetchSentiment();
  }, [market.key]);

  const score = data?.average_sentiment_score;
  const dominant = data?.dominant_sentiment || 'N/A';
  const posts = data?.total_posts || 0;

  let scoreColor = 'text-orange-300';
  if (score > 0.15) scoreColor = 'text-green-400';
  if (score < -0.15) scoreColor = 'text-red-400';

  return (
    <button
      onClick={onClick}
      className={`bg-card border rounded-xl p-4 text-left transition-all hover:border-primary/50 ${
        isActive ? 'border-primary ring-1 ring-primary/30' : 'border-border'
      }`}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-semibold text-foreground">{market.label}</span>
        {loading ? (
          <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
        ) : (
          <span className={`text-lg font-bold font-mono ${scoreColor}`}>
            {score != null ? (score > 0 ? '+' : '') + score.toFixed(4) : '—'}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{posts} posts</span>
        <span className="text-xs text-muted-foreground">{dominant}</span>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════

export default function SocialMediaPage() {
  const [selectedMarket, setSelectedMarket] = useState('crypto');
  const [selectedSubreddit, setSelectedSubreddit] = useState('all');
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [expandedPosts, setExpandedPosts] = useState({});
  const [refreshing, setRefreshing] = useState(false);

  const currentMarket = MARKETS.find(m => m.key === selectedMarket) || MARKETS[0];

  // Fetch posts from all subreddits of current market
  const fetchPosts = async () => {
    setLoading(true);
    setError(null);
    try {
      const allPosts = [];
      for (const sub of currentMarket.subreddits) {
        try {
          const response = await apiService.makeRequest(
            `/reddit/subreddit/${sub}?sort=hot&limit=25&timeframe=day`,
            { method: 'GET' },
            '/api'
          );
          if (response?.success && Array.isArray(response.posts)) {
            response.posts.forEach(p => {
              allPosts.push({
                id: p.id,
                title: p.title || '',
                content: p.content || '',
                author: p.author || 'unknown',
                subreddit: p.subreddit || sub,
                time: p.created_utc,
                score: p.score || 0,
                upvoteRatio: p.upvote_ratio || 0,
                numComments: p.num_comments || 0,
                url: p.url || p.permalink || '',
                permalink: p.permalink || '',
                sentimentScore: p.sentiment_score || 0,
                sentimentLabel: p.sentiment_label || 'neutral',
              });
            });
          }
        } catch (e) {
          console.error(`Failed to fetch r/${sub}:`, e);
        }
      }
      // Sort by score (popularity) descending
      allPosts.sort((a, b) => b.score - a.score);
      setPosts(allPosts);
    } catch (err) {
      setError(err.message || 'Failed to load social data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
    setPage(1);
    setSelectedSubreddit('all');
  }, [selectedMarket]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchPosts();
    setRefreshing(false);
  };

  // Available subreddits from loaded posts
  const availableSubreddits = useMemo(() => {
    const subs = new Set(posts.map(p => p.subreddit));
    return ['all', ...Array.from(subs).sort()];
  }, [posts]);

  // Filtered posts
  const filteredPosts = useMemo(() => {
    return posts.filter(p => {
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        if (!p.title.toLowerCase().includes(term) &&
            !p.content.toLowerCase().includes(term) &&
            !p.author.toLowerCase().includes(term)) return false;
      }
      if (selectedSubreddit !== 'all' && p.subreddit !== selectedSubreddit) return false;
      if (sentimentFilter !== 'all') {
        const label = p.sentimentLabel?.toLowerCase() || 'neutral';
        if (sentimentFilter === 'positive' && label !== 'positive') return false;
        if (sentimentFilter === 'negative' && label !== 'negative') return false;
        if (sentimentFilter === 'neutral' && label !== 'neutral') return false;
      }
      return true;
    });
  }, [posts, searchTerm, selectedSubreddit, sentimentFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE));
  const displayPosts = filteredPosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [searchTerm, selectedSubreddit, sentimentFilter]);

  const toggleExpand = (id) => {
    setExpandedPosts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* ═══ HEADER ═══ */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <MessageSquare className="h-8 w-8 text-primary" />
              Social Media Intelligence
            </h1>
            <p className="text-muted-foreground mt-2">
              Real-time sentiment from Reddit communities across {MARKETS.length} market categories
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

      {/* ═══ MARKET SENTIMENT CARDS ═══ */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {MARKETS.map(market => (
          <MarketSentimentCard
            key={market.key}
            market={market}
            isActive={selectedMarket === market.key}
            onClick={() => setSelectedMarket(market.key)}
          />
        ))}
      </div>

      {/* ═══ FILTERS ═══ */}
      <div className="bg-card border border-border rounded-xl p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search posts, authors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-background border border-border text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>

          {/* Subreddit filter */}
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <select
              value={selectedSubreddit}
              onChange={(e) => setSelectedSubreddit(e.target.value)}
              className="px-3 py-2 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {availableSubreddits.map(s => (
                <option key={s} value={s}>{s === 'all' ? 'All Subreddits' : `r/${s}`}</option>
              ))}
            </select>
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
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          <span>
            Showing {filteredPosts.length} of {posts.length} posts from r/{currentMarket.subreddits.join(', r/')}
          </span>
          {(searchTerm || selectedSubreddit !== 'all' || sentimentFilter !== 'all') && (
            <button
              onClick={() => { setSearchTerm(''); setSelectedSubreddit('all'); setSentimentFilter('all'); }}
              className="text-primary hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* ═══ POSTS LIST ═══ */}
      {loading ? (
        <div className="bg-card border border-border rounded-xl p-12 flex items-center justify-center">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-3 text-muted-foreground">Loading posts from r/{currentMarket.subreddits.join(', r/')}...</span>
        </div>
      ) : error ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-red-400">{error}</div>
      ) : filteredPosts.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">
          No posts found matching your filters.
        </div>
      ) : (
        <div className="space-y-3">
          {displayPosts.map((post) => {
            const style = getSentimentStyle(post.sentimentLabel);
            const SentimentIcon = style.Icon;
            const isExpanded = expandedPosts[post.id];
            const hasContent = post.content && post.content.length > 0;
            const needsExpand = hasContent && post.content.length > 200;

            return (
              <div
                key={post.id}
                className="bg-card border border-border rounded-xl p-5 hover:border-primary/30 transition-colors"
              >
                {/* Top row: subreddit + author + time + sentiment */}
                <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-primary/10 text-primary">
                      r/{post.subreddit}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      u/{post.author}
                    </span>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {getRelativeTime(post.time)}
                    </div>
                  </div>
                  <span className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold text-white ${style.color}`}>
                    <SentimentIcon className="h-3 w-3" />
                    {style.label}
                  </span>
                </div>

                {/* Title */}
                <div className="mb-2">
                  {post.permalink ? (
                    <a
                      href={post.permalink.startsWith('http') ? post.permalink : `https://reddit.com${post.permalink}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-foreground hover:text-primary transition-colors inline-flex items-start gap-1.5"
                    >
                      {post.title}
                      <ExternalLink className="h-3 w-3 flex-shrink-0 mt-1 opacity-50" />
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-foreground">{post.title}</span>
                  )}
                </div>

                {/* Content */}
                {hasContent && (
                  <div className="text-xs text-muted-foreground leading-relaxed mb-3">
                    {isExpanded || !needsExpand
                      ? post.content
                      : `${post.content.slice(0, 200).trimEnd()}...`}
                    {needsExpand && (
                      <button
                        onClick={() => toggleExpand(post.id)}
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

                {/* Bottom stats row */}
                <div className="flex items-center gap-5 pt-2 border-t border-border/50">
                  {/* Upvotes */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <ArrowUp className="h-3.5 w-3.5" />
                    <span className="font-medium text-foreground">{post.score}</span>
                    <span>upvotes</span>
                    {post.upvoteRatio > 0 && (
                      <span className="text-muted-foreground">({Math.round(post.upvoteRatio * 100)}%)</span>
                    )}
                  </div>

                  {/* Comments */}
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span className="font-medium text-foreground">{post.numComments}</span>
                    <span>comments</span>
                  </div>

                  {/* Sentiment score */}
                  <div className="flex items-center gap-2 ml-auto">
                    <span className="text-xs text-muted-foreground">Score:</span>
                    <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          post.sentimentScore > 0.15 ? 'bg-green-500' :
                          post.sentimentScore < -0.15 ? 'bg-red-500' :
                          'bg-orange-400'
                        }`}
                        style={{ width: `${Math.min(100, Math.abs(post.sentimentScore) * 100)}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono ${style.text}`}>
                      {post.sentimentScore > 0 ? '+' : ''}{post.sentimentScore.toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ═══ PAGINATION ═══ */}
      {filteredPosts.length > PAGE_SIZE && (
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
