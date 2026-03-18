"""
Government Module - Macroeconomic Sentiment Analysis
Applies the SAME algorithm as the crypto sentiment module:
  - Each metric classified as Positive / Neutral / Negative
  - Per-country overall macro sentiment
  - Global market sentiment (average of all 22 countries)
"""

import os
import sys
from pathlib import Path
sys.path.append(str(Path(__file__).resolve().parents[2]))

import psycopg2
from datetime import datetime, date
from dotenv import load_dotenv

load_dotenv()

# ============================================================================
# Metric classification thresholds
# Based on macroeconomic research and standard benchmarks
# ============================================================================
METRIC_THRESHOLDS = {
    "inflation": {
        # CPI annual % change: 1-3% is healthy
        "positive_max": 3.0,     # Below 3% is positive (controlled inflation)
        "positive_min": 0.5,     # Above 0.5% shows healthy growth
        "negative_high": 5.0,    # Above 5% is concerning
        "negative_low": 0.0,     # Deflation is negative
        "unit": "%",
        "lower_is_better": True,  # Low-moderate inflation is good
    },
    "interest_rate": {
        # Central bank rate: context-dependent, but stable/moderate is good
        "positive_max": 5.0,
        "positive_min": 0.5,
        "negative_high": 10.0,
        "negative_low": -0.5,
        "unit": "%",
        "lower_is_better": None,  # Depends on context
    },
    "employment": {
        # Unemployment rate: lower is better
        "positive_max": 5.0,     # Below 5% is strong employment
        "positive_min": 0.0,
        "negative_high": 8.0,     # Above 8% is concerning
        "negative_low": 0.0,
        "unit": "%",
        "lower_is_better": True,
    },
    "gdp": {
        # GDP growth rate: positive growth is good
        "positive_min": 2.0,     # Above 2% is healthy growth
        "positive_max": 8.0,
        "negative_high": 100.0,
        "negative_low": 0.0,      # Negative/zero growth is bad
        "unit": "%",
        "lower_is_better": False,  # Higher GDP growth is better
    },
    "pmi": {
        # PMI index: above 50 = expansion, below 50 = contraction
        "positive_min": 50.0,
        "positive_max": 60.0,
        "negative_high": 100.0,
        "negative_low": 45.0,     # Below 45 is significant contraction
        "unit": "index",
        "lower_is_better": False,
    },
    "bond_yield_10y": {
        # 10Y Government Bond Yield: moderate yield is healthy
        "positive_max": 5.0,
        "positive_min": 1.0,
        "negative_high": 8.0,
        "negative_low": 0.0,
        "unit": "%",
        "lower_is_better": None,
    },
}


