import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { MessageSquare, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';

export default function SocialSection({ coin, preferredCoins = [], selectedAsset = null }) {
  const [socialPosts, setSocialPosts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedPosts, setExpandedPosts] = useState({});

  const PAGE_SIZE = 5;

  // Match NewsSection behaviour
  const [mode, setMode] = useState('related'); // 'related' | 'general'
  const userMode = "demo";

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const fetchRedditPosts = async () => {
      try {
        let subreddit = 'CryptoCurrency';

        if (selectedAsset?.ticker) {
          const ticker = selectedAsset.ticker.toLowerCase();
          const category = selectedAsset.category?.toLowerCase();

          if (category === 'crypto') {
            const cryptoSubredditMap = {
              btc: 'Bitcoin',
              eth: 'ethereum',
              sol: 'solana',
              ada: 'cardano',
              doge: 'dogecoin',
              xrp: 'Ripple',
              matic: 'maticnetwork',
              dot: 'dot',
              link: 'Chainlink',
              avax: 'Avax',
              usdt: 'Tether',
              bnb: 'binance',
              usdc: 'Coinbase',
            };
            subreddit = cryptoSubredditMap[ticker] || 'CryptoCurrency';
          } else if (category === 'stock') {
            const stockSubredditMap = {
              aapl: 'AAPL',
              googl: 'google',
              msft: 'microsoft',
              tsla: 'teslainvestorsclub',
              amzn: 'amazon',
              nvda: 'NVDA_Stock',
              meta: 'facebook',
            };
            subreddit = stockSubredditMap[ticker] || 'stocks';
          } else if (category === 'forex') {
            subreddit = 'Forex';
          } else if (category === 'futures') {
            subreddit = 'FuturesTrading';
          }
        } else if (coin?.symbol) {
          const symbol = coin.symbol.toLowerCase();
          const subredditMap = {
            btc: 'Bitcoin',
            eth: 'ethereum',
            sol: 'solana',
            ada: 'cardano',
            doge: 'dogecoin',
            xrp: 'Ripple',
            matic: 'maticnetwork',
            dot: 'dot',
            link: 'Chainlink',
            avax: 'Avax',
          };
          subreddit = subredditMap[symbol] || 'CryptoCurrency';
        }

        const response = await apiService.getSocialRedditData(subreddit, 'hot', 25, 'day');

        if (response.success && Array.isArray(response.posts)) {
          const posts = response.posts.map(post => ({
            id: post.id || '',
            title: post.title || '',
            content: post.content || '',
            time: post.created_utc ? new Date(post.created_utc * 1000).toISOString() : '',
            source: `r/${post.subreddit}` || 'Reddit',
            url: post.url || '',
            permalink: post.permalink || '',
            author: post.author || '',
            score: post.score || 0,
            num_comments: post.num_comments || 0,
            upvote_ratio: post.upvote_ratio || 0,
            sentiment: post.sentiment_label || '',
            sentimentScore: post.sentiment_score ?? 0,
            comments: [],
          }));

          const seenTitles = new Set();
          const uniquePosts = posts.filter(p => {
            if (p.title && !seenTitles.has(p.title)) {
              seenTitles.add(p.title);
              return true;
            }
            return false;
          });

          if (isMounted) {
            setSocialPosts(uniquePosts);
            setLoading(false);
          }
        } else {
          throw new Error('Invalid response format');
        }
      } catch (err) {
        console.error('Error fetching Reddit posts:', err);
        if (isMounted) {
          setError('Failed to load Reddit posts.');
          setLoading(false);
        }
      }
    };

    fetchRedditPosts();
    return () => { isMounted = false; };
  }, [coin, preferredCoins, selectedAsset]);

  useEffect(() => {
    let isMounted = true;

    const fetchSummary = async () => {
      try {
        const response = await apiService.makeRequest(
          '/social/sentiment/summary?window_hours=24&limit=100',
          { method: 'GET' },
          '/api'
        );

        if (!isMounted) return;

        if (response?.success && response.average_sentiment_score !== undefined) {
          setSummary({
            averageScore: Number(response.average_sentiment_score),
            totalItems: response.total_posts || response.count || 0,
          });
        } else {
          setSummary(null);
        }
      } catch {
        if (isMounted) {
          setSummary(null);
        }
      }
    };

    fetchSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  // Reset expand state on asset change (nice UX)
  useEffect(() => {
    setExpandedPosts({});
  }, [coin, preferredCoins, selectedAsset]);

  // Helper: check if a post is related to a coin/asset symbol (strict whole word match)
  const isRelatedToCoin = (post, coinObj) => {
    if (selectedAsset) {
      const termsToMatch = [];
      if (selectedAsset.ticker) termsToMatch.push(selectedAsset.ticker.toUpperCase());
      if (selectedAsset.name) termsToMatch.push(selectedAsset.name.toLowerCase());
      if (termsToMatch.length === 0) return false;

      const regex = new RegExp(`(^|[^a-zA-Z0-9])(${termsToMatch.join('|')})([^a-zA-Z0-9]|$)`, 'i');
      return regex.test(post.title) || regex.test(post.content);
    }

    if (!coinObj) return false;

    const termsToMatch = [];
    if (coinObj.symbol) termsToMatch.push(coinObj.symbol.toUpperCase());
    if (coinObj.name) termsToMatch.push(coinObj.name.toLowerCase());
    if (termsToMatch.length === 0) return false;

    const regex = new RegExp(`(^|[^a-zA-Z0-9])(${termsToMatch.join('|')})([^a-zA-Z0-9]|$)`, 'i');
    return regex.test(post.title) || regex.test(post.content);
  };

  const isRelatedToAnyPreferred = (post) => {
    return preferredCoins.some(symbol => isRelatedToCoin(post, { symbol }));
  };

  // Filtering logic
  let relatedPosts = [];
  let generalPosts = [];

  if (coin?.symbol) {
    relatedPosts = socialPosts.filter(post => isRelatedToCoin(post, coin));
    generalPosts = socialPosts.filter(post => !isRelatedToCoin(post, coin));
  } else if (preferredCoins.length > 0) {
    relatedPosts = socialPosts.filter(isRelatedToAnyPreferred);
    generalPosts = socialPosts.filter(post => !isRelatedToAnyPreferred(post));
  } else {
    generalPosts = socialPosts;
  }

  const sortByTimeDesc = arr => arr.slice().sort((a, b) => new Date(b.time) - new Date(a.time));
  relatedPosts = sortByTimeDesc(relatedPosts);
  generalPosts = sortByTimeDesc(generalPosts);

  // === DEMO LOCKING like NewsSection (top 5 shown + 1 locked card if more exists) ===
  const hasMoreRelated = userMode === "demo" && relatedPosts.length > PAGE_SIZE;
  const hasMoreGeneral = userMode === "demo" && generalPosts.length > PAGE_SIZE;

  const displayRelatedPosts = userMode === "demo"
    ? relatedPosts.slice(0, PAGE_SIZE + (hasMoreRelated ? 1 : 0))
    : relatedPosts;

  const displayGeneralPosts = userMode === "demo"
    ? generalPosts.slice(0, PAGE_SIZE + (hasMoreGeneral ? 1 : 0))
    : generalPosts;

  const toggleExpand = (key) => {
    setExpandedPosts(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const getRelativeTime = (isoString) => {
    if (!isoString) return '';
    const now = new Date();
    const postDate = new Date(isoString);
    const diffMs = now - postDate;
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    const diffMonth = Math.floor(diffDay / 30);
    if (diffMonth < 12) return `${diffMonth}mo ago`;
    const diffYear = Math.floor(diffMonth / 12);
    return `${diffYear}y ago`;
  };

  const getFirstWords = (text, wordCount = 20) => {
    if (!text) return '';
    const words = text.split(' ');
    if (words.length <= wordCount) return text;
    return words.slice(0, wordCount).join(' ') + '...';
  };

  const getCoinLabel = () => {
    if (selectedAsset) {
      const category = selectedAsset.category ? ` - ${selectedAsset.category}` : '';
      return ` (${selectedAsset.ticker}${selectedAsset.name ? ' - ' + selectedAsset.name : ''}${category})`;
    }
    if (coin && typeof coin === 'object' && coin.symbol) {
      return ` (${coin.symbol}${coin.name ? ' - ' + coin.name : ''})`;
    }
    if (coin && typeof coin === 'string') {
      return ` (${coin})`;
    }
    if (preferredCoins.length > 0) {
      return ` (${preferredCoins.slice(0, 3).join(', ')}${preferredCoins.length > 3 ? '...' : ''})`;
    }
    return '';
  };

  const DemoLockedNotice = () => (
    <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground text-center">
      <span className="font-semibold">Demo version</span> — additional discussions are locked.
      <br />
      Upgrade to unlock the full feed.
    </div>
  );

  const getScoreMeta = (score) => {
    if (score > 0.15) {
      return {
        label: 'Positive',
        className: 'bg-green-500/15 text-green-600 dark:text-green-400',
      };
    }
    if (score < -0.15) {
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

  const scoreMeta = summary ? getScoreMeta(summary.averageScore) : null;

  const getPostSentimentMeta = (label, score) => {
    const normalized = String(label || '').toLowerCase();
    if (normalized === 'positive' || score > 0.15) {
      return {
        label: 'Positive',
        className: 'bg-green-500 text-white',
      };
    }
    if (normalized === 'negative' || score < -0.15) {
      return {
        label: 'Negative',
        className: 'bg-red-500 text-white',
      };
    }
    return {
      label: 'Neutral',
      className: 'bg-orange-400 text-white',
    };
  };

  const ModeToggle = () => {
    const isRelated = mode === 'related';
    return (
      <div className="flex items-center">
        <div className="relative inline-flex h-9 rounded-full border border-border bg-background/60 p-1 select-none">
          <div
            className="absolute top-1 bottom-1 w-1/2 rounded-full bg-accent/40 transition-transform"
            style={{ transform: `translateX(${isRelated ? '0%' : '100%'})` }}
          />
          <button
            type="button"
            onClick={() => setMode('related')}
            className={`relative z-10 px-4 py-1 text-xs font-medium rounded-full ${
              isRelated ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Related
          </button>
          <button
            type="button"
            onClick={() => setMode('general')}
            className={`relative z-10 px-4 py-1 text-xs font-medium rounded-full ${
              !isRelated ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            General
          </button>
        </div>
      </div>
    );
  };

  const PostItem = ({ post, index, prefix, locked = false }) => {
    const postKey = `${prefix}-${index}`;
    const isExpanded = expandedPosts[postKey];
    const isRelevant = prefix === 'related' && isRelatedToCoin(post, coin);
    const wordCount = post.content?.split(' ').length || 0;
    const shouldTruncate = wordCount > 20;
    const postSentiment = getPostSentimentMeta(post.sentiment, post.sentimentScore);

    return (
      <div
        className={[
          "mb-4 pb-4 border-b border-border last:border-0 last:pb-0 last:mb-0",
          locked ? "relative overflow-hidden rounded-lg" : ""
        ].join(" ")}
      >
        <div className={locked ? "pointer-events-none select-none blur-sm opacity-40" : ""}>
          {/* Post Header */}
          <div className="flex flex-col items-start gap-2 mb-2">
            <h4
              className={`font-semibold text-sm break-words flex-1 min-w-0 ${
                prefix === 'related' ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              {post.title}
            </h4>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {getRelativeTime(post.time)}
              </span>
              {post.source && post.source !== 'None' && post.source.trim() && (
                <span className="text-xs text-muted-foreground px-2 py-0.5 bg-muted rounded-md whitespace-nowrap">
                  {post.source}
                </span>
              )}
              {prefix === 'related' && (
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded-md whitespace-nowrap ${
                    isRelevant
                      ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {isRelevant ? 'Relevant' : 'General'}
                </span>
              )}
              <span className={`px-2 py-0.5 rounded-md text-xs font-semibold whitespace-nowrap ${postSentiment.className}`}>
                {postSentiment.label}
              </span>
            </div>
          </div>

          {/* Reddit Stats */}
          {(post.score !== undefined || post.num_comments !== undefined || post.upvote_ratio !== undefined) && (
            <div className="flex items-center gap-3 mb-2">
              {post.score !== undefined && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span className="font-semibold">↑</span>
                  <span>{post.score} upvotes</span>
                </span>
              )}
              {post.num_comments !== undefined && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <MessageSquare className="h-3 w-3" />
                  <span>{post.num_comments} comments</span>
                </span>
              )}
              {post.upvote_ratio !== undefined && (
                <span className="text-xs text-muted-foreground">
                  {Math.round(post.upvote_ratio * 100)}% upvoted
                </span>
              )}
            </div>
          )}

          {/* Post Content */}
          {post.content && post.content !== 'None' && post.content.trim() && (
            <div className="text-sm text-foreground leading-relaxed mb-2">
              {isExpanded || !shouldTruncate ? post.content : getFirstWords(post.content, 20)}

              {!locked && shouldTruncate && (
                <button
                  onClick={() => toggleExpand(postKey)}
                  className="inline-flex items-center gap-1 ml-2 text-primary hover:text-primary/80 font-medium transition-colors"
                >
                  {isExpanded ? (
                    <>
                      <span>Show less</span>
                      <ChevronUp className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      <span>Read more</span>
                      <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Post Footer */}
          <div className="flex items-center gap-4">
            {post.permalink && (
              <a
                href={`https://reddit.com${post.permalink}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                <span>View on Reddit</span>
              </a>
            )}
            {post.url && post.url !== `https://reddit.com${post.permalink}` && !post.url.includes('reddit.com') && (
              <a
                href={post.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                <span>External Link</span>
              </a>
            )}
          </div>
        </div>

        {locked && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="mx-3 rounded-lg border border-border bg-background/90 px-4 py-3 text-center shadow-sm">
              <div className="text-sm font-semibold text-foreground">
                🔒 Additional discussions are available to Premium Only
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                Upgrade to unlock the full feed.
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Pick which list to render based on mode (like NewsSection)
  const activePosts = mode === 'related' ? displayRelatedPosts : displayGeneralPosts;
  const activeHasMore = mode === 'related' ? hasMoreRelated : hasMoreGeneral;

  return (
    <div>
      <div className="flex items-center justify-between pb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-foreground" />
          <h3 className="text-base font-bold text-foreground">Reddit Discussion</h3>
        </div>
        <ModeToggle />
      </div>

      {summary && scoreMeta && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Total Score
            </div>
            <div className="mt-1 text-xl font-bold text-foreground">
              {summary.averageScore.toFixed(4)}
            </div>
          </div>
          <div className="text-right">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${scoreMeta.className}`}>
              {scoreMeta.label}
            </span>
            <div className="mt-1 text-xs text-muted-foreground">
              {summary.totalItems} posts
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="mt-4 text-center py-8 text-muted-foreground">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <p className="mt-2">Loading Reddit posts...</p>
        </div>
      ) : error ? (
        <div className="mt-4 text-center py-8 text-destructive">{error}</div>
      ) : (
        <>
          {/* Header label like your existing section */}
          {mode === 'related' ? (
            <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-lg font-bold text-sm">
              <span>Related Coin Posts</span>
              <span className="text-xs font-normal opacity-80">{getCoinLabel()}</span>
            </div>
          ) : (
            <div className="mt-4 inline-flex items-center px-4 py-2 bg-muted text-foreground rounded-lg font-bold text-sm">
              General Posts
            </div>
          )}

          <div className="mt-4 space-y-0">
            {activePosts.length === 0 ? (
              <div className="text-muted-foreground">No Reddit posts found.</div>
            ) : (
              activePosts.map((post, i) => {
                // lock the 6th visible card when demo and there are more than 5
                const locked = userMode === "demo" && activeHasMore && i === PAGE_SIZE;
                return <PostItem key={i} post={post} index={i} prefix={mode} locked={locked} />;
              })
            )}
          </div>

          {/* Notice matches NewsSection placement */}
          {userMode === "demo" && activeHasMore && <DemoLockedNotice />}
        </>
      )}
    </div>
  );
}
