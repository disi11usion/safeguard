import pandas as pd
import numpy as np
from typing import Dict, List, Any
from scipy.stats import pearsonr
from pydantic import BaseModel
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CorrelationRequest(BaseModel):
    symbols: List[str]
    start_date: str
    end_date: str
    timespan: str = "day"


class CorrelationAnalyzer:
    
    def __init__(self):
        pass
    
    def calculate_correlation_matrix(self, stock_data: Dict[str, List[Dict]]) -> Dict[str, Any]:
        try:
            # Convert to DataFrame for easier manipulation
            df = self._prepare_dataframe(stock_data)
            
            if df.empty:
                return {"error": "No valid data available for correlation calculation"}
            
            # Calculate correlation matrix
            correlation_matrix = df.corr()
            
            # Calculate additional statistics
            volatility = df.std()
            returns = df.pct_change().dropna()
            
            result = {
                "correlation_matrix": correlation_matrix.to_dict(),
                "volatility": volatility.to_dict(),
                "mean_returns": returns.mean().to_dict(),
                "symbols": list(df.columns),
                "data_points": len(df),
                "strongest_correlations": self._find_strongest_correlations(correlation_matrix),
                "summary_stats": self._calculate_summary_stats(df)
            }
            
            return result
            
        except Exception as e:
            logger.error(f"Error calculating correlation matrix: {e}")
            return {"error": str(e)}
    
    def _prepare_dataframe(self, stock_data: Dict[str, List[Dict]]) -> pd.DataFrame:
        dataframes = {}
        
        for symbol, data in stock_data.items():
            if not data:
                logger.warning(f"No data available for symbol: {symbol}")
                continue
                
            # Create DataFrame for this symbol
            df = pd.DataFrame(data)
            if 'date' in df.columns and 'close' in df.columns:
                df['date'] = pd.to_datetime(df['date'])
                df = df.set_index('date')
                dataframes[symbol] = df['close']
        
        if not dataframes:
            return pd.DataFrame()
        
        # Combine all symbols into one DataFrame
        combined_df = pd.DataFrame(dataframes)
        
        # Drop rows with any NaN values to ensure clean correlation calculation
        combined_df = combined_df.dropna()
        
        return combined_df
    
    def _find_strongest_correlations(self, correlation_matrix: pd.DataFrame) -> List[Dict]:
        # Get upper triangle of correlation matrix (excluding diagonal)
        mask = np.triu(np.ones_like(correlation_matrix), k=1).astype(bool)
        correlations = []
        
        for i, row in enumerate(correlation_matrix.index):
            for j, col in enumerate(correlation_matrix.columns):
                if mask[i, j]:
                    corr_value = correlation_matrix.iloc[i, j]
                    correlations.append({
                        'symbol1': row,
                        'symbol2': col,
                        'correlation': float(corr_value),
                        'strength': self._categorize_correlation_strength(abs(corr_value))
                    })
        
        # Sort by absolute correlation value
        correlations.sort(key=lambda x: abs(x['correlation']), reverse=True)
        
        return correlations[:10]  # Return top 10 correlations
    
    def _categorize_correlation_strength(self, abs_correlation: float) -> str:
        if abs_correlation >= 0.8:
            return "Very Strong"
        elif abs_correlation >= 0.6:
            return "Strong"
        elif abs_correlation >= 0.4:
            return "Moderate"
        elif abs_correlation >= 0.2:
            return "Weak"
        else:
            return "Very Weak"
    
    def _calculate_summary_stats(self, df: pd.DataFrame) -> Dict[str, Any]:
        returns = df.pct_change().dropna()
        
        return {
            "period_start": df.index.min().strftime('%Y-%m-%d') if not df.empty else None,
            "period_end": df.index.max().strftime('%Y-%m-%d') if not df.empty else None,
            "trading_days": len(df),
            "average_daily_return": float(returns.mean().mean()),
            "average_volatility": float(df.std().mean()),
            "max_correlation": float(df.corr().values[np.triu_indices_from(df.corr().values, k=1)].max()) if len(df.columns) > 1 else None,
            "min_correlation": float(df.corr().values[np.triu_indices_from(df.corr().values, k=1)].min()) if len(df.columns) > 1 else None
        }
    
    def calculate_rolling_correlation(self, stock_data: Dict[str, List[Dict]], symbol1: str, symbol2: str, window: int = 30) -> List[Dict]:
        try:
            df = self._prepare_dataframe(stock_data)
            
            if symbol1 not in df.columns or symbol2 not in df.columns:
                return []
            
            rolling_corr = df[symbol1].rolling(window=window).corr(df[symbol2])
            
            result = []
            for date, corr in rolling_corr.dropna().items():
                result.append({
                    'date': date.strftime('%Y-%m-%d'),
                    'correlation': float(corr)
                })
            
            return result
            
        except Exception as e:
            logger.error(f"Error calculating rolling correlation: {e}")
            return []