def classify_metric(metric_name: str, value: float) -> dict:
    """
    Classify a single metric as positive/neutral/negative.
    Returns dict with label, score (-1 to 1), and analysis note.
    """
    thresholds = METRIC_THRESHOLDS.get(metric_name)
    if not thresholds:
        return {"label": "neutral", "score": 0.0, "note": "Unknown metric"}

    if value is None:
        return {"label": "neutral", "score": 0.0, "note": "No data available"}

    lower_is_better = thresholds.get("lower_is_better")

    # Special handling for GDP (higher is better)
    if metric_name == "gdp":
        if value >= thresholds["positive_min"]:
            score = min(1.0, value / 10.0)  # Normalize to 0-1
            return {"label": "positive", "score": round(score, 4),
                    "note": f"GDP growth {value:.1f}% indicates economic expansion"}
        elif value <= thresholds["negative_low"]:
            score = max(-1.0, value / 5.0)  # Normalize to -1-0
            return {"label": "negative", "score": round(score, 4),
                    "note": f"GDP growth {value:.1f}% signals economic contraction"}
        else:
            return {"label": "neutral", "score": round(value / 10.0, 4),
                    "note": f"GDP growth {value:.1f}% shows moderate activity"}

    # Special handling for PMI (above 50 = expansion)
    if metric_name == "pmi":
        if value >= thresholds["positive_min"]:
            score = min(1.0, (value - 50) / 10.0)
            return {"label": "positive", "score": round(score, 4),
                    "note": f"PMI {value:.1f} indicates manufacturing expansion"}
        elif value < thresholds["negative_low"]:
            score = max(-1.0, (value - 50) / 10.0)
            return {"label": "negative", "score": round(score, 4),
                    "note": f"PMI {value:.1f} signals manufacturing contraction"}
        else:
            return {"label": "neutral", "score": round((value - 50) / 10.0, 4),
                    "note": f"PMI {value:.1f} near neutral threshold"}

    # Special handling for employment (unemployment rate - lower is better)
    if metric_name == "employment":
        if value <= thresholds["positive_max"]:
            score = min(1.0, (thresholds["positive_max"] - value) / thresholds["positive_max"])
            return {"label": "positive", "score": round(score, 4),
                    "note": f"Unemployment {value:.1f}% indicates strong labor market"}
        elif value >= thresholds["negative_high"]:
            score = max(-1.0, -(value - thresholds["positive_max"]) / 10.0)
            return {"label": "negative", "score": round(score, 4),
                    "note": f"Unemployment {value:.1f}% signals weak labor market"}
        else:
            return {"label": "neutral", "score": 0.0,
                    "note": f"Unemployment {value:.1f}% at moderate levels"}

    # Inflation: low-moderate is positive
    if metric_name == "inflation":
        if thresholds["positive_min"] <= value <= thresholds["positive_max"]:
            score = 0.5
            return {"label": "positive", "score": score,
                    "note": f"Inflation {value:.1f}% within healthy range"}
        elif value > thresholds["negative_high"]:
            score = max(-1.0, -(value - thresholds["positive_max"]) / 10.0)
            return {"label": "negative", "score": round(score, 4),
                    "note": f"Inflation {value:.1f}% is elevated"}
        elif value < thresholds["negative_low"]:
            return {"label": "negative", "score": -0.5,
                    "note": f"Deflation at {value:.1f}% signals economic weakness"}
        else:
            return {"label": "neutral", "score": 0.0,
                    "note": f"Inflation {value:.1f}% at borderline levels"}

    # Generic handling for interest_rate and bond_yield_10y
    if thresholds["positive_min"] <= value <= thresholds["positive_max"]:
        return {"label": "positive", "score": 0.5,
                "note": f"{metric_name} at {value:.2f}{thresholds['unit']} in normal range"}
    elif value > thresholds["negative_high"]:
        return {"label": "negative", "score": -0.7,
                "note": f"{metric_name} at {value:.2f}{thresholds['unit']} is elevated"}
    elif value < thresholds["negative_low"]:
        return {"label": "negative", "score": -0.5,
                "note": f"{metric_name} at {value:.2f}{thresholds['unit']} is abnormally low"}
    else:
        return {"label": "neutral", "score": 0.0,
                "note": f"{metric_name} at {value:.2f}{thresholds['unit']}"}


