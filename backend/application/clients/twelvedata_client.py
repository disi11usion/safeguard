import os
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta, timezone
import httpx
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class TwelveDataClient:
    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Twelve Data API client
        """
        self.api_key = api_key or os.getenv("TWELVE_DATA_API_KEY")
        self.base_url = "https://api.twelvedata.com"
        
        if not self.api_key:
            raise ValueError("Twelve Data API key is required. Set TWELVE_DATA_API_KEY environment variable.")
        
        print(f"✅ Twelve Data API client initialized with API key: {self.api_key[:8]}...")
    
    async def get_time_series(
        self,
        symbol: str,
        interval: str = "5min",
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        country: str = "US",
        timeout: int = 30
    ) -> Dict[str, Any]:
        """
        Get time series data for a symbol
        """
        url = f"{self.base_url}/time_series"
        
        # Set default dates if not provided (last 24 hours)
        if not end_date:
            end_time = datetime.now(timezone.utc)
            end_date = end_time.strftime("%Y-%m-%d %H:%M:%S")
        
        if not start_date:
            end_time = datetime.now(timezone.utc)
            start_time = end_time - timedelta(days=1)
            start_date = start_time.strftime("%Y-%m-%d %H:%M:%S")
        
        params = {
            "apikey": self.api_key,
            "symbol": symbol,
            "interval": interval,
            "start_date": start_date,
            "end_date": end_date,
            "country": country
        }
        
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                print(f"📊 Fetching Twelve Data time series for {symbol}...")
                print(f"   URL: {url}")
                print(f"   Params: {params}")
                
                response = await client.get(url, params=params)
                response.raise_for_status()
                
                data = response.json()
                
                # Check for API errors
                if "status" in data and data["status"] == "error":
                    error_msg = data.get("message", "Unknown error")
                    print(f"❌ Twelve Data API error for {symbol}: {error_msg}")
                    return {
                        "status": "error",
                        "message": error_msg,
                        "symbol": symbol
                    }
                
                # Check if we have values
                if "values" in data and len(data["values"]) > 0:
                    print(f"✅ Successfully fetched {len(data['values'])} data points for {symbol}")
                else:
                    print(f"⚠️  No values returned for {symbol}")
                
                return data
        
        except httpx.TimeoutException:
            error_msg = f"Timeout fetching data for {symbol}"
            print(f"⏱️  {error_msg}")
            return {
                "status": "error",
                "message": error_msg,
                "symbol": symbol
            }
        
        except httpx.HTTPStatusError as e:
            error_msg = f"HTTP {e.response.status_code} error for {symbol}"
            print(f"❌ {error_msg}")
            return {
                "status": "error",
                "message": error_msg,
                "symbol": symbol
            }
        
        except Exception as e:
            error_msg = f"Unexpected error for {symbol}: {str(e)}"
            print(f"❌ {error_msg}")
            return {
                "status": "error",
                "message": error_msg,
                "symbol": symbol
            }
    
    def calculate_metrics_from_time_series(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculate price metrics from time series data
        """
        if not data or "values" not in data or len(data["values"]) == 0:
            return {
                "price": 0,
                "open": 0,
                "close": 0,
                "high": 0,
                "low": 0,
                "change": 0,
                "percent_change_24h": 0,
                "status": "No Data"
            }
        
        try:
            values = data["values"]
            
            # Latest data point (most recent)
            latest = values[0]
            # Oldest data point (24h ago)
            oldest = values[-1]
            
            # Extract OHLC values
            close_price = float(latest.get("close", 0))
            open_price = float(oldest.get("open", 0))
            
            # Calculate high/low across all data points
            high_price = max([float(v.get("high", 0)) for v in values])
            low_price = min([float(v.get("low", 0)) for v in values])
            
            # Calculate 24h change
            change = close_price - open_price
            percent_change_24h = ((close_price - open_price) / open_price * 100) if open_price > 0 else 0
            
            return {
                "price": round(close_price, 2),
                "open": round(open_price, 2),
                "close": round(close_price, 2),
                "high": round(high_price, 2),
                "low": round(low_price, 2),
                "change": round(change, 2),
                "percent_change_24h": round(percent_change_24h, 2),
                "status": "Live Data"
            }
        
        except Exception as e:
            print(f"❌ Error calculating metrics: {str(e)}")
            return {
                "price": 0,
                "open": 0,
                "close": 0,
                "high": 0,
                "low": 0,
                "change": 0,
                "percent_change_24h": 0,
                "status": "Calculation Error"
            }
    
    async def get_futures_data(self, symbol: str, interval: str = "5min") -> Dict[str, Any]:
        """
        Get futures/commodity data with calculated metrics
        Uses fallback strategy: tries 5min first, then 1h, then 1day if no data available
        """
        # Try multiple intervals with different time ranges to find available data
        fallback_strategies = [
            {"interval": "5min", "days": 1, "description": "5-minute data (last 24h)"},
            {"interval": "1h", "days": 7, "description": "1-hour data (last 7 days)"},
            {"interval": "1day", "days": 30, "description": "daily data (last 30 days)"},
        ]
        
        for strategy in fallback_strategies:
            print(f"🔄 Trying {strategy['description']} for {symbol}...")
            
            # Calculate time range
            end_time = datetime.now(timezone.utc)
            start_time = end_time - timedelta(days=strategy["days"])
            start_date = start_time.strftime("%Y-%m-%d %H:%M:%S")
            end_date = end_time.strftime("%Y-%m-%d %H:%M:%S")
            
            # Get time series data with this strategy
            time_series_data = await self.get_time_series(
                symbol, 
                interval=strategy["interval"],
                start_date=start_date,
                end_date=end_date
            )
            
            # Check if we got valid data
            if time_series_data.get("status") != "error" and "values" in time_series_data and len(time_series_data["values"]) > 0:
                print(f"✅ Successfully fetched {len(time_series_data['values'])} data points using {strategy['description']}")
                
                # Calculate metrics
                metrics = self.calculate_metrics_from_time_series(time_series_data)
                
                return {
                    "symbol": symbol,
                    **metrics,
                    "data_interval": strategy["interval"],
                    "data_period": f"last {strategy['days']} days",
                    "raw_data": time_series_data
                }
            else:
                print(f"⚠️  No data available with {strategy['description']}, trying next strategy...")
        
        # All strategies failed
        print(f"❌ All fallback strategies failed for {symbol}")
        return {
            "symbol": symbol,
            "price": 0,
            "open": 0,
            "close": 0,
            "high": 0,
            "low": 0,
            "change": 0,
            "percent_change_24h": 0,
            "status": "No Data Available",
            "raw_data": None
        }
    
    async def process_futures_list(self, futures_list: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Process a list of futures contracts and fetch data for the first one only
        """
        transformed_data = []
        
        for idx, future in enumerate(futures_list, 1):
            symbol = future.get("symbol")
            name = future.get("name")
            category = future.get("category", "")
            
            # Only fetch real data for the first ticker
            if idx == 1:
                try:
                    print(f"🔍 Fetching live data for futures symbol: {symbol}")
                    
                    # Use get_futures_data to fetch data with fallback strategy
                    futures_data_result = await self.get_futures_data(symbol, interval="5min")
                    
                    print(f"📊 Twelve Data result for {symbol}: {futures_data_result}")
                    
                    # Check if we got valid data
                    if futures_data_result.get("status") == "Live Data":
                        transformed_data.append({
                            "rank": idx,
                            "symbol": symbol,
                            "name": name,
                            "category": category,
                            "price": futures_data_result.get("price", 0),
                            "open": futures_data_result.get("open", 0),
                            "close": futures_data_result.get("close", 0),
                            "high": futures_data_result.get("high", 0),
                            "low": futures_data_result.get("low", 0),
                            "change": futures_data_result.get("change", 0),
                            "percent_change_24h": futures_data_result.get("percent_change_24h", 0),
                            "tech_rating": "Live Data"
                        })
                        print(f"✅ Successfully added live data for {symbol}")
                    else:
                        # API returned error status
                        print(f"⚠️  API returned non-live status for {symbol}: {futures_data_result.get('status')}")
                        transformed_data.append({
                            "rank": idx,
                            "symbol": symbol,
                            "name": name,
                            "category": category,
                            "price": 0,
                            "open": 0,
                            "close": 0,
                            "high": 0,
                            "low": 0,
                            "change": 0,
                            "percent_change_24h": 0,
                            "tech_rating": futures_data_result.get("status", "API Error")
                        })
                
                except Exception as api_error:
                    print(f"❌ Error fetching {symbol}: {str(api_error)}")
                    transformed_data.append({
                        "rank": idx,
                        "symbol": symbol,
                        "name": name,
                        "category": category,
                        "price": 0,
                        "open": 0,
                        "close": 0,
                        "high": 0,
                        "low": 0,
                        "change": 0,
                        "percent_change_24h": 0,
                        "tech_rating": "API Error"
                    })
            else:
                # For all other tickers, display N/A
                transformed_data.append({
                    "rank": idx,
                    "symbol": symbol,
                    "name": name,
                    "category": category,
                    "price": 0,
                    "open": 0,
                    "close": 0,
                    "high": 0,
                    "low": 0,
                    "change": 0,
                    "percent_change_24h": 0,
                    "tech_rating": "API Limited"
                })
        
        return transformed_data
