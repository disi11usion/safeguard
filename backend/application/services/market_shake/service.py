from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from typing import List, Literal, Optional

import pandas as pd

from .providers import CsvProvider, PriceDataProvider


DEFAULT_WINDOW = 126
DEFAULT_MERGE_GAP = 180
DEFAULT_TOP_N = 5
DEFAULT_ASSET = "Bitcoin"
DEFAULT_COMBINED_BASELINE = "normalized"
MIN_WINDOW = 5
MIN_TOP_N = 1
MAX_TOP_N = 50
MIN_MERGE_GAP = 0
MAX_MERGE_GAP = 2000

ASSET_FILES = {
    "Bitcoin": "bitcoin.csv",
    "Gold": "gold.csv",
    "Crude Oil": "crude_oil.csv",
    "Nasdaq": "Nasdaq.csv",
    "S&P 500": "S&P500.csv",
}


@dataclass
class ShakeEvent:
    start: pd.Timestamp
    end: pd.Timestamp
    severity: float


class MarketShakeService:
    def __init__(self, provider: PriceDataProvider | None = None):
        self.provider = provider or CsvProvider(ASSET_FILES)

    def get_summary(self) -> dict:
        return {
            "assets": self.provider.list_assets(),
            "defaults": {
                "scope": "single",
                "asset": DEFAULT_ASSET,
                "topN": DEFAULT_TOP_N,
                "window": DEFAULT_WINDOW,
                "mergeGap": DEFAULT_MERGE_GAP,
                "combinedBaseline": DEFAULT_COMBINED_BASELINE,
            },
        }

    def get_events(
        self,
        scope: Literal["single", "combined"] = "single",
        asset: str = DEFAULT_ASSET,
        top_n: int = DEFAULT_TOP_N,
        window: int = DEFAULT_WINDOW,
        merge_gap: int = DEFAULT_MERGE_GAP,
        combined_baseline: Literal["normalized", "geomean"] = DEFAULT_COMBINED_BASELINE,
    ) -> dict:
        top_n = max(MIN_TOP_N, min(MAX_TOP_N, top_n))
        window = max(MIN_WINDOW, window)
        merge_gap = max(MIN_MERGE_GAP, min(MAX_MERGE_GAP, merge_gap))

        if scope == "combined":
            return self._combined_events(
                top_n=top_n,
                window=window,
                merge_gap=merge_gap,
                baseline_mode=combined_baseline,
            )
        return self._single_events(asset=asset, top_n=top_n, window=window, merge_gap=merge_gap)

    def _single_events(self, asset: str, top_n: int, window: int, merge_gap: int) -> dict:
        if asset not in self.provider.list_assets():
            raise ValueError(f"Unsupported asset: {asset}")

        series = self.provider.get_asset_series(asset)
        if series.empty:
            return self._empty_result()

        rolling = series.pct_change(periods=window)
        mask = rolling < 0
        events = self._extract_events(mask, rolling)
        merged_all = self._merge_events(events, merge_gap=merge_gap)
        selected = self._pick_top_events(merged_all, top_n=top_n)
        predicted_next, avg_interval_years = self._predict_next(merged_all)
        return self._build_response(series, selected, predicted_next, avg_interval_years)

    def _combined_events(
        self,
        top_n: int,
        window: int,
        merge_gap: int,
        baseline_mode: Literal["normalized", "geomean"] = DEFAULT_COMBINED_BASELINE,
    ) -> dict:
        all_series = self.provider.get_all_assets()
        if not all_series:
            return self._empty_result()

        combined = pd.DataFrame(all_series).sort_index().ffill().dropna()
        if combined.empty:
            return self._empty_result()

        rolling = combined.pct_change(periods=window)
        mask = (rolling < 0).all(axis=1)
        severity_series = rolling.mean(axis=1)
        events = self._extract_events(mask, severity_series)
        merged_all = self._merge_events(events, merge_gap=merge_gap)
        selected = self._pick_top_events(merged_all, top_n=top_n)

        # Default baseline uses normalized index from 100 for better interpretability.
        if baseline_mode == "geomean":
            baseline_series = combined.apply(lambda row: row.prod() ** (1.0 / len(row)), axis=1)
        else:
            normalized = combined.apply(lambda col: 100.0 * col / col.iloc[0], axis=0)
            baseline_series = normalized.mean(axis=1)

        predicted_next, avg_interval_years = self._predict_next(merged_all)
        return self._build_response(baseline_series, selected, predicted_next, avg_interval_years)

    def _extract_events(self, mask: pd.Series, severity_series: pd.Series) -> List[ShakeEvent]:
        if mask.empty or not bool(mask.any()):
            return []

        group_ids = (mask != mask.shift()).cumsum()
        selected = severity_series[mask]
        if selected.empty:
            return []

        events: List[ShakeEvent] = []
        for _, values in selected.groupby(group_ids[mask]):
            events.append(
                ShakeEvent(
                    start=values.index[0],
                    end=values.index[-1],
                    severity=float(values.min()),
                )
            )
        return events

    def _merge_events(self, events: List[ShakeEvent], merge_gap: int) -> List[ShakeEvent]:
        if not events:
            return []

        ordered = sorted(events, key=lambda e: e.start)
        merged: List[ShakeEvent] = []
        current = ordered[0]

        for nxt in ordered[1:]:
            if (nxt.start - current.end).days < merge_gap:
                current = ShakeEvent(
                    start=current.start,
                    end=max(current.end, nxt.end),
                    severity=min(current.severity, nxt.severity),
                )
            else:
                merged.append(current)
                current = nxt
        merged.append(current)

        return merged

    def _pick_top_events(self, merged_events: List[ShakeEvent], top_n: int) -> List[ShakeEvent]:
        if not merged_events:
            return []
        top = sorted(merged_events, key=lambda e: e.severity)[:top_n]
        return sorted(top, key=lambda e: e.start)

    def _predict_next(self, events: List[ShakeEvent]) -> tuple[Optional[pd.Timestamp], Optional[float]]:
        if len(events) < 2:
            return None, None

        starts = pd.Series([event.start for event in events]).sort_values()
        intervals = starts.diff().dropna().dt.days
        if intervals.empty:
            return None, None

        avg_days = float(intervals.mean())
        next_date = starts.iloc[-1] + timedelta(days=avg_days)
        return next_date, round(avg_days / 365.25, 3)

    def _build_response(
        self,
        series: pd.Series,
        events: List[ShakeEvent],
        predicted_next: Optional[pd.Timestamp],
        avg_interval_years: Optional[float],
    ) -> dict:
        clean_series = series.dropna()
        return {
            "series": [
                {"date": idx.strftime("%Y-%m-%d"), "price": float(price)}
                for idx, price in clean_series.items()
            ],
            "events": [
                {
                    "start": event.start.strftime("%Y-%m-%d"),
                    "end": event.end.strftime("%Y-%m-%d"),
                    "severity": float(event.severity),
                }
                for event in events
            ],
            "predictedNext": predicted_next.strftime("%Y-%m-%d") if predicted_next else None,
            "avgIntervalYears": avg_interval_years,
        }

    def _empty_result(self) -> dict:
        return {
            "series": [],
            "events": [],
            "predictedNext": None,
            "avgIntervalYears": None,
        }
