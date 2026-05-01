import React, { useEffect, useState, useMemo } from 'react';
import { apiService } from '../services/api';
import { TrendingUp, TrendingDown, Loader2 } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export default function SentimentAnalysisNoCoin({ assetGroups = [] }) {
  const [newsData, setNewsData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [dataMode, setDataMode] = useState('ticker');

  // Initialize selected category when assetGroups change
  useEffect(() => {
    if (assetGroups.length > 0 && !selectedCategory) {
      setSelectedCategory(assetGroups[0].category);
    }
  }, [assetGroups, selectedCategory]);

  // Get current group based on selected category
  const currentGroup = useMemo(() => {
    return assetGroups.find(g => g.category === selectedCategory) || null;
  }, [assetGroups, selectedCategory]);

  const isForex = currentGroup?.isForex || false;
  const isCrypto = currentGroup?.isCrypto || false;

  const targetSymbols = useMemo(() => {
    if (!currentGroup || !currentGroup.tickers) return [];
    return currentGroup.tickers;
  }, [currentGroup]);

  const cacheKey = useMemo(() => {
    return `sentiment-trend:v2:${selectedCategory || 'unknown'}:${targetSymbols.join(',')}`;
  }, [selectedCategory, targetSymbols]);

  useEffect(() => {
    if (targetSymbols.length === 0) {
      setLoading(false);
      setNewsData([]);
      setError(null);
      return;
    }

    const fetchSentimentData = async () => {
      setLoading(true);
      setError(null);

      const readCachedPayload = () => {
        try {
          const raw = window.localStorage.getItem(cacheKey);
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (!Array.isArray(parsed?.items)) return null;
          return parsed;
        } catch {
          return null;
        }
      };

      const persistPayload = (items, mode, provider = null) => {
        if (provider === 'Local DB Fallback') {
          return;
        }
        try {
          window.localStorage.setItem(cacheKey, JSON.stringify({
            cachedAt: new Date().toISOString(),
            mode,
            items,
            provider,
          }));
        } catch {
          // Ignore storage failures and continue with live data only.
        }
      };

      try {
        const marketParam = isCrypto ? '&market=crypto' : isForex ? '&market=forex' : '';
        const response = await apiService.makeRequest(
          `/news/sentiment?tickers=${targetSymbols.join(',')}&limit=1000&sort=LATEST${marketParam}`,
          { method: 'GET' },
          '/api'
        );

        console.debug('[SentimentAnalysisNoCoin] api response', {
          success: response?.success,
          count: response?.count,
          items: Array.isArray(response?.items) ? response.items.length : 0,
          tickers: targetSymbols,
          market: marketParam,
        });

        if (response?.success && Array.isArray(response.items) && response.items.length > 0) {
          setNewsData(response.items);
          setDataMode('ticker');
          persistPayload(response.items, 'ticker', response.provider);
          return;
        }

        const generalResponse = await apiService.makeRequest(
          '/news/sentiment?limit=1000&sort=LATEST',
          { method: 'GET' },
          '/api'
        );

        if (generalResponse?.success && Array.isArray(generalResponse.items) && generalResponse.items.length > 0) {
          setNewsData(generalResponse.items);
          setDataMode('market');
          persistPayload(generalResponse.items, 'market', generalResponse.provider);
          return;
        }

        const cachedPayload = readCachedPayload();
        if (cachedPayload) {
          setNewsData(cachedPayload.items);
          setDataMode(cachedPayload.mode || 'market');
          return;
        }

        setNewsData([]);
      } catch (err) {
        console.error('Error fetching sentiment data:', err);
        const cachedPayload = (() => {
          try {
            const raw = window.localStorage.getItem(cacheKey);
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        })();

        if (Array.isArray(cachedPayload?.items) && cachedPayload.items.length > 0) {
          setNewsData(cachedPayload.items);
          setDataMode(cachedPayload.mode || 'market');
        } else {
          setError('Failed to load sentiment data');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSentimentData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, targetSymbols.join(','), isForex, isCrypto]);

  const activeSymbols = useMemo(() => {
    return dataMode === 'market' ? ['Market'] : targetSymbols;
  }, [dataMode, targetSymbols]);

  // Calculate daily sentiment scores for each symbol
  const chartData = useMemo(() => {
    if (newsData.length === 0) return [];

    if (dataMode === 'market') {
      const aggregated = {};

      newsData.forEach(item => {
        const dateStr = item.time_published;
        if (!dateStr || !/^\d{8}T\d{6}$/.test(dateStr)) return;

        const date = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
        const score = parseFloat(item.overall_sentiment_score || 0);
        if (Number.isNaN(score)) return;

        if (!aggregated[date]) {
          aggregated[date] = { date, scores: [] };
        }
        aggregated[date].scores.push(score);
      });

      return Object.values(aggregated)
        .map(({ date, scores }) => ({
          date,
          Market: scores.reduce((sum, s) => sum + s, 0) / scores.length,
          Market_count: scores.length,
        }))
        .sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    const dailyData = {};

    newsData.forEach(item => {
      const tickerSentiments = item.ticker_sentiments || item.ticker_sentiment;

      if (!item.time_published || !tickerSentiments) return;

      const dateStr = item.time_published;
      if (!/^\d{8}T\d{6}$/.test(dateStr)) return;

      const date = `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;

      tickerSentiments.forEach(ts => {
        const prefix = isCrypto ? 'CRYPTO:' : isForex ? 'FOREX:' : '';
        const tickerSymbol = prefix && ts.ticker?.startsWith(prefix)
          ? ts.ticker.replace(prefix, '')
          : ts.ticker;

        if (!targetSymbols.includes(tickerSymbol)) return;

        const key = `${date}_${tickerSymbol}`;

        if (!dailyData[key]) {
          dailyData[key] = {
            date,
            symbol: tickerSymbol,
            scores: [],
            count: 0,
          };
        }

        const score = parseFloat(ts.ticker_sentiment_score || ts.sentiment_score || 0);
        dailyData[key].scores.push(score);
        dailyData[key].count++;
      });
    });

    const aggregated = {};

    Object.values(dailyData).forEach(({ date, symbol: sym, scores }) => {
      if (!aggregated[date]) {
        aggregated[date] = { date };
      }

      const avgScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;
      aggregated[date][sym] = avgScore;
      aggregated[date][`${sym}_count`] = scores.length;
    });

    return Object.values(aggregated).sort((a, b) => new Date(a.date) - new Date(b.date));
  }, [dataMode, newsData, targetSymbols, isCrypto, isForex]);

  const tickerScores = useMemo(() => {
    const bySymbol = {};
    activeSymbols.forEach(sym => {
      bySymbol[sym] = [];
    });

    if (newsData.length === 0) return bySymbol;

    if (dataMode === 'market') {
      newsData.forEach(item => {
        const score = parseFloat(item.overall_sentiment_score || 0);
        const timeKey = item.time_published;
        if (Number.isNaN(score) || !timeKey) return;
        bySymbol.Market.push({ score, timeKey });
      });

      bySymbol.Market.sort((a, b) => {
        if (a.timeKey === b.timeKey) return 0;
        return a.timeKey < b.timeKey ? 1 : -1;
      });

      return bySymbol;
    }

    newsData.forEach(item => {
      const tickerSentiments = item.ticker_sentiments || item.ticker_sentiment;
      if (!item.time_published || !tickerSentiments) return;

      const timeKey = item.time_published;

      tickerSentiments.forEach(ts => {
        const prefix = isCrypto ? 'CRYPTO:' : isForex ? 'FOREX:' : '';
        const tickerSymbol = prefix && ts.ticker?.startsWith(prefix)
          ? ts.ticker.replace(prefix, '')
          : ts.ticker;

        if (!targetSymbols.includes(tickerSymbol)) return;

        const relevance = parseFloat(ts.relevance_score || 0);
        if (Number.isNaN(relevance) || relevance <= 0) return;

        const score = parseFloat(ts.ticker_sentiment_score || ts.sentiment_score || 0);
        if (Number.isNaN(score)) return;

        bySymbol[tickerSymbol].push({ score, timeKey });
      });
    });

    if (activeSymbols.length > 0) {
      const counts = activeSymbols.reduce((acc, sym) => {
        acc[sym] = bySymbol[sym]?.length || 0;
        return acc;
      }, {});
      console.debug('[SentimentAnalysisNoCoin] ticker score counts', counts);
    }

    Object.keys(bySymbol).forEach(sym => {
      bySymbol[sym].sort((a, b) => {
        if (a.timeKey === b.timeKey) return 0;
        return a.timeKey < b.timeKey ? 1 : -1;
      });
    });

    return bySymbol;
  }, [activeSymbols, dataMode, newsData, targetSymbols, isCrypto, isForex]);

  const WINDOW_CANDIDATES = [10, 20, 50];
  const RECENT_BUCKET = 5;

  const movingAverage = (scores, window) => {
    if (scores.length < window) return [];
    const result = [];
    for (let i = 0; i <= scores.length - window; i++) {
      const slice = scores.slice(i, i + window);
      const avg = slice.reduce((sum, s) => sum + s, 0) / window;
      result.push(avg);
    }
    return result;
  };

  const evaluateWindow = (scores, window) => {
    const ma = movingAverage(scores, window);
    let stability = 0;
    if (ma.length > 1) {
      stability = ma.slice(1).reduce((sum, value, index) => {
        return sum + Math.abs(value - ma[index]);
      }, 0) / (ma.length - 1);
    }

    let responsiveness = 0;
    if (scores.length >= RECENT_BUCKET * 2) {
      const recent = scores.slice(0, RECENT_BUCKET);
      const prior = scores.slice(RECENT_BUCKET, RECENT_BUCKET * 2);
      const recentAvg = recent.reduce((sum, s) => sum + s, 0) / RECENT_BUCKET;
      const priorAvg = prior.reduce((sum, s) => sum + s, 0) / RECENT_BUCKET;
      responsiveness = Math.abs(recentAvg - priorAvg);
    }

    return {
      stability,
      responsiveness,
      score: responsiveness - stability,
    };
  };

  const pickOptimalWindow = (scores) => {
    if (scores.length === 0) return { window: 0, average: 0, count: 0 };

    const validCandidates = WINDOW_CANDIDATES.filter(n => n <= scores.length);
    const candidates = validCandidates.length > 0 ? validCandidates : [scores.length];

    let bestWindow = candidates[0];
    let bestScore = -Infinity;

    candidates.forEach(window => {
      const metrics = evaluateWindow(scores, window);
      if (metrics.score > bestScore) {
        bestScore = metrics.score;
        bestWindow = window;
      }
    });

    const count = Math.min(bestWindow, scores.length);
    const average = count > 0
      ? scores.slice(0, count).reduce((sum, s) => sum + s, 0) / count
      : 0;

    return {
      window: bestWindow,
      average,
      count,
    };
  };
  const statistics = useMemo(() => {
    const stats = {};

    activeSymbols.forEach(sym => {
      const scores = chartData
        .map(d => d[sym])
        .filter(s => s !== undefined);

      const scoreSeries = (tickerScores[sym] || []).map(item => item.score);
      const overall = pickOptimalWindow(scoreSeries);

      if (scores.length === 0 && scoreSeries.length === 0) {
        stats[sym] = {
          average: 0,
          latest: 0,
          trend: 'neutral',
          articleCount: 0,
          overallWindow: 0,
        };
        return;
      }

      const average = overall.average;
      const latest = scores.length > 0 ? scores[scores.length - 1] : average;
      const previous = scores.length > 1 ? scores[scores.length - 2] : latest;

      let trend = 'neutral';
      if (latest > previous + 0.05) trend = 'bullish';
      else if (latest < previous - 0.05) trend = 'bearish';

      const articleCount = overall.count;

      stats[sym] = {
        average: average.toFixed(3),
        latest: latest.toFixed(3),
        trend,
        articleCount,
        overallWindow: overall.window,
      };
    });

    return stats;
  }, [activeSymbols, chartData, tickerScores]);

  const COLORS = ['#667eea', '#f56565', '#48bb78', '#ed8936', '#4299e1', '#9f7aea', '#ed64a6', '#38b2ac'];

  const formatDate = (dateStr) =>
    new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload || payload.length === 0) return null;

    return (
      <div className="bg-card border border-border rounded-lg p-3 shadow-lg">
        <p className="text-sm font-semibold text-foreground mb-2">
          {formatDate(label)}
        </p>
        {payload.map((entry, index) => {
          if (entry.dataKey.includes('_count')) return null;

          const count = entry.payload[`${entry.dataKey}_count`] || 0;
          const score = entry.value;

          return (
            <div key={index} className="flex items-center gap-2 text-xs mb-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="font-medium text-foreground">{entry.dataKey}:</span>
              <span className={`font-bold ${score > 0.15 ? 'text-green-500' :
                score < -0.15 ? 'text-red-500' :
                  'text-yellow-500'
                }`}>
                {score.toFixed(3)}
              </span>
              <span className="text-muted-foreground">({count} articles)</span>
            </div>
          );
        })}
      </div>
    );
  };

  const SENTIMENT_THRESHOLDS = { BULLISH: 0.15, BEARISH: -0.15 };

  const getSentimentConfig = (score) => {
    if (score > SENTIMENT_THRESHOLDS.BULLISH) return { label: 'Positive', color: 'text-green-500' };
    if (score < SENTIMENT_THRESHOLDS.BEARISH) return { label: 'Negative', color: 'text-red-500' };
    return { label: 'Neutral', color: 'text-yellow-500' };
  };

  const title = isCrypto ? 'Crypto Sentiment Analysis Trend'
    : isForex ? 'Forex Sentiment Analysis Trend'
      : 'Sentiment Analysis Trend';

  const renderEmptyState = (content) => (
    <div>
      <h3 className="text-xl font-bold text-foreground mb-4">{title}</h3>
      {content}
    </div>
  );

  if (loading) {
    return renderEmptyState(
      <div className="flex items-center gap-2 text-muted-foreground justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin" />
        <span>Loading sentiment data...</span>
      </div>
    );
  }

  if (error) {
    return renderEmptyState(
      <div className="text-red-500 text-center py-12">{error}</div>
    );
  }

  if (targetSymbols.length === 0) {
    return renderEmptyState(
      <div>
       <p className="text-muted-foreground">No sentiment data</p>
      </div>
    );
  }

  if (chartData.length === 0) {
    return renderEmptyState(
      <div className="text-muted-foreground text-center py-12">
        No sentiment data available for {targetSymbols.join(', ')}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-xl font-bold text-foreground">
          {title} - {dataMode === 'market' ? activeSymbols.join(', ') : targetSymbols.join(', ')}
        </h3>

        {assetGroups.length > 1 && (
          <select
            value={selectedCategory || ''}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-secondary border border-border rounded-lg text-sm font-medium text-foreground hover:bg-accent transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {assetGroups.map((group) => (
              <option key={group.category} value={group.category}>
                {group.category.charAt(0).toUpperCase() + group.category.slice(1)} ({group.tickers.length})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        {activeSymbols.map((sym) => {
          const stat = statistics[sym];
          const config = getSentimentConfig(parseFloat(stat.latest));
          const overallLabel = stat.overallWindow
            ? `Overall (last ${stat.overallWindow} articles):`
            : 'Overall:';

          return (
            <div
              key={sym}
              className="bg-secondary/50 border border-border rounded-lg px-2 py-1"
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">{sym}</span>
                <div className="inline-flex gap-x-2 text-xs">
                  <span className="text-muted-foreground">Latest:</span>
                  <span className={`font-bold ${config.color}`}>
                    {stat.latest} ({config.label})
                  </span>
                  {stat.trend === 'bullish' && <TrendingUp className="h-4 w-4 text-green-500" />}
                  {stat.trend === 'bearish' && <TrendingDown className="h-4 w-4 text-red-500" />}
                </div>
              </div>

              <div className="w-full inline-flex items-center justify-between space-x-1">
                <div className="inline-flex items-center gap-x-2 text-xs">
                  <span className="text-muted-foreground">{overallLabel}</span>
                  <span className="font-medium text-foreground">{stat.average}</span>
                </div>
                <div className="inline-flex items-center gap-x-2 text-xs">
                  <span className="text-muted-foreground">Articles:</span>
                  <span className="font-medium text-foreground">{stat.articleCount}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <ResponsiveContainer width="100%" height={400}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="date"
              tickFormatter={formatDate}
              stroke="hsl(var(--muted-foreground))"
              style={{ fontSize: '12px' }}
            />
            <YAxis
              domain={[-1, 1]}
              stroke="hsl(var(--muted-foreground))"
              style={{ fontSize: '12px' }}
              tickFormatter={(value) => value.toFixed(1)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />

            <ReferenceLine
              y={SENTIMENT_THRESHOLDS.BULLISH}
              stroke="#48bb78"
              strokeDasharray="3 3"
              label={{ value: 'Positive', position: 'right', fill: '#48bb78', fontSize: 10 }}
            />
            <ReferenceLine
              y={SENTIMENT_THRESHOLDS.BEARISH}
              stroke="#f56565"
              strokeDasharray="3 3"
              label={{ value: 'Negative', position: 'right', fill: '#f56565', fontSize: 10 }}
            />
            <ReferenceLine
              y={0}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="2 2"
            />

            {activeSymbols.map((sym, index) => (
              <Line
                key={sym}
                type="monotone"
                dataKey={sym}
                name={sym}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 text-xs text-muted-foreground border-t border-border pt-4">
        <p className="font-semibold mb-1">Sentiment Score Definition:</p>
        <p>
          x ≥ 0.15: <span className="text-green-500 font-medium">Positive</span> |
          -0.15 &lt; x &lt; 0.15: <span className="text-yellow-500 font-medium">Neutral</span> |
          x ≤ -0.15: <span className="text-red-500 font-medium">Negative</span>
        </p>
        {dataMode === 'market' && (
          <p className="mt-2">
            Using market-wide sentiment fallback because ticker-specific sentiment feed is currently unavailable.
          </p>
        )}
      </div>
    </div>
  );
}
