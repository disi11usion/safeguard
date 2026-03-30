from __future__ import annotations

from abc import ABC, abstractmethod
import os
from pathlib import Path
from typing import Dict

import pandas as pd


class PriceDataProvider(ABC):
    @abstractmethod
    def list_assets(self) -> list[str]:
        pass

    @abstractmethod
    def get_asset_series(self, asset: str) -> pd.Series:
        pass

    @abstractmethod
    def get_all_assets(self) -> Dict[str, pd.Series]:
        pass


class CsvProvider(PriceDataProvider):
    def __init__(self, asset_files: Dict[str, str], base_dir: Path | None = None):
        self.asset_files = asset_files
        env_dir = os.getenv("MARKET_SHAKE_CSV_DIR")
        here = Path(__file__).resolve()
        default_candidates = []
        for parent in here.parents:
            default_candidates.append(parent / "data" / "csv")
        default_candidates.append(Path.cwd() / "data" / "csv")
        if base_dir:
            self.base_dir = base_dir
        elif env_dir:
            self.base_dir = Path(env_dir)
        else:
            self.base_dir = next((p for p in default_candidates if p.exists()), default_candidates[0])

    def list_assets(self) -> list[str]:
        return list(self.asset_files.keys())

    def _load_asset(self, file_name: str, date_col: str = "Date", price_col: str = "Close") -> pd.Series:
        csv_path = self.base_dir / file_name
        if not csv_path.exists():
            return pd.Series(dtype="float64")

        df = pd.read_csv(csv_path)
        if date_col not in df.columns or price_col not in df.columns:
            return pd.Series(dtype="float64")

        df = df.dropna(subset=[date_col])
        df["date"] = pd.to_datetime(df[date_col], errors="coerce", utc=True).dt.tz_localize(None)
        df["price"] = pd.to_numeric(df[price_col], errors="coerce")
        df = df.dropna(subset=["date", "price"])
        df = df.sort_values("date")
        return df.set_index("date")["price"]

    def get_asset_series(self, asset: str) -> pd.Series:
        file_name = self.asset_files.get(asset)
        if not file_name:
            return pd.Series(dtype="float64")
        return self._load_asset(file_name)

    def get_all_assets(self) -> Dict[str, pd.Series]:
        return {asset: self.get_asset_series(asset) for asset in self.list_assets()}


class DbProvider(PriceDataProvider):
    def list_assets(self) -> list[str]:
        raise NotImplementedError("DbProvider is reserved for future extension.")

    def get_asset_series(self, asset: str) -> pd.Series:
        raise NotImplementedError("DbProvider is reserved for future extension.")

    def get_all_assets(self) -> Dict[str, pd.Series]:
        raise NotImplementedError("DbProvider is reserved for future extension.")


class ApiProvider(PriceDataProvider):
    def list_assets(self) -> list[str]:
        raise NotImplementedError("ApiProvider is reserved for future extension.")

    def get_asset_series(self, asset: str) -> pd.Series:
        raise NotImplementedError("ApiProvider is reserved for future extension.")

    def get_all_assets(self) -> Dict[str, pd.Series]:
        raise NotImplementedError("ApiProvider is reserved for future extension.")
