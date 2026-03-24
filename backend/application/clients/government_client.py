"""
Government Module - Backend API Client
Provides data access for the Government Macro Sentiment module.
"""

import os
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Dict, Any, List, Optional
from datetime import datetime
from database.utils.db_pool import get_db_connection

class GovernmentClient:
    def __init__(self):
        self.db_url = os.getenv("DATABASE_URL")

    def _get_conn(self):
        return get_db_connection()

    def _safe_query(self, query: str, params: tuple = None) -> List[dict]:
        """Execute a query and return results as list of dicts."""
        try:
            conn = self._get_conn()
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute(query, params)
            results = cursor.fetchall()
            cursor.close()
            conn.close()
            return [dict(row) for row in results]
        except Exception as e:
            print(f"Government DB query error: {e}")
            return []

    def get_global_sentiment(self) -> Dict[str, Any]:
        """Get the latest global macro sentiment."""
        rows = self._safe_query("""
            SELECT global_score, global_label, countries_count, analyzed_at
            FROM government.global_sentiment
            ORDER BY analyzed_at DESC
            LIMIT 1
        """)
        if rows:
            row = rows[0]
            return {
                "success": True,
                "global_score": float(row["global_score"]) if row["global_score"] else 0.0,
                "global_label": row["global_label"],
                "countries_count": row["countries_count"],
                "analyzed_at": row["analyzed_at"].isoformat() if row["analyzed_at"] else None
            }
        return {"success": True, "global_score": 0.0, "global_label": "neutral",
                "countries_count": 0, "analyzed_at": None}

    def get_all_countries_sentiment(self) -> Dict[str, Any]:
        """Get sentiment overview for all 22 countries."""
        rows = self._safe_query("""
            SELECT DISTINCT ON (cs.country_code)
                cs.country_code,
                c.country_name,
                c.region,
                cs.overall_score,
                cs.overall_label,
                cs.positive_count,
                cs.neutral_count,
                cs.negative_count,
                cs.analyzed_at
            FROM government.country_sentiment cs
            JOIN government.countries c ON c.country_code = cs.country_code
            WHERE c.is_active = TRUE
            ORDER BY cs.country_code, cs.analyzed_at DESC
        """)
        countries = []
        for row in rows:
            countries.append({
                "country_code": row["country_code"],
                "country_name": row["country_name"],
                "region": row["region"],
                "overall_score": float(row["overall_score"]) if row["overall_score"] else 0.0,
                "overall_label": row["overall_label"],
                "positive_count": row["positive_count"],
                "neutral_count": row["neutral_count"],
                "negative_count": row["negative_count"],
                "analyzed_at": row["analyzed_at"].isoformat() if row["analyzed_at"] else None
            })
        return {"success": True, "countries": countries, "count": len(countries)}

    def get_country_detail(self, country_code: str) -> Dict[str, Any]:
        """Get detailed metric-level sentiment for a specific country."""
        # Get country info
        country_rows = self._safe_query("""
            SELECT country_code, country_name, region
            FROM government.countries
            WHERE country_code = %s AND is_active = TRUE
        """, (country_code.upper(),))

        if not country_rows:
            return {"success": False, "error": "Country not found"}

        country = country_rows[0]

        # Get latest metric sentiments
        metrics = self._safe_query("""
            SELECT DISTINCT ON (ms.metric_name)
                ms.metric_name,
                ms.sentiment_label,
                ms.sentiment_score,
                ms.analysis_note,
                ms.analyzed_at,
                ms.data_date,
                mm.metric_value,
                mm.previous_value,
                mm.unit,
                mm.source
            FROM government.metric_sentiment ms
            LEFT JOIN government.macro_metrics mm 
                ON mm.country_code = ms.country_code 
                AND mm.metric_name = ms.metric_name
                AND mm.data_date = ms.data_date
            WHERE ms.country_code = %s
            ORDER BY ms.metric_name, ms.analyzed_at DESC
        """, (country_code.upper(),))

        # Get overall country sentiment
        overall = self._safe_query("""
            SELECT overall_score, overall_label, positive_count, neutral_count, negative_count, analyzed_at
            FROM government.country_sentiment
            WHERE country_code = %s
            ORDER BY analyzed_at DESC
            LIMIT 1
        """, (country_code.upper(),))

        metric_list = []
        for m in metrics:
            metric_list.append({
                "metric_name": m["metric_name"],
                "sentiment_label": m["sentiment_label"],
                "sentiment_score": float(m["sentiment_score"]) if m["sentiment_score"] else 0.0,
                "analysis_note": m["analysis_note"],
                "metric_value": float(m["metric_value"]) if m.get("metric_value") else None,
                "previous_value": float(m["previous_value"]) if m.get("previous_value") else None,
                "unit": m.get("unit"),
                "source": m.get("source"),
                "data_date": m["data_date"].isoformat() if m.get("data_date") else None,
            })

        overall_data = overall[0] if overall else {}

        return {
            "success": True,
            "country": {
                "code": country["country_code"],
                "name": country["country_name"],
                "region": country["region"],
            },
            "overall": {
                "score": float(overall_data.get("overall_score", 0)),
                "label": overall_data.get("overall_label", "neutral"),
                "positive_count": overall_data.get("positive_count", 0),
                "neutral_count": overall_data.get("neutral_count", 0),
                "negative_count": overall_data.get("negative_count", 0),
                "analyzed_at": overall_data["analyzed_at"].isoformat() if overall_data.get("analyzed_at") else None,
            },
            "metrics": metric_list
        }

    def get_countries_list(self) -> List[dict]:
        """Get the list of all 22 countries."""
        return self._safe_query("""
            SELECT country_code, country_name, region, display_order
            FROM government.countries
            WHERE is_active = TRUE
            ORDER BY display_order
        """)


# Singleton
_government_client = None

def get_government_client() -> GovernmentClient:
    global _government_client
    if _government_client is None:
        _government_client = GovernmentClient()
    return _government_client
