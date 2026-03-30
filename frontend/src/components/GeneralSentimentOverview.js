import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, Newspaper, Calendar, BarChart3 } from 'lucide-react';
import { apiService } from '../services/api';

/**
 * GeneralSentimentOverview Component
 * 
 * 展示新闻的通用平均情绪 (Task 1 实现)
 * 使用 /api/news/sentiment/summary 端点
 */
export default function GeneralSentimentOverview({ market = 'crypto', windowHours = 24 }) {
  const cacheKey = `general-news-sentiment:${market}:${windowHours}`;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let isMounted = true;

    const readCachedSummary = () => {
      try {
        const raw = window.localStorage.getItem(cacheKey);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.summary) return null;
        return parsed;
      } catch {
        return null;
      }
    };

    const persistSummary = (nextSummary) => {
      try {
        window.localStorage.setItem(
          cacheKey,
          JSON.stringify({
            cachedAt: new Date().toISOString(),
            summary: nextSummary,
          })
        );
      } catch {
        // Ignore storage failures and continue with live data only.
      }
    };

    const applySummary = (nextSummary, cachedAt = null) => {
      if (!isMounted) return;
      setSummary(nextSummary);
      setLastUpdated(cachedAt);
      setError(null);
    };

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const isUsableSummary = (response) =>
      Boolean(
        response &&
        (response.success || response.total_articles !== undefined || response.scored_articles !== undefined) &&
        response.average_sentiment_score !== undefined &&
        response.dominant_sentiment
      );

    const fetchGeneralSentiment = async () => {
      setLoading(true);
      setError(null);
      
      try {
        console.log('[GeneralSentimentOverview] Fetching sentiment for market:', market);
        const cached = readCachedSummary();
        let lastFailure = null;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const response = await apiService.makeRequest(
              `/news/sentiment/summary?market=${market}&window_hours=${windowHours}&limit=1000`,
              { method: 'GET' },
              '/api'
            );

            console.log('[GeneralSentimentOverview] API Response:', response);

            if (isUsableSummary(response)) {
              persistSummary(response);
              applySummary(response);
              console.log('[GeneralSentimentOverview] Summary set successfully');
              return;
            }

            lastFailure = new Error(`No sentiment data available (${market})`);
            console.error('[GeneralSentimentOverview] API returned failure:', response);
          } catch (attemptError) {
            lastFailure = attemptError;
            console.error('[GeneralSentimentOverview] Error fetching sentiment:', attemptError);
          }

          if (attempt < 3) {
            await sleep(800 * attempt);
          }
        }

        if (cached) {
          applySummary(cached.summary, cached.cachedAt);
          console.warn('[GeneralSentimentOverview] Falling back to cached summary');
          return;
        }

        if (isMounted) {
          const message = lastFailure?.message?.startsWith('No sentiment data available')
            ? lastFailure.message
            : `Unable to load sentiment data: ${lastFailure?.message || 'Unknown error'}`;
          setError(message);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchGeneralSentiment();

    return () => {
      isMounted = false;
    };
  }, [cacheKey, market, windowHours]);

  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Newspaper className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">
            General News Sentiment
          </h3>
        </div>
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">{error}</p>
          <p className="text-xs mt-2 opacity-70">
            Market: {market} • Window: {windowHours}h
          </p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!summary) return null;

  const { 
    average_sentiment_score, 
    dominant_sentiment, 
    sentiment_breakdown = {},
    total_articles,
    scored_articles 
  } = summary;

  // 情绪配置
  const getSentimentConfig = (label) => {
    const configs = {
      'Bullish': { color: 'text-green-500', bgColor: 'bg-green-500/10', icon: TrendingUp },
      'Somewhat Bullish': { color: 'text-green-400', bgColor: 'bg-green-400/10', icon: TrendingUp },
      'Neutral': { color: 'text-yellow-500', bgColor: 'bg-yellow-500/10', icon: Minus },
      'Somewhat Bearish': { color: 'text-red-400', bgColor: 'bg-red-400/10', icon: TrendingDown },
      'Bearish': { color: 'text-red-500', bgColor: 'bg-red-500/10', icon: TrendingDown },
    };
    return configs[label] || configs['Neutral'];
  };

  const config = getSentimentConfig(dominant_sentiment);
  const Icon = config.icon;

  // 计算情绪分布百分比
  const total = Object.values(sentiment_breakdown).reduce((sum, count) => sum + count, 0);
  const getPercentage = (count) => total > 0 ? ((count / total) * 100).toFixed(1) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-card border border-border rounded-xl p-6"
    >
      {/* 标题 */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Newspaper className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">
            General News Sentiment
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>Last {windowHours}h</span>
        </div>
      </div>

      {/* 主要指标 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* 主导情绪 */}
        <div className={`${config.bgColor} rounded-lg p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <Icon className={`h-5 w-5 ${config.color}`} />
            <span className="text-xs text-muted-foreground">Dominant</span>
          </div>
          <div className={`text-2xl font-bold ${config.color}`}>
            {dominant_sentiment}
          </div>
        </div>

        {/* 平均分数 */}
        <div className="bg-secondary/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-5 w-5 text-blue-500" />
            <span className="text-xs text-muted-foreground">Average Score</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {average_sentiment_score !== undefined 
              ? average_sentiment_score.toFixed(4) 
              : 'N/A'}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {average_sentiment_score > 0.15 
              ? 'Bullish' 
              : average_sentiment_score < -0.15 
              ? 'Bearish' 
              : 'Neutral'}
          </div>
        </div>

        {/* 文章数量 */}
        <div className="bg-secondary/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Newspaper className="h-5 w-5 text-purple-500" />
            <span className="text-xs text-muted-foreground">Articles</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {total_articles || 0}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {scored_articles || 0} scored
          </div>
        </div>
      </div>

      {/* 情绪分布 */}
      <div className="space-y-3">
        <div className="text-sm font-semibold text-foreground mb-2">
          Sentiment Breakdown
        </div>
        
        {Object.entries(sentiment_breakdown).map(([label, count]) => {
          const percentage = getPercentage(count);
          const labelConfig = getSentimentConfig(label);
          
          return (
            <div key={label} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="text-foreground font-medium">
                  {count} ({percentage}%)
                </span>
              </div>
              <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${percentage}%` }}
                  transition={{ duration: 0.8, delay: 0.2 }}
                  className={`h-full ${labelConfig.bgColor.replace('/10', '')}`}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* 说明 */}
      <div className="mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
        <p className="font-semibold mb-1">Sentiment Score Definition:</p>
        <p>
          x ≥ 0.15: <span className="text-green-500 font-medium">Bullish</span> | 
          -0.15 &lt; x &lt; 0.15: <span className="text-yellow-500 font-medium">Neutral</span> | 
          x ≤ -0.15: <span className="text-red-500 font-medium">Bearish</span>
        </p>
        <p className="mt-2 text-[10px] opacity-70">
          Market: {market.toUpperCase()} • Window: {windowHours} hours • 
          Provider: {summary.provider || 'AlphaVantage'}
        </p>
        {lastUpdated && (
          <p className="mt-1 text-[10px] opacity-70">
            Showing last successful result from {new Date(lastUpdated).toLocaleString()}.
          </p>
        )}
      </div>
    </motion.div>
  );
}
