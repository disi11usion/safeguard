import React, { useEffect, useState } from 'react';
import { apiService } from '../services/api';
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react';

export default function SentimentAnalysis({ coin }) {
  const [sentiment, setSentiment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!coin?.symbol) {
      setSentiment(null);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    setError(null);
    
    apiService.getSentiment()
      .then(data => {
        // API returns array of arrays: [id, score, label, name, symbol, short]
        const found = data.find(item => 
          item[5]?.toLowerCase() === coin.symbol.toLowerCase()
        );
        setSentiment(found || null);
        setLoading(false);
      })
      .catch(() => {
        setError('Failed to load sentiment data');
        setLoading(false);
      });
  }, [coin]);

  // Render loading state
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h3 className="text-xl font-bold text-foreground mb-4">
          Sentiment Analysis{coin?.name ? `: ${coin.name}` : ''}
        </h3>
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading sentiment data...</span>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h3 className="text-xl font-bold text-foreground mb-4">
          Sentiment Analysis{coin?.name ? `: ${coin.name}` : ''}
        </h3>
        <div className="text-red-500">{error}</div>
      </div>
    );
  }

  // Render no data state
  if (!sentiment) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <h3 className="text-xl font-bold text-foreground mb-4">
          Sentiment Analysis{coin?.name ? `: ${coin.name}` : ''}
        </h3>
        <div className="text-muted-foreground">No sentiment data available for this coin.</div>
      </div>
    );
  }

  // sentiment: [id, score, label, name, symbol, short]
  const score = sentiment[1];
  const label = sentiment[2]; // 'positive', 'negative', or 'neutral'
  const name = sentiment[3] || coin?.name;

  // Get sentiment color and icon
  const getSentimentConfig = () => {
    switch (label) {
      case 'positive':
        return {
          color: 'text-green-500',
          bgColor: 'bg-green-500/10',
          borderColor: 'border-green-500/30',
          icon: TrendingUp
        };
      case 'negative':
        return {
          color: 'text-red-500',
          bgColor: 'bg-red-500/10',
          borderColor: 'border-red-500/30',
          icon: TrendingDown
        };
      default:
        return {
          color: 'text-yellow-500',
          bgColor: 'bg-yellow-500/10',
          borderColor: 'border-yellow-500/30',
          icon: Minus
        };
    }
  };

  const config = getSentimentConfig();
  const SentimentIcon = config.icon;

  return (
    <div className="bg-card border border-border rounded-xl p-6 mb-6">
      <h3 className="text-xl font-bold text-foreground mb-4">
        Sentiment Analysis{name ? `: ${name}` : ''}
      </h3>
      
      <div className="space-y-4">
        {/* Score Display */}
        <div className={`flex items-center gap-3 p-4 rounded-lg border ${config.bgColor} ${config.borderColor}`}>
          <SentimentIcon className={`h-6 w-6 ${config.color}`} />
          <div className="flex-1">
            <div className="text-sm text-muted-foreground mb-1">Sentiment Score</div>
            <div className="text-2xl font-bold text-primary">{score}</div>
          </div>
        </div>

        {/* Sentiment Label */}
        <div className="flex items-center justify-between p-4 bg-secondary/50 rounded-lg">
          <span className="text-sm font-medium text-muted-foreground">Overall Sentiment</span>
          <span className={`text-base font-bold capitalize ${config.color}`}>
            {label}
          </span>
        </div>
      </div>
    </div>
  );
}
 