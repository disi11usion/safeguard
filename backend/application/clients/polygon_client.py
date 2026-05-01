import os
import asyncio
from typing import List, Dict, Any, Optional
from datetime import datetime, timedelta
import aiohttp
import json
import numpy as np
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

class PolygonClient:
    def __init__(self, api_key: Optional[str] = None):
        # Load environment variables from .env file if not already loaded
        load_dotenv()
        
        self.api_key = api_key or os.getenv('POLYGON_API_KEY')
        # Polygon has been rebranded to Massive
        self.base_url = "https://api.massive.com"
        
        # Check if using mock data mode
        self.using_mock_data = os.getenv('USING_MOCK_DATA', 'FALSE').upper() == 'TRUE'
        self.mock_data_dir = Path(__file__).parent.parent.parent / "_lib"
        
        if self.using_mock_data:
            print(f"⚠️  MOCK DATA MODE ENABLED")
            print(f"📁 Mock data directory: {self.mock_data_dir}")
        elif not self.api_key:
            print("Warning: No API key found. Checked:")
            print("1. Parameter passed to constructor")
            print("2. POLYGON_API_KEY environment variable")
            print("3. .env file in current directory")
            raise ValueError("Polygon API key is required. Set POLYGON_API_KEY environment variable or in .env file.")
        else:
            print(f"✅ Massive API client initialized with API key: {self.api_key[:8]}...")
    
    async def get_historical_data(self, symbols: List[str], start_date: str, end_date: str, timespan: str = "day", format_for_charts: bool = True) -> Dict[str, List[Dict]]:
        async with aiohttp.ClientSession() as session:
            tasks = []
            for symbol in symbols:
                task = self._fetch_single_symbol_data(session, symbol, start_date, end_date, timespan, format_for_charts)
                tasks.append(task)
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            data = {}
            for i, result in enumerate(results):
                if isinstance(result, Exception):
                    print(f"Error fetching data for {symbols[i]}: {result}")
                    data[symbols[i]] = []
                else:
                    data[symbols[i]] = result
            
            return data
    
    async def get_single_stock_data(self, symbol: str, start_date: str, end_date: str) -> List[Dict]:
        async with aiohttp.ClientSession() as session:
            return await self._fetch_single_symbol_data(session, symbol, start_date, end_date)
    
    async def _fetch_single_symbol_data(self, session: aiohttp.ClientSession, symbol: str, start_date: str, end_date: str, timespan: str = "day", format_for_charts: bool = True) -> List[Dict]:
        url = f"{self.base_url}/v2/aggs/ticker/{symbol}/range/1/{timespan}/{start_date}/{end_date}"
        params = {
            "apikey": self.api_key,
            "adjusted": "true",
            "sort": "asc"
        }
        
        try:
            async with session.get(url, params=params) as response:
                print(f"Fetching {symbol}: {url}")
                print(f"Response status for {symbol}: {response.status}")
                
                if response.status == 200:
                    data = await response.json()
                    print(f"API response for {symbol}: {data}")
                    results = data.get('results', [])
                    
                    if not results:
                        print(f"No results found for {symbol} in response: {data}")
                        return []
                    
                    if format_for_charts:
                        # Return raw Polygon data format for frontend charts
                        print(f"Processed {len(results)} data points for {symbol} (chart format)")
                        return results
                    else:
                        # Transform data for correlation analysis
                        processed_data = []
                        for item in results:
                            processed_data.append({
                                'date': datetime.fromtimestamp(item['t'] / 1000).strftime('%Y-%m-%d'),
                                'open': item['o'],
                                'high': item['h'],
                                'low': item['l'],
                                'close': item['c'],
                                'volume': item['v'],
                                'timestamp': item['t']
                            })
                        
                        print(f"Processed {len(processed_data)} data points for {symbol} (correlation format)")
                        return processed_data
                else:
                    error_text = await response.text()
                    print(f"Error fetching data for {symbol}: HTTP {response.status}, Response: {error_text}")
                    return []
        
        except Exception as e:
            print(f"Exception fetching data for {symbol}: {e}")
            return []
    
    async def get_real_time_price(self, symbol: str) -> Optional[Dict]:
        url = f"{self.base_url}/v2/last/trade/{symbol}"
        params = {"apikey": self.api_key}
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get('results', {})
                    else:
                        print(f"Error fetching real-time price for {symbol}: HTTP {response.status}")
                        return None
        except Exception as e:
            print(f"Exception fetching real-time price for {symbol}: {e}")
            return None
    
    async def get_market_list(self, market: str, limit: int = 50, timeout: int = 20) -> List[Dict]:
        url = f"{self.base_url}/v3/reference/tickers"
        params = {
            "market": market,
            "active": "true",
            "order": "asc",
            "limit": limit,
            "sort": "ticker",
            "apiKey": self.api_key
        }
        
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        return data.get('results', [])
                    else:
                        print(f"Error fetching {market} list: HTTP {response.status}")
                        return []
        
        except asyncio.TimeoutError:
            print(f"Timeout fetching {market} list")
            return []
        
        except Exception as e:
            print(f"Exception fetching {market} list: {e}")
            return []
    
    async def get_previous_close(self, ticker: str) -> Optional[Dict]:
        """
        Get previous day's OHLCV data for a ticker
        Supports crypto (X:), forex (C:), and stock tickers
        """
        url = f"{self.base_url}/v2/aggs/ticker/{ticker}/prev"
        params = {
            "adjusted": "true",
            "apiKey": self.api_key
        }
        
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=10)) as session:
                async with session.get(url, params=params) as response:
                    if response.status == 200:
                        data = await response.json()
                        results = data.get('results', [])
                        
                        if results and len(results) > 0:
                            return results[0]
                        else:
                            print(f"No results for {ticker}")
                            return None
                    else:
                        print(f"Error fetching previous close for {ticker}: HTTP {response.status}")
                        return None
        
        except Exception as e:
            print(f"Exception fetching previous close for {ticker}: {e}")
            return None
    
    def calculate_metrics(self, data: Dict) -> Dict:
        """
        Calculate VWAP, Volume, 24h Change, Open/Close, High/Low from previous close data
        """
        if not data:
            return {
                "vwap": "N/A",
                "volume": "N/A",
                "change_24h": "N/A",
                "change_percent": "N/A",
                "open": "N/A",
                "close": "N/A",
                "high": "N/A",
                "low": "N/A"
            }
        
        try:
            open_price = data.get('o', 0)
            close_price = data.get('c', 0)
            high_price = data.get('h', 0)
            low_price = data.get('l', 0)
            volume = data.get('v', 0)
            vwap = data.get('vw', 0)
            
            # Calculate 24h change
            change_24h = close_price - open_price
            change_percent = (change_24h / open_price * 100) if open_price > 0 else 0
            
            return {
                "vwap": round(vwap, 2) if vwap > 0 else "N/A",
                "volume": f"{volume:,.0f}" if volume > 0 else "N/A",
                "change_24h": round(change_24h, 2) if change_24h != 0 else "N/A",
                "change_percent": f"{change_percent:.2f}%" if change_percent != 0 else "N/A",
                "open": round(open_price, 2) if open_price > 0 else "N/A",
                "close": round(close_price, 2) if close_price > 0 else "N/A",
                "high": round(high_price, 2) if high_price > 0 else "N/A",
                "low": round(low_price, 2) if low_price > 0 else "N/A"
            }
        
        except Exception as e:
            print(f"Error calculating metrics: {e}")
            return {
                "vwap": "N/A",
                "volume": "N/A",
                "change_24h": "N/A",
                "change_percent": "N/A",
                "open": "N/A",
                "close": "N/A",
                "high": "N/A",
                "low": "N/A"
            }
    
    async def get_comprehensive_market_data(self, market: str, limit: int = 50) -> Dict:
        """
        Get comprehensive market data with real-time price data
        In mock mode: loads from mock_comprehensive_{market}.json files
        In normal mode: fetches data from API (only first ticker gets real data)
        """
        # Mock mode handling - load from JSON file
        if self.using_mock_data:
            print(f"🎭 Mock mode: Loading comprehensive {market} data from JSON")
            
            # Load mock comprehensive data file
            mock_file = self.mock_data_dir / f"mock_comprehensive_{market}.json"
            
            try:
                with open(mock_file, 'r', encoding='utf-8') as f:
                    mock_data = json.load(f)
                return mock_data
            
            except Exception as e:
                return {
                    "success": False,
                    "market": market,
                    "count": 0,
                    "data": [],
                    "error": f"Failed to load mock data: {str(e)}"
                }
        
        # Normal mode: Get list of tickers
        ticker_list = await self.get_market_list(market, limit=limit)
        
        if not ticker_list:
            return {
                "success": False,
                "market": market,
                "count": 0,
                "data": [],
                "error": "Failed to fetch market list"
            }
        
        transformed_data = []
        
        # Process each ticker
        for idx, item in enumerate(ticker_list, 1):
            ticker = item.get("ticker", "")
            name_field = item.get("name", ticker) or ticker
            name = name_field.split('.')[0] if '.' in name_field else name_field
            
            # Only fetch real data for the first ticker
            if idx == 1:
                prev_close_data = await self.get_previous_close(ticker)
                
                if prev_close_data:
                    metrics = self.calculate_metrics(prev_close_data)
                    
                    transformed_data.append({
                        "rank": idx,
                        "symbol": ticker,
                        "name": name,
                        "vwap": metrics["vwap"],
                        "volume": metrics["volume"],
                        "change_24h": metrics["change_24h"],
                        "change_percent": metrics["change_percent"],
                        "open": metrics["open"],
                        "close": metrics["close"],
                        "high": metrics["high"],
                        "low": metrics["low"]
                    })
                else:
                    # First ticker but no data available
                    transformed_data.append({
                        "rank": idx,
                        "symbol": ticker,
                        "name": name,
                        "vwap": "N/A",
                        "volume": "N/A",
                        "change_24h": "N/A",
                        "change_percent": "N/A",
                        "open": "N/A",
                        "close": "N/A",
                        "high": "N/A",
                        "low": "N/A"
                    })
            else:
                # For all other tickers, display N/A
                transformed_data.append({
                    "rank": idx,
                    "symbol": ticker,
                    "name": name,
                    "vwap": "N/A",
                    "volume": "N/A",
                    "change_24h": "N/A",
                    "change_percent": "N/A",
                    "open": "N/A",
                    "close": "N/A",
                    "high": "N/A",
                    "low": "N/A"
                })
        
        return {
            "success": True,
            "market": market,
            "count": len(transformed_data),
            "data": transformed_data
        }
    
    def _format_ticker_with_prefix(self, ticker: str, market: str) -> str:
        if market == "forex":
            ticker = ticker.replace("/", "")
            return f"C:{ticker}" if not ticker.startswith("C:") else ticker
        
        if market == "crypto":
            ticker = ticker[2:] if ticker.startswith("X:") else ticker
            ticker = ticker if ticker.endswith("USD") else f"{ticker}USD"
            return f"X:{ticker}"
        
        return ticker
    
    def _create_error_response(self, ticker: str, market: str, error: str) -> Dict[str, Any]:
        return {"success": False, "ticker": ticker, "market": market, "error": error, "data": []}
    
    def _load_mock_data(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Load mock historical data from JSON file"""
        try:
            mock_file = self.mock_data_dir / f"mock_historical_data_{ticker}.json"
            
            if not mock_file.exists():
                return None
            
            with open(mock_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
            
            return data
            
        except Exception as e:
            return None
    
    async def get_unified_historical_data(
        self, 
        ticker: str, 
        start_date: str, 
        end_date: str, 
        market: str,
        timespan: str = "day"
    ) -> Dict[str, Any]:
        # If using mock data, randomly select from mock historical data files
        if self.using_mock_data:
            print(f"🎭 Mock mode: Loading random historical data for {market} ticker '{ticker}'")
            
            # Randomly select one of the 50 mock data files (0-49)
            import random
            random_index = random.randint(0, 49)
            mock_data = self._load_mock_data(str(random_index))
            
            if mock_data:
                return mock_data
            else:
                return self._create_error_response(
                    ticker, 
                    market, 
                    f"Failed to load mock data file: mock_historical_data_{random_index}.json"
                )
        
        # Normal API flow
        formatted_ticker = self._format_ticker_with_prefix(ticker, market)
        url = f"{self.base_url}/v2/aggs/ticker/{formatted_ticker}/range/1/{timespan}/{start_date}/{end_date}"
        params = {"apiKey": self.api_key, "adjusted": "true", "sort": "asc", "limit": 5000}
        
        try:
            async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=30)) as session:
                async with session.get(url, params=params) as response:
                    if response.status != 200:
                        return self._create_error_response(ticker, market, f"API error: HTTP {response.status}")
                    
                    data = await response.json()
                    results = data.get('results', [])
                    
                    if not results:
                        return self._create_error_response(ticker, market, "No data available for the specified date range")
                    
                    transformed_data = [
                        {
                            "timestamp": item.get('t'),
                            "open": item.get('o'),
                            "high": item.get('h'),
                            "low": item.get('l'),
                            "close": item.get('c'),
                            "volume": item.get('v'),
                            "vwap": item.get('vw'),
                            "transactions": item.get('n', 0)
                        }
                        for item in results
                    ]
                    
                    return {
                        "success": True,
                        "ticker": ticker,
                        "market": market,
                        "count": len(transformed_data),
                        "data": transformed_data
                    }
        
        except asyncio.TimeoutError:
            return self._create_error_response(ticker, market, "Request timeout")
        except Exception as e:
            return self._create_error_response(ticker, market, str(e))
    
    def calculate_sma(self, prices: List[float], period: int = 20) -> Optional[float]:
        return round(np.mean(prices[-period:]), 4) if len(prices) >= period else None
    
    def calculate_ema(self, prices: List[float], period: int = 12) -> Optional[float]:
        if len(prices) < period:
            return None
        
        multiplier = 2 / (period + 1)
        ema = prices[0]
        for price in prices[1:]:
            ema = (price * multiplier) + (ema * (1 - multiplier))
        
        return round(ema, 4)
    
    def calculate_macd(self, prices: List[float]) -> Optional[Dict[str, float]]:
        if len(prices) < 26:
            return None
        
        def _calc_ema(data: List[float], period: int) -> float:
            multiplier = 2 / (period + 1)
            ema = data[0]
            for price in data[1:]:
                ema = (price * multiplier) + (ema * (1 - multiplier))
            return ema
        
        ema_12 = _calc_ema(prices, 12)
        ema_26 = _calc_ema(prices, 26)
        macd_line = round(ema_12 - ema_26, 4)
        
        return {
            "macd": macd_line,
            "signal": round(macd_line * 0.9, 4),
            "histogram": round(macd_line * 0.1, 4)
        }
    
    def calculate_rsi(self, prices: List[float], period: int = 14) -> Optional[float]:
        if len(prices) < period + 1:
            return None
        
        deltas = np.diff(prices)
        gains = np.where(deltas > 0, deltas, 0)
        losses = np.where(deltas < 0, -deltas, 0)
        
        avg_gain = np.mean(gains[-period:])
        avg_loss = np.mean(losses[-period:])
        
        if avg_loss == 0:
            return 100.0
        
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        
        return round(rsi, 2)
    
    async def get_market_summary_with_indicators(
        self, 
        ticker: str, 
        market: str,
        days: int = 12
    ) -> Dict[str, Any]:
        end_date = datetime.now().strftime('%Y-%m-%d')
        start_date = (datetime.now() - timedelta(days=max(days + 20, 35))).strftime('%Y-%m-%d')
        
        historical_data = await self.get_unified_historical_data(
            ticker=ticker,
            start_date=start_date,
            end_date=end_date,
            market=market,
            timespan="day"
        )
        
        if not historical_data.get('success') or not historical_data.get('data'):
            return {"success": False, "ticker": ticker, "market": market, "error": "Failed to fetch historical data"}
        
        data_points = historical_data['data']
        
        if len(data_points) < 2:
            return {"success": False, "ticker": ticker, "market": market, "error": "Insufficient data points"}
        
        closes = [float(d['close']) for d in data_points]
        latest = data_points[-1]
        previous = data_points[-2] if len(data_points) > 1 else data_points[-1]
        first = data_points[0] if len(data_points) >= days else data_points[0]
        
        close_now = float(latest['close'])
        close_prev = float(previous['close'])
        close_first = float(first['close'])
        
        change_24h = close_now - close_prev
        change_24h_percent = (change_24h / close_prev * 100) if close_prev > 0 else 0
        change_period = close_now - close_first
        change_period_percent = (change_period / close_first * 100) if close_first > 0 else 0
        
        macd_data = self.calculate_macd(closes)
        
        return {
            "success": True,
            "ticker": ticker,
            "market": market,
            "current_price": round(close_now, 2),
            "high_24h": round(float(latest['high']), 2),
            "low_24h": round(float(latest['low']), 2),
            "volume_24h": round(float(latest['volume']), 2),
            "change_24h": round(change_24h, 2),
            "change_24h_percent": round(change_24h_percent, 2),
            "change_period": round(change_period, 2),
            "change_period_percent": round(change_period_percent, 2),
            "period_days": days,
            "indicators": {
                "sma": self.calculate_sma(closes, period=min(20, len(closes))),
                "ema": self.calculate_ema(closes, period=min(12, len(closes))),
                "macd": macd_data.get('macd') if macd_data else None,
                "rsi": self.calculate_rsi(closes, period=min(14, len(closes)))
            },
            "data_points": len(data_points)
        }
        
