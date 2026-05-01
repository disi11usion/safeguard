import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse

import aiohttp
import psycopg2
from psycopg2.extras import RealDictCursor

from application.clients.social_sentiment import _score_text


from database.db_pool import get_conn, release_conn

class NewsSentimentClient:
    LOCAL_FALLBACK_WINDOW_DAYS = 180
    LOCAL_FALLBACK_MAX_ITEMS = 300

    def __init__(self):
        self.alphavantage_key = os.getenv("ALPHAVANTAGE_API_KEY")
        self.alphavantage_url = "https://www.alphavantage.co/query"
        if not self.alphavantage_key:
            # Allow service to start even if key is missing.
            # Endpoints will return a clear error instead of crashing the app.
            self.alphavantage_key = None

    @staticmethod
    def _parse_request_time(value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        for fmt in ("%Y%m%dT%H%M%S", "%Y%m%dT%H%M"):
            try:
                return datetime.strptime(value, fmt).replace(tzinfo=timezone.utc)
            except ValueError:
                continue
        try:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
        except ValueError:
            return None

    @staticmethod
    def _normalize_tickers(tickers: Optional[str]) -> List[str]:
        normalized: List[str] = []
        if not tickers:
            return normalized
        for raw in tickers.split(","):
            ticker = raw.strip().upper()
            if not ticker:
                continue
            for prefix in ("CRYPTO:", "FOREX:"):
                if ticker.startswith(prefix):
                    ticker = ticker.replace(prefix, "", 1)
            if ticker:
                normalized.append(ticker)
        return normalized

    @staticmethod
    def _split_coin_symbols(coins: Optional[str]) -> List[str]:
        if not coins:
            return []
        symbols = []
        for part in str(coins).split(","):
            symbol = part.strip().upper()
            if symbol:
                symbols.append(symbol)
        return symbols

    @classmethod
    def _classify_local_sentiment_label(cls, score: float) -> str:
        if score >= 0.35:
            return "Bullish"
        if score >= 0.15:
            return "Somewhat Bullish"
        if score <= -0.35:
            return "Bearish"
        if score <= -0.15:
            return "Somewhat Bearish"
        return "Neutral"

    @classmethod
    def _format_local_ticker(cls, symbol: str, market: Optional[str]) -> str:
        if market == "crypto":
            return f"CRYPTO:{symbol}"
        if market == "forex":
            return f"FOREX:{symbol}"
        return symbol

    @classmethod
    def _match_symbols(
        cls,
        requested_tickers: List[str],
        coins: Optional[str],
        title: Optional[str],
        summary: Optional[str],
    ) -> List[str]:
        available = set(cls._split_coin_symbols(coins))
        haystack = f"{title or ''} {summary or ''}".upper()

        if requested_tickers:
            matches = []
            for ticker in requested_tickers:
                if ticker in available or ticker in haystack:
                    matches.append(ticker)
            return matches

        parsed = list(available)
        if parsed:
            return parsed[:8]
        return []

    def _get_local_news_sentiment(
        self,
        tickers: Optional[str] = None,
        topics: Optional[str] = None,
        time_from: Optional[str] = None,
        time_to: Optional[str] = None,
        sort: str = "LATEST",
        limit: int = 50,
        market: Optional[str] = None,
        fallback_reason: Optional[str] = None,
    ) -> Dict[str, Any]:
        database_url = os.getenv("DATABASE_URL")
        if not database_url:
            return {
                "success": False,
                "error": fallback_reason or "DATABASE_URL not set",
                "items": [],
            }

        requested_tickers = self._normalize_tickers(tickers)
        requested_topics = [topic.strip().upper() for topic in (topics or "").split(",") if topic.strip()]
        from_dt = self._parse_request_time(time_from)
        to_dt = self._parse_request_time(time_to)
        if not from_dt:
            from_dt = datetime.now(timezone.utc) - timedelta(days=self.LOCAL_FALLBACK_WINDOW_DAYS)

        conditions = ["cn.published_at >= %s"]
        params: List[Any] = [from_dt]

        if to_dt:
            conditions.append("cn.published_at <= %s")
            params.append(to_dt)

        if requested_tickers:
            ticker_patterns = [f"%{ticker}%" for ticker in requested_tickers]
            conditions.append(
                "("
                "EXISTS ("
                "  SELECT 1 "
                "  FROM unnest(string_to_array(COALESCE(cn.coins, ''), ',')) AS coin(symbol) "
                "  WHERE UPPER(TRIM(symbol)) = ANY(%s)"
                ") "
                "OR UPPER(COALESCE(cn.title, '')) LIKE ANY(%s) "
                "OR UPPER(COALESCE(cn.news_content, '')) LIKE ANY(%s)"
                ")"
            )
            params.extend([requested_tickers, ticker_patterns, ticker_patterns])

        if requested_topics:
            topic_patterns = [f"%{topic}%" for topic in requested_topics]
            conditions.append(
                "("
                "UPPER(COALESCE(cn.title, '')) LIKE ANY(%s) "
                "OR UPPER(COALESCE(cn.news_content, '')) LIKE ANY(%s)"
                ")"
            )
            params.extend([topic_patterns, topic_patterns])

        effective_limit = max(1, min(limit, self.LOCAL_FALLBACK_MAX_ITEMS))
        order_direction = "ASC" if str(sort).upper() == "EARLIEST" else "DESC"

        sql = f"""
            SELECT
                cn.title,
                cn.news_content,
                cn.published_at,
                cn.url,
                cn.coins,
                COALESCE(ds.name, 'Local News') AS source
            FROM clean_data.clean_news cn
            LEFT JOIN metadata.data_sources ds
                ON cn.source_id = ds.source_id
            WHERE {" AND ".join(conditions)}
            ORDER BY cn.published_at {order_direction}
            LIMIT %s
        """
        params.append(effective_limit)

        conn = None
        cursor = None
        try:
            conn = get_conn()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(sql, tuple(params))
            rows = cursor.fetchall()

            items: List[Dict[str, Any]] = []
            seen = set()
            for row in rows:
                title = row.get("title")
                summary = row.get("news_content")
                url = row.get("url")
                dedupe_key = (title, url)
                if dedupe_key in seen:
                    continue
                seen.add(dedupe_key)

                combined_text = " ".join(part for part in [title, summary] if part).strip()
                score = round(float(_score_text(combined_text)), 4) if combined_text else 0.0
                label = self._classify_local_sentiment_label(score)

                matched_symbols = self._match_symbols(
                    requested_tickers=requested_tickers,
                    coins=row.get("coins"),
                    title=title,
                    summary=summary,
                )
                if not matched_symbols and requested_tickers:
                    matched_symbols = requested_tickers

                published_at = row.get("published_at")
                if isinstance(published_at, datetime):
                    published_at = (
                        published_at.astimezone(timezone.utc)
                        if published_at.tzinfo
                        else published_at.replace(tzinfo=timezone.utc)
                    )
                    time_published = published_at.strftime("%Y%m%dT%H%M%S")
                else:
                    time_published = None

                source_domain = None
                if url:
                    parsed = urlparse(url)
                    source_domain = parsed.netloc or None

                ticker_sentiments = [
                    {
                        "ticker": self._format_local_ticker(symbol, market),
                        "relevance_score": 1.0,
                        "sentiment_score": score,
                        "sentiment_label": label,
                    }
                    for symbol in matched_symbols
                ]

                items.append({
                    "title": title,
                    "url": url,
                    "time_published": time_published,
                    "authors": [],
                    "summary": summary,
                    "banner_image": None,
                    "source": row.get("source"),
                    "category": market or "local",
                    "source_domain": source_domain,
                    "overall_sentiment_score": score,
                    "overall_sentiment_label": label,
                    "ticker_sentiments": ticker_sentiments,
                    "topics": [],
                })

            return {
                "success": True,
                "provider": "Local DB Fallback",
                "items": items,
                "count": len(items),
                "sentiment_score_definition": "Local VADER sentiment score derived from stored news title and content.",
                "fallback_reason": fallback_reason,
            }
        except Exception as e:
            return {
                "success": False,
                "error": fallback_reason or str(e),
                "items": [],
            }
        finally:
            if cursor:
                cursor.close()
            if conn:
                release_conn(conn)
    
    async def get_news_sentiment(
        self,
        tickers: Optional[str] = None,
        topics: Optional[str] = None,
        time_from: Optional[str] = None,
        time_to: Optional[str] = None,
        sort: str = "LATEST",
        limit: int = 50,
        market: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            if not self.alphavantage_key:
                return self._get_local_news_sentiment(
                    tickers=tickers,
                    topics=topics,
                    time_from=time_from,
                    time_to=time_to,
                    sort=sort,
                    limit=limit,
                    market=market,
                    fallback_reason="ALPHAVANTAGE_API_KEY not set",
                )
            params = {
                "function": "NEWS_SENTIMENT",
                "apikey": self.alphavantage_key,
                "sort": sort,
                "limit": min(limit, 1000)  # API limit is 1000
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
                async with session.get(self.alphavantage_url, params=params) as response:
                    data = await response.json()
                    
                    if "feed" in data:
                        news_items = []
                        
                        for article in data["feed"]:
                            # Parse ticker-specific sentiments
                            ticker_sentiments = []
                            if "ticker_sentiment" in article:
                                for ts in article["ticker_sentiment"]:
                                    ticker_sentiments.append({
                                        "ticker": ts.get("ticker"),
                                        "relevance_score": float(ts.get("relevance_score", 0)),
                                        "sentiment_score": float(ts.get("ticker_sentiment_score", 0)),
                                        "sentiment_label": ts.get("ticker_sentiment_label", "Neutral")
                                    })
                            
                            # Parse topics
                            topics_list = []
                            if "topics" in article:
                                for topic in article["topics"]:
                                    topics_list.append({
                                        "topic": topic.get("topic"),
                                        "relevance_score": float(topic.get("relevance_score", 0))
                                    })
                            
                            news_items.append({
                                "title": article.get("title"),
                                "url": article.get("url"),
                                "time_published": article.get("time_published"),
                                "authors": article.get("authors", []),
                                "summary": article.get("summary"),
                                "banner_image": article.get("banner_image"),
                                "source": article.get("source"),
                                "category": article.get("category_within_source"),
                                "source_domain": article.get("source_domain"),
                                "overall_sentiment_score": float(article.get("overall_sentiment_score", 0)),
                                "overall_sentiment_label": article.get("overall_sentiment_label", "Neutral"),
                                "ticker_sentiments": ticker_sentiments,
                                "topics": topics_list
                            })
                        
                        return {
                            "success": True,
                            "provider": "AlphaVantage",
                            "items": news_items,
                            "count": len(news_items),
                            "sentiment_score_definition": data.get("sentiment_score_definition")
                        }
                    else:
                        error_msg = (
                            data.get("Note")
                            or data.get("Information")
                            or data.get("Error Message")
                            or data.get("message")
                            or "Unknown error"
                        )
                        fallback = self._get_local_news_sentiment(
                            tickers=tickers,
                            topics=topics,
                            time_from=time_from,
                            time_to=time_to,
                            sort=sort,
                            limit=limit,
                            market=market,
                            fallback_reason=error_msg,
                        )
                        if fallback.get("success"):
                            return fallback
                        return {
                            "success": False,
                            "error": error_msg,
                            "items": []
                        }
                    
        except Exception as e:
            fallback = self._get_local_news_sentiment(
                tickers=tickers,
                topics=topics,
                time_from=time_from,
                time_to=time_to,
                sort=sort,
                limit=limit,
                market=market,
                fallback_reason=str(e),
            )
            if fallback.get("success"):
                return fallback
            return {
                "success": False,
                "error": str(e),
                "items": []
            }
    
    async def get_top_gainers_losers(self) -> Dict[str, Any]:
        try:
            params = {
                "function": "TOP_GAINERS_LOSERS",
                "apikey": self.alphavantage_key
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(self.alphavantage_url, params=params) as response:
                    data = await response.json()
                    
                    if "top_gainers" in data:
                        return {
                            "success": True,
                            "provider": "AlphaVantage",
                            "metadata": {
                                "last_updated": data.get("last_updated")
                            },
                            "top_gainers": data.get("top_gainers", []),
                            "top_losers": data.get("top_losers", []),
                            "most_actively_traded": data.get("most_actively_traded", [])
                        }
                    else:
                        error_msg = data.get("Note") or data.get("Error Message", "Unknown error")
                        return {
                            "success": False,
                            "error": error_msg
                        }
                    
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    async def analyze_sentiment_summary(
        self,
        tickers: str,
        time_from: Optional[str] = None,
        time_to: Optional[str] = None
    ) -> Dict[str, Any]:
        try:
            # First get the news sentiment data
            news_data = await self.get_news_sentiment(
                tickers=tickers,
                time_from=time_from,
                time_to=time_to,
                limit=1000
            )
            
            if not news_data.get("success"):
                return news_data
            
            # Aggregate sentiment scores by ticker
            ticker_list = [t.strip() for t in tickers.split(",")]
            sentiment_summary = {}
            
            for ticker in ticker_list:
                scores = []
                article_count = 0
                
                for article in news_data["items"]:
                    for ts in article.get("ticker_sentiments", []):
                        if ts["ticker"] == ticker:
                            scores.append(ts["sentiment_score"])
                            article_count += 1
                
                if scores:
                    avg_sentiment = sum(scores) / len(scores)
                    sentiment_summary[ticker] = {
                        "average_sentiment_score": avg_sentiment,
                        "sentiment_label": self._classify_sentiment(avg_sentiment),
                        "article_count": article_count,
                        "positive_mentions": sum(1 for s in scores if s > 0.15),
                        "negative_mentions": sum(1 for s in scores if s < -0.15),
                        "neutral_mentions": sum(1 for s in scores if -0.15 <= s <= 0.15)
                    }
            
            return {
                "success": True,
                "provider": "AlphaVantage",
                "tickers": ticker_list,
                "sentiment_summary": sentiment_summary,
                "total_articles": news_data["count"]
            }
            
        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }

    async def analyze_general_sentiment(
        self,
        tickers: Optional[str] = None,
        topics: Optional[str] = None,
        time_from: Optional[str] = None,
        time_to: Optional[str] = None,
        sort: str = "LATEST",
        limit: int = 1000,
        market: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            news_data = await self.get_news_sentiment(
                tickers=tickers,
                topics=topics,
                time_from=time_from,
                time_to=time_to,
                sort=sort,
                limit=min(limit, 1000),
                market=market,
            )

            if not news_data.get("success"):
                return news_data

            summary = self.summarize_general_items(news_data.get("items", []))
            summary.update({
                "success": True,
                "provider": news_data.get("provider"),
                "sentiment_score_definition": news_data.get("sentiment_score_definition")
            })
            return summary

        except Exception as e:
            return {
                "success": False,
                "error": str(e)
            }
    
    @staticmethod
    def _classify_sentiment(score: float) -> str:
        if score > 0.15:
            return "Bullish"
        elif score < -0.15:
            return "Bearish"
        else:
            return "Neutral"

    @staticmethod
    def _normalize_sentiment_label(label: Optional[str]) -> str:
        if not label:
            return "Neutral"
        cleaned = label.strip().replace("_", " ").replace("-", " ").lower()
        if "bullish" in cleaned and "somewhat" in cleaned:
            return "Somewhat Bullish"
        if "bearish" in cleaned and "somewhat" in cleaned:
            return "Somewhat Bearish"
        if "bullish" in cleaned:
            return "Bullish"
        if "bearish" in cleaned:
            return "Bearish"
        return "Neutral"

    @classmethod
    def summarize_general_items(cls, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        counts = {
            "Bullish": 0,
            "Somewhat Bullish": 0,
            "Neutral": 0,
            "Somewhat Bearish": 0,
            "Bearish": 0
        }
        scores = []

        for item in items:
            score = item.get("overall_sentiment_score")
            if score is not None:
                try:
                    scores.append(float(score))
                except (TypeError, ValueError):
                    pass

            label = cls._normalize_sentiment_label(item.get("overall_sentiment_label"))
            counts[label] = counts.get(label, 0) + 1

        total_articles = len(items)
        scored_articles = len(scores)
        average_score = sum(scores) / scored_articles if scored_articles else 0.0

        dominant_sentiment = "Neutral"
        if counts:
            max_count = max(counts.values())
            if max_count > 0:
                top_labels = [label for label, count in counts.items() if count == max_count]
                dominant_sentiment = "Neutral" if "Neutral" in top_labels else sorted(top_labels)[0]

        return {
            "total_articles": total_articles,
            "scored_articles": scored_articles,
            "average_sentiment_score": round(average_score, 4),
            "dominant_sentiment": dominant_sentiment,
            "sentiment_breakdown": counts
        }
