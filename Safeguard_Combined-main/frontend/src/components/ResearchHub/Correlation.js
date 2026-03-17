import React, { useState, useEffect } from 'react';
import VisualComparison from '../Correlation/VisualComparison';
import CorrelationMatrix from '../Correlation/CorrelationMatrix';
import CorrelationAnalysis from '../Correlation/CorrelationAnalysis';
import { apiService } from '../../services/api';

const Correlation = ({ symbols = [], stockData = {}, dateRange = {} }) => {
  const [correlationData, setCorrelationData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch correlation data from backend when symbols/stockData changes
  useEffect(() => {
    const fetchCorrelationData = async () => {
      // Only calculate if we have at least 2 symbols with data
      if (!symbols || symbols.length < 2 || Object.keys(stockData).length < 2) {
        setCorrelationData(null);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Prepare request payload
        const requestData = {
          symbols: symbols,
          stock_data: stockData,
          start_date: dateRange.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end_date: dateRange.end || new Date().toISOString().split('T')[0]
        };

        console.log('Sending correlation request:', requestData);

        // Call backend API
        const response = await apiService.makeRequest(
          '/correlation',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestData),
          },
          '/api'
        );

        console.log('Correlation response:', response);
        setCorrelationData(response);
      } catch (err) {
        console.error('Error fetching correlation data:', err);
        setError(err.message || 'Failed to calculate correlation');
      } finally {
        setLoading(false);
      }
    };

    fetchCorrelationData();
  }, [symbols, stockData, dateRange]);

  return (
    <div className="w-full">
      {/* Two Column Layout - Always Visible */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Correlation Matrix */}
          <div className="lg:col-span-1">
            <CorrelationMatrix
              correlationData={loading ? null : correlationData}
              symbols={symbols}
            />
          </div>

          {/* Right Column - Visual Comparison */}
          <div className="lg:col-span-1">
            <VisualComparison
              correlationData={loading ? null : correlationData}
              symbols={symbols}
            />
          </div>
        </div>

        {/* Full Width AI Analysis Section */}
        <div className="w-full">
          <CorrelationAnalysis
            correlationData={loading ? null : correlationData}
          />
        </div>
      </div>

      {/* Error State Overlay */}
      {error && !loading && (
        <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <p className="text-sm text-red-600 dark:text-red-400">Error: {error}</p>
          <p className="text-xs text-red-500 dark:text-red-500 mt-1">Please try again or select different stocks.</p>
        </div>
      )}
    </div>
  );
}

export default Correlation;