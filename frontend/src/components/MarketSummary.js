import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, BarChart3 } from 'lucide-react';
import { apiService } from '../services/api';

const INDICATOR_INFO = {
  sma: "Simple Moving Average - Average price over the period",
  ema: "Exponential Moving Average - Weighted average giving more importance to recent prices",
  macd: "Moving Average Convergence Divergence - Trend-following momentum indicator",
  rsi: "Relative Strength Index - Measures overbought (>70) or oversold (<30) conditions"
};

function IndicatorLabelWithTooltip({ label, info }) {
  const [show, setShow] = useState(false);
  return (
    <span className="relative inline-block">
      <span
        className="text-muted-foreground cursor-pointer border-b border-dotted border-muted-foreground hover:text-foreground transition-colors"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        tabIndex={0}
      >
        {label}
      </span>
      {show && (
        <div className="absolute left-1/2 top-[120%] -translate-x-1/2 bg-popover/98 backdrop-blur-sm text-popover-foreground p-3 rounded-lg text-sm min-w-[220px] z-10 shadow-xl border border-border">
          {info}
        </div>
      )}
    </span>
  );
}

export default function MarketSummary({ selectedAsset }) {
  const [marketData, setMarketData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (selectedAsset) {
      fetchMarketData();
    } else {
      setMarketData(null);
    }
  }, [selectedAsset]);

  const fetchMarketData = async () => {
    if (!selectedAsset) return;

    setLoading(true);
    setError(null);

    try {
      const response = await apiService.getMarketSummaryWithIndicators(
        selectedAsset.ticker,
        selectedAsset.category,
        12 // 12 days
      );

      if (response.success) {
        setMarketData(response);
      } else {
        setError(response.error || 'Failed to fetch market data');
      }
    } catch (err) {
      console.error('Error fetching market data:', err);
      setError(err.message || 'An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-8">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <span className="text-muted-foreground">Loading market data...</span>
        </div>
    );
  }

  // No asset selected
  if (!selectedAsset) {
    return (
       <div className="flex flex-col items-center justify-center text-center">
          <div className="bg-secondary/50 rounded-full p-4 mb-4">
            <TrendingUp className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-lg font-medium mb-2">No Asset Selected</p>
          <p className="text-muted-foreground text-sm max-w-md">
            Select an asset from your watchlist to view sentiment analysis trends and market insights
          </p>
        </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <BarChart3 className="h-12 w-12 text-red-500/50" />
          <p className="text-red-500 font-medium">Failed to load market data</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={fetchMarketData}
            className="mt-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Retry
          </button>
        </div>
    );
  }

  if (!marketData) return null;

  // Helper function to format large numbers
  const formatLargeNumber = (num) => {
    if (num === null || num === undefined) return '--';
    const absNum = Math.abs(num);
    if (absNum >= 1e12) return `${(num / 1e12).toFixed(2)}T`;
    if (absNum >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (absNum >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (absNum >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  // Extract data from API response
  const {
    current_price,
    high_24h,
    low_24h,
    volume_24h,
    change_24h,
    change_24h_percent,
    change_period,
    change_period_percent,
    period_days,
    indicators
  } = marketData;

  return (
    <div className="flex flex-col gap-4">
      {/* Header Section */}
      <div className="flex flex-col gap-4">
        <h3 className="text-sm font-bold text-foreground">
          Market Summary: {selectedAsset.name} ({selectedAsset.ticker})
        </h3>

        {/* Price Display */}
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-3xl font-bold text-primary">
            ${current_price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </span>
          {change_24h_percent !== null && change_24h_percent !== undefined && (
            <span className={`flex items-center gap-1 text-base font-semibold ${change_24h_percent >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
              {change_24h_percent >= 0 ? <TrendingUp className="h-5 w-5" /> : <TrendingDown className="h-5 w-5" />}
              {change_24h_percent > 0 ? '+' : ''}{change_24h_percent.toFixed(2)}%
            </span>
          )}
        </div>

        {/* Indicators Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-3">
          {/* 24h High */}
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs text-muted-foreground">24h High</span>
            <span className="text-sm font-semibold text-foreground truncate">
              ${high_24h !== null && high_24h !== undefined ? formatLargeNumber(high_24h) : '--'}
            </span>
          </div>

          {/* 24h Low */}
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs text-muted-foreground">24h Low</span>
            <span className="text-sm font-semibold text-foreground truncate">
              ${low_24h !== null && low_24h !== undefined ? formatLargeNumber(low_24h) : '--'}
            </span>
          </div>

          {/* Volume */}
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs text-muted-foreground">Volume (24h)</span>
            <span className="text-sm font-semibold text-foreground truncate">
              {volume_24h !== null && volume_24h !== undefined ? formatLargeNumber(volume_24h) : '--'}
            </span>
          </div>

          {/* SMA */}
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs">
              <IndicatorLabelWithTooltip label="SMA" info={INDICATOR_INFO.sma} />
            </span>
            <span className="text-sm font-semibold text-foreground truncate">
              ${indicators?.sma !== null && indicators?.sma !== undefined
                ? formatLargeNumber(indicators.sma)
                : '--'}
            </span>
          </div>

          {/* EMA */}
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs">
              <IndicatorLabelWithTooltip label="EMA" info={INDICATOR_INFO.ema} />
            </span>
            <span className="text-sm font-semibold text-foreground truncate">
              ${indicators?.ema !== null && indicators?.ema !== undefined
                ? formatLargeNumber(indicators.ema)
                : '--'}
            </span>
          </div>

          {/* MACD */}
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs">
              <IndicatorLabelWithTooltip label="MACD" info={INDICATOR_INFO.macd} />
            </span>
            <span className={`text-sm font-semibold truncate ${indicators?.macd && indicators.macd >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
              {indicators?.macd !== null && indicators?.macd !== undefined
                ? indicators.macd.toFixed(4)
                : '--'}
            </span>
          </div>

          {/* RSI */}
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs">
              <IndicatorLabelWithTooltip label="RSI" info={INDICATOR_INFO.rsi} />
            </span>
            <span className={`text-sm font-semibold truncate ${indicators?.rsi
                ? (indicators.rsi > 70 ? 'text-red-500' : indicators.rsi < 30 ? 'text-green-500' : 'text-foreground')
                : 'text-foreground'
              }`}>
              {indicators?.rsi !== null && indicators?.rsi !== undefined
                ? indicators.rsi.toFixed(2)
                : '--'}
            </span>
          </div>

          {/* 24h Change */}
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs text-muted-foreground">24h Change</span>
            <span className={`text-sm font-semibold truncate ${change_24h_percent >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
              {change_24h_percent !== null && change_24h_percent !== undefined
                ? `${change_24h_percent > 0 ? '+' : ''}${change_24h_percent.toFixed(2)}%`
                : '--'}
            </span>
          </div>

          {/* Period Change (12d) */}
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs text-muted-foreground">{period_days}d Change</span>
            <span className={`text-sm font-semibold truncate ${change_period_percent >= 0 ? 'text-green-500' : 'text-red-500'
              }`}>
              {change_period_percent !== null && change_period_percent !== undefined
                ? `${change_period_percent > 0 ? '+' : ''}${change_period_percent.toFixed(2)}%`
                : '--'}
            </span>
          </div>
        </div>
      </div>

      {/* Summary Text */}
      <p className="text-xs text-foreground leading-relaxed pt-2 border-t border-border">
        {selectedAsset.name} is trading at ${current_price?.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        {change_24h_percent !== null && change_24h_percent !== undefined && (
          <>, {change_24h_percent >= 0 ? 'up' : 'down'} {Math.abs(change_24h_percent).toFixed(2)}% over the last 24 hours</>
        )}
        {volume_24h && <>, with a 24h volume of {formatLargeNumber(volume_24h)}</>}.
        {' '}Technical indicators:
        {indicators?.rsi && (
          <> RSI is at {indicators.rsi.toFixed(2)}
            {indicators.rsi > 70 ? ' (overbought)' : indicators.rsi < 30 ? ' (oversold)' : ' (neutral)'}
          </>
        )}
        {indicators?.macd && <>, MACD is {indicators.macd >= 0 ? 'bullish' : 'bearish'}</>}.
      </p>
    </div>
  );
} 