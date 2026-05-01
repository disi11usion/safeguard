import React, { useState } from 'react';

const CorrelationMatrix = ({ correlationData, symbols }) => {
  const [hoveredCell, setHoveredCell] = useState(null);
  const [sortBy, setSortBy] = useState('symbol');

  // Empty State - when not enough symbols selected
  if (!symbols || symbols.length < 2) {
    return (
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="text-lg font-bold text-foreground">Correlation Matrix</h3>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[300px] space-y-2 p-6">
          <p className="text-sm text-muted-foreground text-center">
            Please select at least 2 stocks to view correlation matrix.
          </p>
          <p className="text-xs text-muted-foreground text-center">
            Switch to "Compare Mode" and select multiple stocks to analyze their correlations.
          </p>
        </div>
      </div>
    );
  }

  // No data available state
  if (!correlationData || !correlationData.correlation_matrix) {
    return (
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="text-lg font-bold text-foreground">Correlation Matrix</h3>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[300px] space-y-2 p-6">
          <p className="text-sm text-muted-foreground">Loading correlation data...</p>
        </div>
      </div>
    );
  }

  const matrix = correlationData.correlation_matrix;
  const volatility = correlationData.volatility || {};
  const meanReturns = correlationData.mean_returns || {};
  const strongestCorrelations = correlationData.strongest_correlations || [];

  // Sort symbols based on selected criteria
  const sortedSymbols = [...symbols].sort((a, b) => {
    switch (sortBy) {
      case 'volatility':
        return (volatility[b] || 0) - (volatility[a] || 0);
      case 'returns':
        return (meanReturns[b] || 0) - (meanReturns[a] || 0);
      case 'symbol':
      default:
        return a.localeCompare(b);
    }
  });

  const getCorrelationColor = (value) => {
    if (value === 1) return '#424242'; // Diagonal (self-correlation)
    
    const intensity = Math.abs(value);
    if (value > 0) {
      // Positive correlation - shades of green
      if (intensity > 0.8) return '#1b5e20';
      if (intensity > 0.6) return '#2e7d32';
      if (intensity > 0.4) return '#43a047';
      if (intensity > 0.2) return '#66bb6a';
      return '#a5d6a7';
    } else {
      // Negative correlation - shades of red
      if (intensity > 0.8) return '#b71c1c';
      if (intensity > 0.6) return '#c62828';
      if (intensity > 0.4) return '#d32f2f';
      if (intensity > 0.2) return '#f44336';
      return '#ef5350';
    }
  };

  const getTextColor = (value) => {
    const intensity = Math.abs(value);
    return intensity > 0.5 || value === 1 ? '#ffffff' : '#000000';
  };

  const formatCorrelation = (value) => {
    return value?.toFixed(3) || 'N/A';
  };

  const formatPercentage = (value, decimals = 2) => {
    return value ? `${(value * 100).toFixed(decimals)}%` : 'N/A';
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-secondary/30">
        <h3 className="text-sm font-bold text-foreground">Correlation Matrix</h3>
        <div className="flex items-center gap-2">
          <label htmlFor="sort-select" className="text-xs text-muted-foreground">Sort by:</label>
          <select 
            id="sort-select"
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            className="text-xs bg-background border border-border rounded px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="symbol">Symbol</option>
            <option value="volatility">Volatility</option>
            <option value="returns">Returns</option>
          </select>
        </div>
      </div>

      {/* Summary Statistics - Compact Grid */}
      <div className="grid grid-cols-3 gap-3 px-6 py-3 bg-secondary/10 border-b border-border">
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-muted-foreground">Analysis Period</h4>
          <p className="text-xs text-foreground">{correlationData.summary_stats?.period_start} to {correlationData.summary_stats?.period_end}</p>
          <p className="text-xs text-muted-foreground">{correlationData.summary_stats?.trading_days} days</p>
        </div>
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-muted-foreground">Correlation Range</h4>
          <p className="text-xs text-foreground">Max: {formatCorrelation(correlationData.summary_stats?.max_correlation)}</p>
          <p className="text-xs text-foreground">Min: {formatCorrelation(correlationData.summary_stats?.min_correlation)}</p>
        </div>
        <div className="space-y-0.5">
          <h4 className="text-xs font-semibold text-muted-foreground">Average Metrics</h4>
          <p className="text-xs text-foreground">Return: {formatPercentage(correlationData.summary_stats?.average_daily_return, 3)}</p>
          <p className="text-xs text-foreground">Vol: {formatPercentage(correlationData.summary_stats?.average_volatility)}</p>
        </div>
      </div>

      {/* Correlation Matrix Table - Compact */}
      <div className="p-4 overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 bg-secondary/50 border border-border p-1.5 text-left font-semibold text-foreground min-w-[60px]">
                Symbol
              </th>
              {sortedSymbols.map(symbol => (
                <th key={symbol} className="border border-border p-1.5 bg-secondary/30 min-w-[60px]">
                  <div className="flex flex-col items-center gap-0.5">
                    <div className="font-bold text-foreground">{symbol}</div>
                    <div className="text-[10px] text-muted-foreground">V:{formatPercentage(volatility[symbol], 1)}</div>
                    <div className="text-[10px] text-muted-foreground">R:{formatPercentage(meanReturns[symbol], 2)}</div>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedSymbols.map(rowSymbol => (
              <tr key={rowSymbol}>
                <td className="sticky left-0 bg-secondary/50 border border-border p-1.5 font-semibold">
                  <div className="flex flex-col gap-0.5">
                    <div className="text-foreground">{rowSymbol}</div>
                    <div className="text-[10px] text-muted-foreground">V:{formatPercentage(volatility[rowSymbol], 1)}</div>
                    <div className="text-[10px] text-muted-foreground">R:{formatPercentage(meanReturns[rowSymbol], 2)}</div>
                  </div>
                </td>
                {sortedSymbols.map(colSymbol => {
                  const correlation = matrix[rowSymbol]?.[colSymbol];
                  const cellKey = `${rowSymbol}-${colSymbol}`;
                  
                  return (
                    <td 
                      key={colSymbol}
                      className="border border-border p-1.5 text-center font-medium cursor-pointer relative transition-all hover:scale-105"
                      style={{
                        backgroundColor: getCorrelationColor(correlation),
                        color: getTextColor(correlation)
                      }}
                      onMouseEnter={() => setHoveredCell(cellKey)}
                      onMouseLeave={() => setHoveredCell(null)}
                      title={`${rowSymbol} vs ${colSymbol}: ${formatCorrelation(correlation)}`}
                    >
                      {formatCorrelation(correlation)}
                      {hoveredCell === cellKey && rowSymbol !== colSymbol && (
                        <div className="absolute z-10 bg-popover border border-border rounded-lg shadow-lg p-2 -top-16 left-1/2 -translate-x-1/2 whitespace-nowrap">
                          <div className="text-xs font-semibold text-popover-foreground">Correlation: {formatCorrelation(correlation)}</div>
                          <div className="text-xs text-muted-foreground">{rowSymbol} vs {colSymbol}</div>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Footer Section - Compact */}
      <div className="border-t border-border bg-secondary/10">
        {/* Strongest Correlations */}
        {strongestCorrelations.length > 0 && (
          <div className="p-4 border-b border-border">
            <h4 className="text-sm font-semibold text-foreground mb-2">Strongest Correlations</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
              {strongestCorrelations.slice(0, 6).map((corr, index) => (
                <div 
                  key={index} 
                  className="flex items-center justify-between bg-background border border-border rounded-lg px-3 py-1.5"
                >
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="font-semibold text-foreground">{corr.symbol1}</span>
                    <span className="text-muted-foreground">↔</span>
                    <span className="font-semibold text-foreground">{corr.symbol2}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">{formatCorrelation(corr.correlation)}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-medium">
                      {corr.strength}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Color Legend - Horizontal Compact */}
        <div className="p-4">
          <h4 className="text-sm font-semibold text-foreground mb-2">Legend</h4>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#b71c1c' }}></div>
              <span className="text-muted-foreground">Strong Negative (-0.8 to -1.0)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#d32f2f' }}></div>
              <span className="text-muted-foreground">Moderate Negative (-0.4 to -0.8)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#ef5350' }}></div>
              <span className="text-muted-foreground">Weak Negative (-0.2 to -0.4)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#a5d6a7' }}></div>
              <span className="text-muted-foreground">Weak Positive (0.2 to 0.4)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#43a047' }}></div>
              <span className="text-muted-foreground">Moderate Positive (0.4 to 0.8)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded" style={{ backgroundColor: '#1b5e20' }}></div>
              <span className="text-muted-foreground">Strong Positive (0.8 to 1.0)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CorrelationMatrix;