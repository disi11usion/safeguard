import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Minus, MessageSquare, Calendar, BarChart3 } from 'lucide-react';
import { apiService } from '../services/api';

/**
 * SocialSentimentOverview Component
 *
 * 展示社媒评论 + 正文的通用平均情绪 (Task 2 实现)
 * 使用 /api/social/sentiment/summary 端点
 */
export default function SocialSentimentOverview({ windowHours = 24 }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    const fetchSocialSentiment = async () => {
      setLoading(true);
      setError(null);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);

        const response = await apiService.makeRequest(
          `/social/sentiment/summary?window_hours=${windowHours}&limit=100`,
          { method: 'GET', signal: controller.signal },
          '/api'
        );
        clearTimeout(timeout);

        if (response && response.success && response.total_posts !== undefined) {
          setSummary(response);
        } else {
          const reason = response?.error || response?.message || 'No social sentiment data available';
          setError(reason);
        }
      } catch (err) {
        const message = err.name === 'AbortError'
          ? 'Social sentiment request timed out'
          : `Unable to load social sentiment data: ${err.message}`;
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    fetchSocialSentiment();
  }, [windowHours]);

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
          <MessageSquare className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">
            General Social Sentiment
          </h3>
        </div>
        <div className="text-center text-muted-foreground py-8">
          <p className="text-sm">{error}</p>
          <p className="text-xs mt-2 opacity-70">
            Window: {windowHours}h
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

  if (!summary) {
    return null;
  }

  const {
    average_sentiment_score,
    dominant_sentiment,
    sentiment_breakdown = {},
    total_posts,
    scored_posts
  } = summary;

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

  const total = Object.values(sentiment_breakdown).reduce((sum, count) => sum + count, 0);
  const getPercentage = (count) => total > 0 ? ((count / total) * 100).toFixed(1) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-card border border-border rounded-xl p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-bold text-foreground">
            General Social Sentiment
          </h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>Last {windowHours}h</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className={`${config.bgColor} rounded-lg p-4`}>
          <div className="flex items-center gap-2 mb-2">
            <Icon className={`h-5 w-5 ${config.color}`} />
            <span className="text-xs text-muted-foreground">Dominant</span>
          </div>
          <div className={`text-2xl font-bold ${config.color}`}>
            {dominant_sentiment}
          </div>
        </div>

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

        <div className="bg-secondary/50 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="h-5 w-5 text-purple-500" />
            <span className="text-xs text-muted-foreground">Posts</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {total_posts || 0}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {scored_posts || 0} scored
          </div>
        </div>
      </div>

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
    </motion.div>
  );
}
