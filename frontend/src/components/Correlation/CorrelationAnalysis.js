import React, { useState } from 'react';
import { apiService } from '../../services/api';

const CorrelationAnalysis = ({ correlationData }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateAnalysis = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await apiService.makeRequest(
        '/deepseek/correlationsummary',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(correlationData)
        },
        '/api'
      );
      
      setAnalysis(response);
    } catch (err) {
      setError(err.message || 'Failed to generate AI analysis');
      console.error('AI analysis error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Empty state when no correlation data
  if (!correlationData) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-bold text-foreground mb-2">AI Correlation Analysis</h3>
        <p className="text-sm text-muted-foreground">No correlation data available. Select stocks to view AI-generated insights.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-foreground">AI Correlation Analysis</h3>
        {!analysis && (
          <button
            onClick={generateAnalysis}
            disabled={loading}
            className="mt-4 px-2 py-1 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Generating...' : 'Generate AI Analysis'}
          </button>
        )}
      </div>

      {error && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive rounded-lg p-4 mb-4">
          <p className="text-sm font-medium">Error: {error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          <span className="ml-3 text-muted-foreground">Analyzing correlation data...</span>
        </div>
      )}

      {analysis && !loading && (
        <div className="space-y-4">
          {/* Title */}
          {analysis.title && (
            <h4 className="text-base font-semibold text-foreground">{analysis.title}</h4>
          )}

          {/* Summary */}
          {analysis.summary && (
            <p className="text-sm text-foreground leading-relaxed">{analysis.summary}</p>
          )}

          {/* Suggestion - Highlighted Box */}
          {analysis.suggestion && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
              <p className="text-sm font-medium text-foreground mb-1">💡 Suggestion</p>
              <p className="text-sm text-foreground/90">{analysis.suggestion}</p>
            </div>
          )}

          {/* Disclaimer */}
          <div className="flex justify-between pt-2">
            <button
              onClick={generateAnalysis}
              disabled={loading}
              className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg hover:border-primary/50 transition-colors"
            >
              Regenerate Analysis
            </button>
            <p className="text-xs text-muted-foreground italic">
              AI suggestion, for reference only
            </p>
          </div>

        </div>
      )}
    </div>
  );
};

export default CorrelationAnalysis;
