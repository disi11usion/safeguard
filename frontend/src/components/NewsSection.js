import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { Newspaper, ExternalLink, Clock, Loader2, Badge } from 'lucide-react';

export default function NewsSection({ coin, preferredCoins = [], isStock = false, isForex = false }) {
  const preferredKey = preferredCoins.join(',');
  const marketType = isStock ? 'stock' : isForex ? 'forex' : 'crypto';
  const cacheKey = `news-section:${marketType}:${coin?.symbol || ''}:${preferredKey}`;
  const [news, setNews] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedNews, setExpandedNews] = useState({});

  const PAGE_SIZE = 5;
  const [relatedPage, setRelatedPage] = useState(1);
  const [generalPage, setGeneralPage] = useState(1);
  const [relatedInput, setRelatedInput] = useState('1');
  const [generalInput, setGeneralInput] = useState('1');
  const [mode, setMode] = useState('related'); // 'related' | 'general'
  const userMode = "demo";
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    const readCachedNews = () => {
      try {
        const raw = window.localStorage.getItem(cacheKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed?.items) ? parsed.items : null;
      } catch {
        return null;
      }
    };

    const persistNews = (items) => {
      try {
        window.localStorage.setItem(
          cacheKey,
          JSON.stringify({
            cachedAt: new Date().toISOString(),
            items,
          })
        );
      } catch {
        // Ignore storage failures and continue with live data only.
      }
    };

    const mapSentimentItems = (items = []) =>
      items.map(item => ({
        headline: item.title || '',
        source: item.source || '',
        time: item.time_published || '',
        url: item.url || '',
        sentiment: item.overall_sentiment_label || 'Neutral',
        sentimentScore: item.overall_sentiment_score || 0,
        authors: item.authors || [],
        summary: item.summary || '',
        bannerImage: item.banner_image || '',
        category: item.category || '',
        tickerSentiments: item.ticker_sentiment || item.ticker_sentiments || [],
      }));

    const mapCurrentNewsItems = (rows = []) =>
      rows.map(row => ({
        headline: row[0] || '',
        source: '',
        time: row[2] || '',
        url: row[3] || '',
        sentiment: '',
        sentimentScore: 0,
        authors: [],
        summary: row[1] || '',
        bannerImage: '',
        category: '',
        tickerSentiments: row[6]
          ? [{
              ticker: row[6],
              relevance_score: 1,
              sentiment_score: 0,
              sentiment_label: 'Neutral',
            }]
          : [],
      }));

    // Unified news fetching for all market types (crypto, stock, forex)
    const fetchNews = async () => {
      try {
        let newsData = [];
        console.log('[NewsSection] Fetching news:', { isStock, isForex, coin, preferredCoins });

        // Prepare tickers based on market type
        let tickers = '';
        if (coin?.symbol) {
          if (isForex) {
            // Extract base currency from pair like "EUR/USD" -> "EUR"
            tickers = coin.symbol.split('/')[0];
          } else {
            tickers = coin.symbol;
          }
        } else if (preferredCoins.length > 0) {
          if (isForex) {
            // Extract base currencies from all pairs
            tickers = preferredCoins.map(sym => sym.split('/')[0]).join(',');
          } else {
            tickers = preferredCoins.join(',');
          }
        }

        const fetchSentimentNews = async (endpoint) => {
          const response = await apiService.makeRequest(
            endpoint,
            { method: 'GET' },
            '/api'
          );
          return response?.success && Array.isArray(response.items)
            ? mapSentimentItems(response.items)
            : [];
        };

        const cachedNews = readCachedNews();

        // 1) Preferred ticker-specific feed
        if (tickers) {
          newsData = await fetchSentimentNews(
            `/news/sentiment?tickers=${tickers}&limit=100&sort=LATEST&market=${marketType}`
          );
          console.log(`[NewsSection] ${marketType} ticker news fetched:`, newsData.length, 'articles');
        }

        // 2) Fallback to general sentiment feed if ticker feed is empty
        if (newsData.length === 0) {
          newsData = await fetchSentimentNews('/news/sentiment?limit=100&sort=LATEST');
          console.log('[NewsSection] General sentiment fallback fetched:', newsData.length, 'articles');
        }

        // 3) Fallback to DB-backed current news if sentiment feed is empty
        if (newsData.length === 0) {
          const currentNews = await apiService.makeRequest('/news/current', { method: 'GET' });
          if (currentNews?.success && Array.isArray(currentNews.message)) {
            newsData = mapCurrentNewsItems(currentNews.message);
          }
          console.log('[NewsSection] Current news fallback fetched:', newsData.length, 'articles');
        }

        // Remove duplicates based on source
        const seenSources = new Set();
        const uniqueNews = newsData.filter(item => {
          const key = `${item.url || ''}::${item.source || ''}::${item.headline}`;
          if (!seenSources.has(key)) {
            seenSources.add(key);
            return true;
          }
          return false;
        });

        if (isMounted) {
          const finalNews = uniqueNews.length > 0 ? uniqueNews : (cachedNews || []);
          if (uniqueNews.length > 0) {
            persistNews(uniqueNews);
          }
          setNews(finalNews);
          setError(null);
          setLoading(false);
          console.log('[NewsSection] Final news set:', finalNews.length, 'articles');
        }
      } catch (err) {
        console.error('Error fetching news:', err);
        if (isMounted) {
          const cachedNews = readCachedNews();
          if (cachedNews && cachedNews.length > 0) {
            setNews(cachedNews);
            setError(null);
          } else {
            setError('Failed to load news.');
          }
          setLoading(false);
        }
      }
    };

    fetchNews();

    return () => { isMounted = false; };
  }, [cacheKey, coin, preferredCoins, isStock, isForex, marketType]);

  useEffect(() => {
    let isMounted = true;

    const fetchSummary = async () => {
      try {
        const response = await apiService.makeRequest(
          `/news/sentiment/summary?market=${marketType}&window_hours=24&limit=1000`,
          { method: 'GET' },
          '/api'
        );

        if (!isMounted) return;

        if (response?.success && response.average_sentiment_score !== undefined) {
          setSummary({
            averageScore: Number(response.average_sentiment_score),
            totalItems: response.total_articles || response.count || 0,
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
  }, [marketType]);

  useEffect(() => {
    const sortByTimeDesc = (arr) => arr.slice().sort((a, b) => new Date(b.time) - new Date(a.time));
    let rn = [];
    let gn = [];
    if (coin?.symbol) {
      rn = sortByTimeDesc(news.filter(item => isRelatedToCoin(item, coin)));
      gn = sortByTimeDesc(news.filter(item => !isRelatedToCoin(item, coin)));
    } else if (preferredCoins.length > 0) {
      rn = sortByTimeDesc(news.filter(isRelatedToAnyPreferred));
      gn = sortByTimeDesc(news.filter(item => !isRelatedToAnyPreferred(item)));
    } else {
      rn = [];
      gn = sortByTimeDesc(news);
    }
    const maxRelated = Math.max(1, Math.ceil(rn.length / PAGE_SIZE));
    const maxGeneral = Math.max(1, Math.ceil(gn.length / PAGE_SIZE));
    setRelatedPage(prev => Math.min(Math.max(prev, 1), maxRelated));
    setGeneralPage(prev => Math.min(Math.max(prev, 1), maxGeneral));
    setRelatedInput(prev => String(Math.min(Math.max(parseInt(prev || '1', 10) || 1, 1), maxRelated)));
    setGeneralInput(prev => String(Math.min(Math.max(parseInt(prev || '1', 10) || 1, 1), maxGeneral)));
  }, [news, coin, preferredCoins]);

  useEffect(() => {
    setRelatedPage(1);
    setGeneralPage(1);
    setRelatedInput('1');
    setGeneralInput('1');
  }, [coin, preferredCoins]);

  useEffect(() => {
    if (mode === 'related') {
      setRelatedPage(1);
      setRelatedInput('1');
    } else {
      setGeneralPage(1);
      setGeneralInput('1');
    }
  }, [mode]);

  const getRelativeTime = (isoString) => {
    if (!isoString) return '';

    // Handle Alpha Vantage format: "20251030T183851"
    let dateStr = isoString;
    if (/^\d{8}T\d{6}$/.test(isoString)) {
      // Convert "20251030T183851" to "2025-10-30T18:38:51"
      dateStr = `${isoString.slice(0, 4)}-${isoString.slice(4, 6)}-${isoString.slice(6, 8)}T${isoString.slice(9, 11)}:${isoString.slice(11, 13)}:${isoString.slice(13, 15)}`;
    }

    const now = new Date();
    const postDate = new Date(dateStr);
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

  const getFirstWords = (text, wordCount = 6) => {
    if (!text) return '';
    const words = text.split(' ');
    if (words.length <= wordCount) return text;
    return words.slice(0, wordCount).join(' ') + '...';
  };

  const truncateText = (text, maxChars = 180) => {
    if (!text) return '';
    const normalizedText = text.replace(/\s+/g, ' ').trim();
    if (normalizedText.length <= maxChars) return normalizedText;
    return `${normalizedText.slice(0, maxChars).trimEnd()}...`;
  };

  const isRelatedToCoin = (item, coinObj) => {
    // News is a shared global feed — all news is relevant to all assets.
    // This is by design: financial news often covers cross-market topics
    // (e.g., "Fed rate decision impacts stocks, crypto, and gold"),
    // and filtering by ticker would exclude valuable cross-market context.
    return true;
  };

  const isRelatedToAnyPreferred = (item) => {
    return preferredCoins.some(symbol => isRelatedToCoin(item, { symbol }));
  };

  let relatedNews = [];
  let generalNews = [];

  if (coin?.symbol) {
    relatedNews = news.filter(item => isRelatedToCoin(item, coin));
    generalNews = news.filter(item => !isRelatedToCoin(item, coin));
    console.log('[NewsSection] Filtered by coin:', { 
      coinSymbol: coin.symbol, 
      totalNews: news.length,
      relatedCount: relatedNews.length, 
      generalCount: generalNews.length 
    });
  } else if (preferredCoins.length > 0) {
    relatedNews = news.filter(isRelatedToAnyPreferred);
    generalNews = news.filter(item => !isRelatedToAnyPreferred(item));
    console.log('[NewsSection] Filtered by preferred coins:', { 
      preferredCoins,
      totalNews: news.length,
      relatedCount: relatedNews.length, 
      generalCount: generalNews.length 
    });
  } else {
    generalNews = news;
  }

  const sortByTimeDesc = arr => arr.slice().sort((a, b) => new Date(b.time) - new Date(a.time));
  relatedNews = sortByTimeDesc(relatedNews);
  generalNews = sortByTimeDesc(generalNews);
  // Demo users only section: 
  if (userMode === "demo") {
    if (relatedNews.length > 6) {
      relatedNews = relatedNews.slice(0, 6);

    }
    if (generalNews.length > 6) {
      generalNews = generalNews.slice(0, 6);
    }
  }
  const hasMoreRelated = userMode === "demo" && relatedNews.length >= 6;
  const hasMoreGeneral = userMode === "demo" && generalNews.length >= 6;

  useEffect(() => {
    if (mode === 'related' && relatedNews.length === 0 && generalNews.length > 0) {
      setMode('general');
    }
  }, [mode, relatedNews.length, generalNews.length]);

  //
  const relatedTotalPages = Math.max(1, Math.ceil(relatedNews.length / PAGE_SIZE));
  const generalTotalPages = Math.max(1, Math.ceil(generalNews.length / PAGE_SIZE));

  const displayRelatedNews = relatedNews.slice((relatedPage - 1) * PAGE_SIZE, relatedPage * PAGE_SIZE);
  const displayGeneralNews = generalNews.slice((generalPage - 1) * PAGE_SIZE, generalPage * PAGE_SIZE);

  const toggleExpand = (idx) => {
    setExpandedNews(prev => ({ ...prev, [idx]: !prev[idx] }));
  };

  const renderNewsItem = (n, i, isRelevant = false, keyPrefix = '', locked = false) => {
    const isLongSource = n.source && n.source.split(' ').length > 6;
    const key = `${keyPrefix}${i}`;
    const headline = (n.headline || '').replace(/\s+/g, ' ').trim();
    const summaryText = (n.summary || '').replace(/\s+/g, ' ').trim();
    const previewHeadline = truncateText(headline, 100);
    const previewSummary = truncateText(summaryText, 180);
    const hasExpandableContent = isLongSource || headline.length > 100 || summaryText.length > 180;

    // Map all sentiment labels to positive/negative/neutral and set color
    const mapSentiment = (sentiment) => {
      if (!sentiment) return { label: '', color: '' };
      const label = sentiment.toLowerCase();
      if (label.includes('bullish') || label === 'positive') {
        return { label: 'Positive', color: 'bg-green-500' };
      }
      if (label.includes('bearish') || label === 'negative') {
        return { label: 'Negative', color: 'bg-red-500' };
      }
      // 其它都归为 neutral
      return { label: 'Neutral', color: 'bg-orange-400' };
    };

    // Format authors array
    const formatAuthors = (authors) => {
      if (!authors || !Array.isArray(authors) || authors.length === 0) return '';
      // Filter out URLs and join with comma
      const authorNames = authors.filter(a => a && !a.startsWith('http'));
      return authorNames.length > 0 ? authorNames.join(', ') : '';
    };

    return (

        <div
          key={key}
          className={[
            "pb-3 mb-3 border-b border-border last:border-b-0 last:mb-0 last:pb-0",
            locked ? "relative overflow-hidden rounded-lg" : ""
          ].join(" ")}
        >
          {/* Blurred/dimmed content */}
          <div className={locked ? "pointer-events-none select-none blur-sm opacity-40" : ""}>
            <div className="flex items-start gap-2 mb-2 flex-wrap">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-sm font-semibold text-primary truncate" title={n.source}>
                  Source: {expandedNews[key] || !isLongSource ? n.source : getFirstWords(n.source, 6)}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Clock className="h-3 w-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {getRelativeTime(n.time)}
                </span>
                {isRelevant && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md whitespace-nowrap bg-green-500/20 text-green-600 dark:text-green-400">
                    Relevant
                  </span>
                )}
                {n.sentiment && (() => {
                  const mapped = mapSentiment(n.sentiment);
                  return (
                    <span className={`px-2 py-0.5 rounded-md text-xs font-semibold text-white ${mapped.color}`}>
                      {mapped.label}
                    </span>
                  );
                })()}
              </div>
            </div>

            {n.authors && formatAuthors(n.authors) && (
              <div className="text-xs text-muted-foreground mb-1">
                By {formatAuthors(n.authors)}
              </div>
            )}

            <div className="inline-flex gap-x-2 text-sm font-medium text-foreground leading-relaxed items-start">
              <Newspaper className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
              {/* Disable link if locked */}
              {!locked && n.url ? (
                <a href={n.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline inline-flex items-start gap-1 break-words">
                  {expandedNews[key] ? headline : previewHeadline}
                </a>
              ) : (
                <span className="text-primary break-words">
                  {expandedNews[key] ? headline : previewHeadline}
                </span>
              )}
            </div>

            {summaryText && (
              <div className="text-xs text-muted-foreground leading-relaxed mt-1 break-words">
                {expandedNews[key] ? summaryText : previewSummary}
              </div>
            )}

            {hasExpandableContent && (
              <button
                type="button"
                onClick={() => toggleExpand(key)}
                className="text-xs text-primary/70 hover:text-primary mt-1 focus:outline-none"
              >
                {expandedNews[key] ? 'Show less ▲' : 'Show more ▼'}
              </button>
            )}
          </div>

          {/* Overlay message */}
          {locked && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="mx-3 rounded-lg border border-border bg-background/90 px-4 py-3 text-center shadow-sm">
                <div className="text-sm font-semibold text-foreground">
                  🔒 Additional news is available to Premium Only
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

  const Pagination = ({ current, total, onChange, inputValue, setInput, totalItems }) => {

    const goPrev = () => onChange(Math.max(1, current - 1));
    const goNext = () => onChange(Math.min(total, current + 1));
    const commitInput = (raw) => {
      const n = parseInt(raw, 10);
      if (!Number.isFinite(n)) return;
      const clamped = Math.min(Math.max(n, 1), total);
      setInput(String(clamped));
      onChange(clamped);
    };
    return (
      <div className="flex items-center flex-wrap gap-2 text-xs mt-4">
        <button
          type="button"
          aria-label="Previous page"
          className="px-2 py-1 rounded border border-border disabled:opacity-50"
          onClick={goPrev}
          disabled={current <= 1}
        >Prev</button>
        <div className="flex items-center gap-1">
          <span>Page</span>
          <input
            type="number"
            min={1}
            max={total}
            value={inputValue}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitInput(e.currentTarget.value); }}
            onBlur={(e) => commitInput(e.currentTarget.value)}
            className="w-16 px-2 py-1 rounded border border-border bg-background"
          />
          <span>/ {total}</span>
        </div>
        <span className="text-muted-foreground ml-1">
          Showing {Math.min((current - 1) * PAGE_SIZE + 1, totalItems)} – {Math.min(current * PAGE_SIZE, totalItems)}
        </span>
        <button
          type="button"
          aria-label="Next page"
          className="px-2 py-1 rounded border border-border disabled:opacity-50"
          onClick={goNext}
          disabled={current >= total}
        >Next</button>
      </div>
    );
  };

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

  const ModeToggle = () => {
    const isRelated = mode === 'related';
    return (
      <div className="flex items-center">
        <div className="relative inline-flex h-9 rounded-full border border-border bg-background/60 p-1 select-none">
          {/* moving indicator */}
          <div
            className="absolute top-1 bottom-1 w-1/2 rounded-full bg-accent/40 transition-transform"
            style={{ transform: `translateX(${isRelated ? '0%' : '100%'})` }}
          />
          <button
            type="button"
            onClick={() => setMode('related')}
            className={`relative z-10 px-4 py-1 text-xs font-medium rounded-full ${isRelated ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            Related
          </button>
          <button
            type="button"
            onClick={() => setMode('general')}
            className={`relative z-10 px-4 py-1 text-xs font-medium rounded-full ${!isRelated ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            General
          </button>
        </div>
      </div>
    );
  };
  const DemoLockedNotice = () => (
    <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground text-center">
      <span className="font-semibold">Demo version</span> — additional news is locked.
      <br />
      Upgrade to access extended coverage and deeper sentiment analysis.
    </div>
  );
  return (
    <>
      <div>
        <div className="flex items-center justify-between pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-foreground" />
            <h3 className="text-base font-bold text-foreground">News</h3>
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
                {summary.totalItems} articles
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="mt-4 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading news...</span>
          </div>
        ) : error ? (
          <div className="mt-4 text-red-500">{error}</div>
        ) : news.length === 0 ? (
          <div className="mt-4 text-muted-foreground">No news found.</div>
        ) : (
          <div className="mt-4 space-y-4">
            {mode === 'related' ? (
              <div>
                {relatedNews.length === 0 ? (
                  <div className="text-muted-foreground">No news found.</div>
                ) : (
                  <>
                    {displayRelatedNews.map((n, i) => {

                      const locked = userMode === "demo" && hasMoreRelated &&  i + (relatedPage - 1) * PAGE_SIZE === 5;
                      return renderNewsItem(n, i + (relatedPage - 1) * PAGE_SIZE, true, 'related-', locked);
                    }
                      
                      )}
                    <Pagination
                      current={relatedPage}
                      total={relatedTotalPages}
                      onChange={setRelatedPage}
                      inputValue={relatedInput}
                      setInput={setRelatedInput}
                      totalItems={relatedNews.length}
                    />
                  </>
                )}
              </div>
            ) : (
              <div>
                {generalNews.length === 0 ? (
                  <div className="text-muted-foreground">No news found.</div>
                ) : (
                  <>
                    {displayGeneralNews.map((n, i) => renderNewsItem(n, i + (generalPage - 1) * PAGE_SIZE, false, 'general-'))}
                    <Pagination
                      current={generalPage}
                      total={generalTotalPages}
                      onChange={setGeneralPage}
                      inputValue={generalInput}
                      setInput={setGeneralInput}
                      totalItems={generalNews.length}
                    />
                    {hasMoreGeneral && <DemoLockedNotice />}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
