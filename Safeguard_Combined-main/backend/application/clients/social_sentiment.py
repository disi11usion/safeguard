import json
import os
from datetime import datetime
from functools import lru_cache
from typing import Any, Dict, Iterable, List, Optional, Tuple

_finbert_pipeline = None
_vader_analyzer = None
SOCIAL_SENTIMENT_MODEL = os.getenv("SOCIAL_SENTIMENT_MODEL", "vader").lower()
MAX_TEXT_CHARS = 1000


def _get_finbert_pipeline():
    global _finbert_pipeline
    if _finbert_pipeline is None:
        try:
            from transformers import pipeline
        except Exception as e:
            raise RuntimeError("FinBERT dependencies not available") from e
        _finbert_pipeline = pipeline(
            "sentiment-analysis",
            model="ProsusAI/finbert",
            device=-1,
            batch_size=4
        )
    return _finbert_pipeline


def _get_vader_analyzer():
    global _vader_analyzer
    if _vader_analyzer is None:
        try:
            from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer
        except Exception as e:
            raise RuntimeError("VADER dependencies not available") from e
        _vader_analyzer = SentimentIntensityAnalyzer()
    return _vader_analyzer


@lru_cache(maxsize=2000)
def _cached_sentiment(text: str) -> float:
    if not text or not isinstance(text, str) or not text.strip():
        return 0.0
    try:
        finbert = _get_finbert_pipeline()
        truncated = text[:500].strip()
        result = finbert(truncated)[0]
        label = str(result.get("label", "")).lower()
        score = float(result.get("score", 0.0))
        if label == "positive":
            return score
        if label == "negative":
            return -score
        return 0.0
    except Exception:
        return 0.0


def _batch_sentiment(texts: List[str], batch_size: int = 4) -> List[float]:
    if not texts:
        return []
    finbert = _get_finbert_pipeline()
    results: List[float] = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        try:
            truncated_batch = [t[:500].strip() if isinstance(t, str) else "" for t in batch]
            batch_results = finbert(truncated_batch)
            for item in batch_results:
                label = str(item.get("label", "")).lower()
                score = float(item.get("score", 0.0))
                if label == "positive":
                    results.append(score)
                elif label == "negative":
                    results.append(-score)
                else:
                    results.append(0.0)
        except Exception:
            for text in batch:
                results.append(_cached_sentiment(text if isinstance(text, str) else ""))
    return results


def _score_text(text: str) -> float:
    if not text or not isinstance(text, str) or not text.strip():
        return 0.0
    if SOCIAL_SENTIMENT_MODEL != "finbert":
        try:
            analyzer = _get_vader_analyzer()
            return float(analyzer.polarity_scores(text).get("compound", 0.0))
        except Exception:
            return 0.0
    chunk_size = 500
    chunks = [text[i:i + chunk_size] for i in range(0, len(text), chunk_size)]
    if len(chunks) == 1:
        return _cached_sentiment(chunks[0])
    scores = _batch_sentiment(chunks)
    return sum(scores) / len(scores) if scores else 0.0


def _extract_comment_text(comments: Any) -> str:
    if comments is None:
        return ""

    def extract_from_dict(data: Dict[str, Any]) -> List[str]:
        values: List[str] = []
        for key in ("comment", "comment_body", "body", "text", "content", "reply_body"):
            if key in data and data[key]:
                values.append(str(data[key]))
        replies = data.get("replies")
        if isinstance(replies, list):
            for reply in replies:
                if isinstance(reply, dict):
                    values.extend(extract_from_dict(reply))
                elif isinstance(reply, str):
                    values.append(reply)
        return values

    def extract_from_list(items: List[Any]) -> List[str]:
        values: List[str] = []
        for item in items:
            if isinstance(item, dict):
                values.extend(extract_from_dict(item))
            elif isinstance(item, str):
                values.append(item)
        return values

    if isinstance(comments, str):
        stripped = comments.strip()
        if stripped.startswith("[") or stripped.startswith("{"):
            try:
                loaded = json.loads(comments)
            except Exception:
                return comments
            if isinstance(loaded, dict):
                return " ".join(extract_from_dict(loaded))
            if isinstance(loaded, list):
                return " ".join(extract_from_list(loaded))
            return str(loaded)
        return comments

    if isinstance(comments, dict):
        return " ".join(extract_from_dict(comments))
    if isinstance(comments, list):
        return " ".join(extract_from_list(comments))
    return str(comments)


def _combine_text(title: Optional[str], content: Optional[str], comments: Any) -> str:
    parts: List[str] = []
    if title:
        parts.append(str(title))
    if content:
        parts.append(str(content))
    comment_text = _extract_comment_text(comments)
    if comment_text:
        parts.append(comment_text)
    combined = " ".join([p for p in parts if p and p.strip()])
    return combined[:MAX_TEXT_CHARS]


def _classify_bucket(score: float) -> str:
    if score >= 0.35:
        return "Bullish"
    if score >= 0.15:
        return "Somewhat Bullish"
    if score <= -0.35:
        return "Bearish"
    if score <= -0.15:
        return "Somewhat Bearish"
    return "Neutral"


def _summarize_scores(scores: List[float]) -> Dict[str, Any]:
    breakdown = {
        "Bullish": 0,
        "Somewhat Bullish": 0,
        "Neutral": 0,
        "Somewhat Bearish": 0,
        "Bearish": 0
    }
    for score in scores:
        label = _classify_bucket(score)
        breakdown[label] = breakdown.get(label, 0) + 1

    total = len(scores)
    average = sum(scores) / total if total else 0.0
    dominant = "Neutral"
    if breakdown:
        max_count = max(breakdown.values())
        if max_count > 0:
            top_labels = [label for label, count in breakdown.items() if count == max_count]
            dominant = "Neutral" if "Neutral" in top_labels else sorted(top_labels)[0]

    return {
        "total_posts": total,
        "average_sentiment_score": round(average, 4),
        "dominant_sentiment": dominant,
        "sentiment_breakdown": breakdown
    }


class SocialSentimentClient:
    def __init__(self, cache_ttl_seconds: int = 600):
        self._cache_ttl = cache_ttl_seconds
        self._cache_key: Optional[Tuple[Any, ...]] = None
        self._cache_time: Optional[datetime] = None
        self._cache_value: Optional[Dict[str, Any]] = None

    def summarize_posts(
        self,
        posts: Iterable[Dict[str, Any]],
        cache_key: Optional[Tuple[Any, ...]] = None
    ) -> Dict[str, Any]:
        now = datetime.utcnow()
        if cache_key and self._cache_key == cache_key and self._cache_time:
            age = (now - self._cache_time).total_seconds()
            if age <= self._cache_ttl and self._cache_value:
                return self._cache_value

        texts: List[str] = []
        total_posts = 0
        for post in posts:
            total_posts += 1
            text = _combine_text(
                post.get("title"),
                post.get("content"),
                post.get("comments")
            )
            if text:
                texts.append(text)

        scores = []
        if SOCIAL_SENTIMENT_MODEL != "finbert":
            scores = [_score_text(text) for text in texts]
        else:
            short_texts = [text for text in texts if len(text) <= 500]
            long_texts = [text for text in texts if len(text) > 500]
            if short_texts:
                scores.extend(_batch_sentiment(short_texts))
            if long_texts:
                scores.extend([_score_text(text) for text in long_texts])
        summary = _summarize_scores(scores)
        summary["total_posts"] = total_posts
        summary["scored_posts"] = len(scores)

        if cache_key:
            self._cache_key = cache_key
            self._cache_time = now
            self._cache_value = summary

        return summary
