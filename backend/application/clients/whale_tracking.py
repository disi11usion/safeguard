import os
import aiohttp
from typing import Dict, Any, List, Optional
from datetime import datetime
import yfinance as yf
import pandas as pd


class EtherscanClient:
    def __init__(self):
        self.api_key = os.getenv("ETHERSCAN_API_KEY")
        self.base_url = "https://api.etherscan.io/v2/api"
        
        if not self.api_key:
            raise ValueError("ETHERSCAN_API_KEY environment variable not set")
    
    async def get_wallet_transactions(
        self,
        address: str,
        startblock: int = 0,
        endblock: int = 99999999,
        page: int = 1,
        offset: int = 100,
        sort: str = "desc"
    ) -> Dict[str, Any]:
        try:
            params = {
                "chainid": 1,
                "module": "account",
                "action": "txlist",
                "address": address,
                "startblock": startblock,
                "endblock": endblock,
                "page": page,
                "offset": offset,
                "sort": sort,
                "apikey": self.api_key
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(self.base_url, params=params) as response:
                    data = await response.json()
                    
                    # Transform data to standardized format
                    if data.get("status") == "1" and data.get("result"):
                        transactions = []
                        for tx in data["result"]:
                            transactions.append({
                                "blockchain": "ETH",
                                "timestamp": int(tx.get("timeStamp", 0)),
                                "hash": tx.get("hash"),
                                "from": tx.get("from"),
                                "to": tx.get("to"),
                                "value": float(tx.get("value", 0)) / 1e18,  # Convert from Wei to ETH
                                "fee": float(tx.get("gasPrice", 0)) * float(tx.get("gasUsed", 0)) / 1e18
                            })
                        
                        return {
                            "success": True,
                            "blockchain": "ETH",
                            "address": address,
                            "transactions": transactions,
                            "count": len(transactions)
                        }
                    else:
                        return {
                            "success": False,
                            "error": data.get("message", "Unknown error"),
                            "transactions": []
                        }
                        
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "transactions": []
            }


class BlockCypherClient:
    def __init__(self):
        self.api_key = os.getenv("BLOCKCYPHER_API_KEY")
        self.base_url = "https://api.blockcypher.com/v1/btc/main"
        
        if not self.api_key:
            raise ValueError("BLOCKCYPHER_API_KEY environment variable not set")
    
    async def get_large_transactions(
        self,
        limit: int = 50,
        min_value: int = 100000000  # 1 BTC in satoshis
    ) -> Dict[str, Any]:
        try:
            params = {
                "limit": limit,
                "minValue": min_value,
                "token": self.api_key
            }
            
            url = f"{self.base_url}/txs"
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    data = await response.json()
                    
                    # Transform data to standardized format
                    if isinstance(data, list):
                        transactions = []
                        for tx in data:
                            transactions.append({
                                "blockchain": "BTC",
                                "hash": tx.get("hash"),
                                "total": float(tx.get("total", 0)) / 1e8,  # Convert satoshis to BTC
                                "fee": float(tx.get("fees", 0)) / 1e8,
                                "timestamp": tx.get("received", ""),
                                "senders": [inp.get("addresses", []) for inp in tx.get("inputs", [])],
                                "receivers": [out.get("addresses", []) for out in tx.get("outputs", [])]
                            })
                        
                        return {
                            "success": True,
                            "blockchain": "BTC",
                            "transactions": transactions,
                            "count": len(transactions)
                        }
                    else:
                        return {
                            "success": False,
                            "error": data.get("error", "Unknown error"),
                            "transactions": []
                        }
                        
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "transactions": []
            }


class StockWhaleClient:
    def __init__(self):
        # Use the whale-specific API key or fall back to main one
        self.api_key = os.getenv("POLYGON_WHALE_API_KEY") or os.getenv("POLYGON_API_KEY")
        self.base_url = "https://api.polygon.io/v2/aggs/ticker"
        
        if not self.api_key:
            raise ValueError("POLYGON_API_KEY environment variable not set")
    
    async def get_large_trades(
        self,
        ticker: str,
        date_from: str,
        date_to: str,
        multiplier: int = 1,
        timespan: str = "minute"
    ) -> Dict[str, Any]:
        try:
            url = f"{self.base_url}/{ticker}/range/{multiplier}/{timespan}/{date_from}/{date_to}"
            params = {"apiKey": self.api_key}
            
            async with aiohttp.ClientSession() as session:
                async with session.get(url, params=params) as response:
                    data = await response.json()
                    
                    if data.get("status") == "OK" and data.get("results"):
                        results = []
                        for bar in data["results"]:
                            results.append({
                                "ticker": ticker,
                                "timestamp": bar.get("t"),
                                "value": bar.get("c"),  # Close price
                                "volume": bar.get("v"),
                                "open": bar.get("o"),
                                "high": bar.get("h"),
                                "low": bar.get("l")
                            })
                        
                        return {
                            "success": True,
                            "blockchain": "STOCK",
                            "ticker": ticker,
                            "data": results,
                            "count": len(results)
                        }
                    else:
                        return {
                            "success": False,
                            "error": data.get("error", "No data available"),
                            "data": []
                        }
                        
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "data": []
            }


class YFinanceClient:
    def __init__(self):
        # yfinance doesn't require an API key
        pass
    
    async def get_market_data(
        self,
        ticker: str,
        start: str,
        end: str,
        interval: str = "1d"
    ) -> Dict[str, Any]:
        try:
            # Download data using yfinance
            stock = yf.Ticker(ticker)
            df = stock.history(start=start, end=end, interval=interval)
            
            if not df.empty:
                # Convert DataFrame to list of dicts
                results = []
                for index, row in df.iterrows():
                    results.append({
                        "ticker": ticker,
                        "timestamp": int(index.timestamp() * 1000),  # Convert to milliseconds
                        "date": index.strftime("%Y-%m-%d"),
                        "open": float(row["Open"]),
                        "close": float(row["Close"]),
                        "high": float(row["High"]),
                        "low": float(row["Low"]),
                        "volume": int(row["Volume"])
                    })
                
                return {
                    "success": True,
                    "ticker": ticker,
                    "data": results,
                    "count": len(results)
                }
            else:
                return {
                    "success": False,
                    "error": "No data available for this ticker",
                    "data": []
                }
                
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "data": []
            }
