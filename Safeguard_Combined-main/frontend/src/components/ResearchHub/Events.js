import React, { useEffect, useState } from 'react';
import { ExternalLink, Clock, ChevronDown, ChevronUp, Calendar } from 'lucide-react';
import { apiService } from '../../services/api';

const Events = ({ coinIds = ['BTC', 'ETH', 'SOL'], preferredCoins = [] }) => {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedNews, setExpandedNews] = useState({});

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    
    apiService.getCurrentNews()
      .then(res => {
        let newsArr = [];
        if (Array.isArray(res)) {
          newsArr = res;
        } else if (res.success && Array.isArray(res.message)) {
          newsArr = res.message;
        }
        
        const parsedNews = newsArr.map(arr => ({
          headline: arr[0] || '',
          source: arr[1] || '',
          time: arr[2] || '',
          url: arr[3] || '',
        }));
        
        // Remove duplicates by source
        const seenSources = new Set();
        const uniqueNews = parsedNews.filter(item => {
          if (item.source && !seenSources.has(item.source)) {
            seenSources.add(item.source);
            return true;
          }
          return false;
        });
        
        if (isMounted) {
          setNews(uniqueNews);
          setLoading(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setError('Failed to load news.');
          setLoading(false);
        }
      });
      
    return () => { isMounted = false; };
  }, []);

  // Format relative time
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
    return `${Math.floor(diffDay / 30)}mo ago`;
  };

  // Get first N words
  const getFirstWords = (text, wordCount = 15) => {
    if (!text) return '';
    const words = text.split(' ');
    if (words.length <= wordCount) return text;
    return words.slice(0, wordCount).join(' ') + '...';
  };

  // Check if news is related to coin
  const isRelatedToCoin = (item, coinObj) => {
    if (!coinObj) return false;
    const termsToMatch = [];
    if (coinObj.symbol) termsToMatch.push(coinObj.symbol.toUpperCase());
    if (coinObj.name) termsToMatch.push(coinObj.name.toLowerCase());
    if (termsToMatch.length === 0) return false;
    
    const regex = new RegExp(`(^|[^a-zA-Z0-9])(${termsToMatch.join('|')})([^a-zA-Z0-9]|$)`, 'i');
    return regex.test(item.headline) || regex.test(item.source);
  };

  const isRelatedToAnyPreferred = (item) => {
    return preferredCoins.some(symbol => isRelatedToCoin(item, { symbol }));
  };

  // Sort and filter news
  const sortByTimeDesc = (arr) => arr.slice().sort((a, b) => new Date(b.time) - new Date(a.time));
  const sortedNews = sortByTimeDesc(news);

  // Toggle expand state
  const toggleExpand = (key) => {
    setExpandedNews(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Render news item component
  const NewsItem = ({ item, index }) => {
    const key = `news-${index}`;
    const isExpanded = expandedNews[key];
    const isLongSource = item.source.split(' ').length > 15;
    const displaySource = isExpanded || !isLongSource ? item.source : getFirstWords(item.source, 15);

    return (
      <div className="group mb-4 pb-4 border-b border-border/50 last:border-0 hover:bg-accent/5 -mx-3 px-3 py-3 rounded-lg transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-sm font-semibold text-foreground break-words min-w-0 max-w-full">
                {displaySource}
              </span>
              {isLongSource && (
                <button
                  onClick={() => toggleExpand(key)}
                  className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1 flex-shrink-0 whitespace-nowrap"
                >
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      <span>Less</span>
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      <span>More</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground flex-shrink-0 whitespace-nowrap">
            <Clock className="h-3 w-3 flex-shrink-0" />
            <span className="whitespace-nowrap">{getRelativeTime(item.time)}</span>
          </div>
        </div>

        {/* Headline */}
        <div className="text-sm min-w-0">
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground hover:text-primary transition-colors inline-flex items-start gap-1 group/link break-words min-w-0 max-w-full"
            >
              <span className="line-clamp-2 break-words">{item.headline}</span>
              <ExternalLink className="h-3 w-3 mt-0.5 opacity-0 group-hover/link:opacity-100 transition-opacity flex-shrink-0" />
            </a>
          ) : (
            <span className="text-foreground line-clamp-2 break-words">{item.headline}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      ) : error ? (
        <div className="text-destructive text-sm py-4">{error}</div>
      ) : news.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-3">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-muted">
            <Calendar className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm">No news events found.</p>
        </div>
      ) : (
        <div>
          {/* Header */}
          <div className="flex items-center gap-3 mb-6 pb-3 border-b border-border">
            <Calendar className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-bold text-foreground">Latest Market Events</h3>
            <span className="ml-auto text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
              {news.length} {news.length === 1 ? 'event' : 'events'}
            </span>
          </div>

          {/* News List */}
          <div>
            {sortedNews.map((item, i) => (
              <NewsItem key={i} item={item} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Events;