def analyze_country_metrics(conn, country_code: str) -> dict:
    """Analyze all metrics for a single country and store sentiment."""
    cursor = conn.cursor()
    today = date.today().isoformat()

    # Get latest metrics for this country
    cursor.execute("""
        SELECT DISTINCT ON (metric_name) 
            metric_name, metric_value, previous_value, data_date
        FROM government.macro_metrics
        WHERE country_code = %s
        ORDER BY metric_name, data_date DESC, fetched_at DESC
    """, (country_code,))

    rows = cursor.fetchall()
    if not rows:
        cursor.close()
        return None

    metric_sentiments = []
    for metric_name, value, prev_value, data_date in rows:
        result = classify_metric(metric_name, float(value) if value is not None else None)

        # Store metric-level sentiment
        try:
            cursor.execute("""
                INSERT INTO government.metric_sentiment
                    (country_code, metric_name, sentiment_label, sentiment_score, analysis_note, data_date)
                VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (country_code, metric_name, data_date)
                DO UPDATE SET
                    sentiment_label = EXCLUDED.sentiment_label,
                    sentiment_score = EXCLUDED.sentiment_score,
                    analysis_note = EXCLUDED.analysis_note,
                    analyzed_at = now()
            """, (country_code, metric_name, result["label"], result["score"],
                  result["note"], data_date or today))
        except Exception as e:
            print(f"  Error storing metric sentiment for {country_code}/{metric_name}: {e}")

        metric_sentiments.append(result)

    # Calculate country-level overall sentiment
    if metric_sentiments:
        scores = [m["score"] for m in metric_sentiments]
        avg_score = sum(scores) / len(scores)

        pos_count = sum(1 for m in metric_sentiments if m["label"] == "positive")
        neg_count = sum(1 for m in metric_sentiments if m["label"] == "negative")
        neu_count = sum(1 for m in metric_sentiments if m["label"] == "neutral")

        if avg_score > 0.1:
            overall_label = "positive"
        elif avg_score < -0.1:
            overall_label = "negative"
        else:
            overall_label = "neutral"

        # Store country-level sentiment
        try:
            cursor.execute("""
                INSERT INTO government.country_sentiment
                    (country_code, overall_score, overall_label, positive_count, neutral_count, negative_count)
                VALUES (%s, %s, %s, %s, %s, %s)
            """, (country_code, round(avg_score, 4), overall_label, pos_count, neu_count, neg_count))
        except Exception as e:
            print(f"  Error storing country sentiment for {country_code}: {e}")

        cursor.close()
        return {
            "country_code": country_code,
            "overall_score": round(avg_score, 4),
            "overall_label": overall_label,
            "positive_count": pos_count,
            "neutral_count": neu_count,
            "negative_count": neg_count,
            "metrics_analyzed": len(metric_sentiments)
        }

    cursor.close()
    return None


def compute_global_sentiment(conn, country_results: list):
    """Compute global sentiment as average of all country sentiments."""
    if not country_results:
        print("No country results to compute global sentiment.")
        return

    scores = [r["overall_score"] for r in country_results if r]
    if not scores:
        return

    global_score = sum(scores) / len(scores)
    if global_score > 0.1:
        global_label = "positive"
    elif global_score < -0.1:
        global_label = "negative"
    else:
        global_label = "neutral"

    cursor = conn.cursor()
    try:
        cursor.execute("""
            INSERT INTO government.global_sentiment
                (global_score, global_label, countries_count)
            VALUES (%s, %s, %s)
        """, (round(global_score, 4), global_label, len(scores)))
        print(f"\nGlobal Sentiment: {global_label} (score: {global_score:.4f}, countries: {len(scores)})")
    except Exception as e:
        print(f"Error storing global sentiment: {e}")
    finally:
        cursor.close()


def main():
    """Main entry: analyze all countries and compute global sentiment."""
    print("=" * 60)
    print("Government Module - Macroeconomic Sentiment Analysis")
    print(f"Started at: {datetime.now().isoformat()}")
    print("=" * 60)

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    conn = psycopg2.connect(db_url)
    conn.autocommit = True

    # Get all active countries
    cursor = conn.cursor()
    cursor.execute("SELECT country_code, country_name FROM government.countries WHERE is_active = TRUE ORDER BY display_order")
    countries = cursor.fetchall()
    cursor.close()

    country_results = []
    for country_code, country_name in countries:
        print(f"\nAnalyzing {country_name} ({country_code})...")
        try:
            result = analyze_country_metrics(conn, country_code)
            if result:
                country_results.append(result)
                print(f"  -> {result['overall_label']} (score: {result['overall_score']}, "
                      f"P:{result['positive_count']} N:{result['neutral_count']} Neg:{result['negative_count']})")
            else:
                print(f"  -> No metrics available")
        except Exception as e:
            print(f"  ERROR: {e}")

    # Compute global sentiment
    compute_global_sentiment(conn, country_results)

    conn.close()
    print(f"\nCompleted at: {datetime.now().isoformat()}")


if __name__ == "__main__":
    main()
