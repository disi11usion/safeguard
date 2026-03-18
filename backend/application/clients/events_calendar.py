import os
import aiohttp
from typing import Dict, Any, List, Optional
from datetime import datetime
import csv
from io import StringIO


class AlphaVantageEventsClient:
    def __init__(self):
        self.api_key = os.getenv("ALPHAVANTAGE_API_KEY")
        self.base_url = "https://www.alphavantage.co/query"
        
        if not self.api_key:
            raise ValueError("ALPHAVANTAGE_API_KEY environment variable not set")
    
    async def get_earnings_calendar(
        self,
        symbol: Optional[str] = None,
        horizon: str = "3month"
    ) -> Dict[str, Any]:
        try:
            params = {
                "function": "EARNINGS_CALENDAR",
                "horizon": horizon,
                "apikey": self.api_key
            }
            
            if symbol:
                params["symbol"] = symbol
            
            async with aiohttp.ClientSession() as session:
                async with session.get(self.base_url, params=params) as response:
                    # AlphaVantage returns CSV for earnings calendar
                    text_data = await response.text()
                    
                    # Parse CSV data
                    events = []
                    csv_reader = csv.DictReader(StringIO(text_data))
                    
                    for row in csv_reader:
                        events.append({
                            "symbol": row.get("symbol"),
                            "name": row.get("name"),
                            "report_date": row.get("reportDate"),
                            "fiscal_date_ending": row.get("fiscalDateEnding"),
                            "estimate": row.get("estimate"),
                            "currency": row.get("currency")
                        })
                    
                    return {
                        "success": True,
                        "function": "EARNINGS_CALENDAR",
                        "horizon": horizon,
                        "symbol": symbol,
                        "events": events,
                        "count": len(events)
                    }
                    
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "events": []
            }
    
    async def get_economic_indicators(
        self,
        function: str,
        interval: Optional[str] = None,
        maturity: Optional[str] = None
    ) -> Dict[str, Any]:
        try:
            params = {
                "function": function,
                "apikey": self.api_key
            }
            
            if interval:
                params["interval"] = interval
            
            if maturity:
                params["maturity"] = maturity
            
            async with aiohttp.ClientSession() as session:
                async with session.get(self.base_url, params=params) as response:
                    data = await response.json()
                    
                    # Return raw data from AlphaVantage
                    return {
                        "success": True,
                        "function": function,
                        "data": data
                    }
                    
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "data": None
            }
    
    async def get_news_sentiment(
        self,
        tickers: Optional[str] = None,
        topics: Optional[str] = None,
        time_from: Optional[str] = None,
        time_to: Optional[str] = None,
        sort: str = "LATEST",
        limit: int = 50
    ) -> Dict[str, Any]:
        try:
            params = {
                "function": "NEWS_SENTIMENT",
                "apikey": self.api_key,
                "sort": sort,
                "limit": limit
            }
            
            if tickers:
                params["tickers"] = tickers
            
            if topics:
                params["topics"] = topics
            
            if time_from:
                params["time_from"] = time_from
            
            if time_to:
                params["time_to"] = time_to
            
            async with aiohttp.ClientSession() as session:
                async with session.get(self.base_url, params=params) as response:
                    data = await response.json()
                    
                    # Extract and format news items
                    if "feed" in data:
                        news_items = []
                        for item in data["feed"]:
                            # Get ticker sentiments
                            ticker_sentiments = []
                            if "ticker_sentiment" in item:
                                for ts in item["ticker_sentiment"]:
                                    ticker_sentiments.append({
                                        "ticker": ts.get("ticker"),
                                        "relevance_score": ts.get("relevance_score"),
                                        "sentiment_score": ts.get("ticker_sentiment_score"),
                                        "sentiment_label": ts.get("ticker_sentiment_label")
                                    })
                            
                            news_items.append({
                                "title": item.get("title"),
                                "url": item.get("url"),
                                "time_published": item.get("time_published"),
                                "authors": item.get("authors", []),
                                "summary": item.get("summary"),
                                "source": item.get("source"),
                                "category": item.get("category_within_source"),
                                "overall_sentiment_score": item.get("overall_sentiment_score"),
                                "overall_sentiment_label": item.get("overall_sentiment_label"),
                                "ticker_sentiments": ticker_sentiments
                            })
                        
                        return {
                            "success": True,
                            "function": "NEWS_SENTIMENT",
                            "items": news_items,
                            "count": len(news_items)
                        }
                    else:
                        return {
                            "success": False,
                            "error": data.get("Note") or data.get("Error Message", "Unknown error"),
                            "items": []
                        }
                    
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "items": []
            }
    
    async def get_company_overview(
        self,
        symbol: str
    ) -> Dict[str, Any]:
        try:
            params = {
                "function": "OVERVIEW",
                "symbol": symbol,
                "apikey": self.api_key
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(self.base_url, params=params) as response:
                    data = await response.json()
                    
                    if "Symbol" in data:
                        return {
                            "success": True,
                            "data": data
                        }
                    else:
                        return {
                            "success": False,
                            "error": data.get("Note") or data.get("Error Message", "Unknown error"),
                            "data": None
                        }
                    
        except Exception as e:
            return {
                "success": False,
                "error": str(e),
                "data": None
            }
