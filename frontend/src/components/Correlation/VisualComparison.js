import React, { useState, useEffect } from 'react';

const VisualComparison = ({ correlationData, symbols }) => {
  const [selectedSymbol1, setSelectedSymbol1] = useState('');
  const [selectedSymbol2, setSelectedSymbol2] = useState('');
  const [comparisonData, setComparisonData] = useState(null);

  useEffect(() => {
    if (symbols && symbols.length >= 2) {
      setSelectedSymbol1(symbols[0]);
      setSelectedSymbol2(symbols[1]);
    }
  }, [symbols]);

  useEffect(() => {
    if (selectedSymbol1 && selectedSymbol2 && correlationData) {
      generateComparisonData();
    }
  }, [selectedSymbol1, selectedSymbol2, correlationData]);

  const generateComparisonData = () => {
    // Debug logs for troubleshooting empty chart/data issues
    console.log("correlationData:", correlationData);
    console.log("symbols:", selectedSymbol1, selectedSymbol2);
    console.log("returns:", correlationData.mean_returns?.[selectedSymbol1], correlationData.mean_returns?.[selectedSymbol2]);
    console.log("volatility:", correlationData.volatility?.[selectedSymbol1], correlationData.volatility?.[selectedSymbol2]);

    if (!correlationData.correlation_matrix) return;

    const correlation = correlationData.correlation_matrix[selectedSymbol1]?.[selectedSymbol2];
    const volatility1 = correlationData.volatility?.[selectedSymbol1];
    const volatility2 = correlationData.volatility?.[selectedSymbol2];
    const return1 = correlationData.mean_returns?.[selectedSymbol1];
    const return2 = correlationData.mean_returns?.[selectedSymbol2];

    setComparisonData({
      correlation,
      volatility1,
      volatility2,
      return1,
      return2,
      symbol1: selectedSymbol1,
      symbol2: selectedSymbol2
    });
  };

  const getCorrelationColor = (correlation) => {
    if (correlation > 0.7) return '#2e7d32'; // Strong positive - dark green
    if (correlation > 0.3) return '#66bb6a'; // Moderate positive - light green
    if (correlation > -0.3) return '#ffa726'; // Weak - orange
    if (correlation > -0.7) return '#ef5350'; // Moderate negative - light red
    return '#c62828'; // Strong negative - dark red
  };

  const getCorrelationDescription = (correlation) => {
    const abs = Math.abs(correlation);
    const direction = correlation > 0 ? 'positive' : 'negative';
    
    if (abs > 0.8) return `Very strong ${direction}`;
    if (abs > 0.6) return `Strong ${direction}`;
    if (abs > 0.4) return `Moderate ${direction}`;
    if (abs > 0.2) return `Weak ${direction}`;
    return 'Very weak';
  };

  const formatPercentage = (value, decimals = 2) => {
    return `${(value * 100).toFixed(decimals)}%`;
  };

  // Empty State - when not enough symbols selected
  if (!symbols || symbols.length < 2) {
    return (
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="text-lg font-bold text-foreground">Visual Comparison</h3>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[300px] space-y-2 p-6">
          <p className="text-sm text-muted-foreground text-center">
            Please select at least 2 stocks to view visual comparison.
          </p>
          <p className="text-xs text-muted-foreground text-center">
            Switch to "Compare Mode" and select multiple stocks to compare their performance.
          </p>
        </div>
      </div>
    );
  }

  // No data available state
  if (!correlationData) {
    return (
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-secondary/30">
          <h3 className="text-lg font-bold text-foreground">Visual Comparison</h3>
        </div>
        <div className="flex flex-col items-center justify-center min-h-[300px] space-y-2 p-6">
          <p className="text-sm text-muted-foreground">Loading comparison data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-border bg-secondary/30">
        <h3 className="text-sm font-bold text-foreground">Pairwise Comparison</h3>
      </div>

      {/* Stock Selection - Compact */}
      <div className="flex items-center gap-3 px-4 bg-secondary/10 border-b border-border">
        <div className="flex items-center gap-2 flex-1">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">First:</label>
          <select
            value={selectedSymbol1}
            onChange={(e) => setSelectedSymbol1(e.target.value)}
            className="flex-1 text-sm bg-background border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {symbols.map(symbol => (
              <option key={symbol} value={symbol}>{symbol}</option>
            ))}
          </select>
        </div>
        <div className="text-sm font-bold text-primary px-2">VS</div>
        <div className="flex items-center gap-2 flex-1">
          <label className="text-xs font-medium text-muted-foreground whitespace-nowrap">Second:</label>
          <select
            value={selectedSymbol2}
            onChange={(e) => setSelectedSymbol2(e.target.value)}
            className="flex-1 text-sm bg-background border border-border rounded px-2 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {symbols.map(symbol => (
              <option key={symbol} value={symbol}>{symbol}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Comparison Content */}
      {comparisonData && (
        <div className="p-4 space-y-4">
          {/* Correlation Display - Compact */}
          <div className="flex items-center gap-4 bg-secondary/10">
            <div 
              className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg flex-shrink-0"
              style={{ backgroundColor: getCorrelationColor(comparisonData.correlation) }}
            >
              {comparisonData.correlation?.toFixed(3) || 'N/A'}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-foreground mb-1">Correlation Coefficient</h4>
              <p className="text-xs text-primary font-medium mb-1">
                {getCorrelationDescription(comparisonData.correlation)}
              </p>
              <p className="text-xs text-muted-foreground">
                {comparisonData.correlation > 0
                  ? `${selectedSymbol1} and ${selectedSymbol2} tend to move together`
                  : `${selectedSymbol1} and ${selectedSymbol2} tend to move oppositely`
                }
              </p>
            </div>
          </div>

          {/* Stats Comparison - Compact Table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="grid grid-cols-4 bg-secondary/50 text-xs font-semibold text-foreground">
              <div className="p-2 border-r border-border">Metric</div>
              <div className="p-2 border-r border-border text-center">{selectedSymbol1}</div>
              <div className="p-2 border-r border-border text-center">{selectedSymbol2}</div>
              <div className="p-2 text-center">Winner</div>
            </div>
            <div className="grid grid-cols-4 text-xs border-t border-border">
              <div className="p-2 border-r border-border font-medium text-muted-foreground bg-secondary/20">Volatility</div>
              <div className="p-2 border-r border-border text-center font-semibold text-foreground">
                {formatPercentage(comparisonData.volatility1)}
              </div>
              <div className="p-2 border-r border-border text-center font-semibold text-foreground">
                {formatPercentage(comparisonData.volatility2)}
              </div>
              <div className="p-2 text-center text-xs text-muted-foreground">
                {comparisonData.volatility1 > comparisonData.volatility2 ? selectedSymbol1 : selectedSymbol2} (more volatile)
              </div>
            </div>
            <div className="grid grid-cols-4 text-xs border-t border-border">
              <div className="p-2 border-r border-border font-medium text-muted-foreground bg-secondary/20">Avg Return</div>
              <div className="p-2 border-r border-border text-center font-semibold text-foreground">
                {formatPercentage(comparisonData.return1, 3)}
              </div>
              <div className="p-2 border-r border-border text-center font-semibold text-foreground">
                {formatPercentage(comparisonData.return2, 3)}
              </div>
              <div className="p-2 text-center text-xs text-muted-foreground">
                {comparisonData.return1 > comparisonData.return2 ? selectedSymbol1 : selectedSymbol2} (higher return)
              </div>
            </div>
          </div>

          {/* Risk-Return Comparison - Simplified */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-foreground">Risk vs Return Comparison</h4>
            
            {/* Asset 1 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{selectedSymbol1}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Risk/Return Ratio:</span>
                  <span className="text-xs font-bold text-primary">
                    {(Math.abs(comparisonData.return1) / comparisonData.volatility1).toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                {/* Return Bar */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-muted-foreground">Return</span>
                    <span className={`text-xs font-semibold ${comparisonData.return1 >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatPercentage(comparisonData.return1, 3)}
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${comparisonData.return1 >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(Math.abs(comparisonData.return1 * 100 * 10), 100)}%` }}
                    />
                  </div>
                </div>
                {/* Risk Bar */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-muted-foreground">Risk</span>
                    <span className="text-xs font-semibold text-foreground">
                      {formatPercentage(comparisonData.volatility1)}
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary"
                      style={{ width: `${Math.min(comparisonData.volatility1, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-border"></div>

            {/* Asset 2 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">{selectedSymbol2}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Risk/Return Ratio:</span>
                  <span className="text-xs font-bold text-green-500">
                    {(Math.abs(comparisonData.return2) / comparisonData.volatility2).toFixed(2)}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5">
                {/* Return Bar */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-muted-foreground">Return</span>
                    <span className={`text-xs font-semibold ${comparisonData.return2 >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {formatPercentage(comparisonData.return2, 3)}
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${comparisonData.return2 >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.min(Math.abs(comparisonData.return2 * 100 * 10), 100)}%` }}
                    />
                  </div>
                </div>
                {/* Risk Bar */}
                <div>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-xs text-muted-foreground">Risk</span>
                    <span className="text-xs font-semibold text-foreground">
                      {formatPercentage(comparisonData.volatility2)}
                    </span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-green-500"
                      style={{ width: `${Math.min(comparisonData.volatility2, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Insight */}
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-2">
              <p className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {(() => {
                    const ratio1 = Math.abs(comparisonData.return1) / comparisonData.volatility1;
                    const ratio2 = Math.abs(comparisonData.return2) / comparisonData.volatility2;
                    const better = ratio1 > ratio2 ? selectedSymbol1 : selectedSymbol2;
                    return `${better}`;
                  })()}
                </span>
                {' '}has a better risk-adjusted return (higher return per unit of risk)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
  
  export default VisualComparison;