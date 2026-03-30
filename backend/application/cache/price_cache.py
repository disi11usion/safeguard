"""
price_cache.py – Multi-level price cache (L1 in-process + L2 Redis).

Read path:
    1. L1 hit (fresh)  → return immediately
    2. L2 hit (fresh)  → warm L1 → return
    3. Both stale/miss → return stale entry (caller triggers refresh)

Refresh deduplication:
    claim_refresh(key)   → True only for the FIRST caller; rest skip
    release_refresh(key) → must be called in a finally block after refresh

Usage:
    from application.cache.price_cache import price_cache   # singleton
    await price_cache.initialize()                           # once at startup
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import asdict, dataclass
from typing import Any, Dict, Optional, Set

logger = logging.getLogger(__name__)

try:
    import redis.asyncio as aioredis
    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False

# ── Stale TTL (seconds) per asset type ────────────────────────────────────
STALE_TTL: Dict[str, int] = {
    "crypto":  60,    # 1 min  – fast-moving
    "stock":   300,   # 5 min
    "forex":   300,   # 5 min
    "futures": 300,   # 5 min
    "default": 120,   # 2 min fallback
}

# Redis TTL = stale_ttl × multiplier  (keeps stale data available while refresh runs)
REDIS_TTL_MULTIPLIER = 3


@dataclass
class PriceEntry:
    cache_key:  str
    asset_type: str
    data:       Any    # JSON-serialisable dict / list from API or DB
    updated_at: float  # unix timestamp (time.time())


class PriceCache:
    """
    Two-level price cache:
      L1 = in-process Python dict  (fastest, single-process)
      L2 = Redis                   (shared across workers / survives restarts)

    Both layers degrade gracefully – Redis failures are caught and logged.
    """

    def __init__(self, redis_url: Optional[str] = None) -> None:
        self._l1: Dict[str, PriceEntry] = {}
        self._l1_lock = asyncio.Lock()

        self._redis: Optional[Any] = None
        self._redis_url = redis_url or os.getenv("REDIS_URL")

        # Refresh deduplication state
        self._refreshing: Set[str] = set()
        self._refresh_lock = asyncio.Lock()

    # ── lifecycle ──────────────────────────────────────────────────────────

    async def initialize(self) -> None:
        """Connect to Redis at startup (non-fatal if unavailable)."""
        if not (self._redis_url and HAS_REDIS):
            logger.info("[PriceCache] No Redis URL – running in L1-only mode")
            return
        try:
            client = aioredis.from_url(self._redis_url, decode_responses=True)
            await client.ping()
            self._redis = client
            logger.info("[PriceCache] Redis connected")
        except Exception as exc:
            logger.warning(f"[PriceCache] Redis unavailable, L1-only mode: {exc}")

    async def close(self) -> None:
        if self._redis:
            await self._redis.aclose()

    # ── helpers ────────────────────────────────────────────────────────────

    def _ttl(self, asset_type: str) -> int:
        return STALE_TTL.get(asset_type, STALE_TTL["default"])

    def _is_stale(self, entry: PriceEntry) -> bool:
        return (time.time() - entry.updated_at) > self._ttl(entry.asset_type)

    def is_fresh(self, entry: PriceEntry) -> bool:
        return not self._is_stale(entry)

    # ── read path ──────────────────────────────────────────────────────────

    async def get(self, cache_key: str) -> Optional[PriceEntry]:
        """
        Returns a PriceEntry (possibly stale) or None if nothing cached.
        Caller uses is_fresh() to decide whether to trigger a refresh.
        """
        # 1. L1 – in-process
        entry = self._l1.get(cache_key)
        if entry and self.is_fresh(entry):
            return entry

        # 2. L2 – Redis
        if self._redis:
            try:
                raw = await self._redis.get(f"price:{cache_key}")
                if raw:
                    r_entry = PriceEntry(**json.loads(raw))
                    if self.is_fresh(r_entry):
                        async with self._l1_lock:
                            self._l1[cache_key] = r_entry   # warm L1
                        return r_entry
                    # Redis has stale data – keep as fallback
                    entry = r_entry
            except Exception as exc:
                logger.debug(f"[PriceCache] Redis read error '{cache_key}': {exc}")

        # Return stale entry as fallback (may be None on cold start)
        return entry

    # ── write path ─────────────────────────────────────────────────────────

    async def set(self, cache_key: str, asset_type: str, data: Any) -> None:
        """Write fresh data to L1 and L2."""
        entry = PriceEntry(
            cache_key=cache_key,
            asset_type=asset_type,
            data=data,
            updated_at=time.time(),
        )
        async with self._l1_lock:
            self._l1[cache_key] = entry

        if self._redis:
            ttl = self._ttl(asset_type) * REDIS_TTL_MULTIPLIER
            try:
                await self._redis.set(
                    f"price:{cache_key}",
                    json.dumps(asdict(entry)),
                    ex=ttl,
                )
            except Exception as exc:
                logger.debug(f"[PriceCache] Redis write error '{cache_key}': {exc}")

    # ── refresh deduplication ──────────────────────────────────────────────

    async def claim_refresh(self, cache_key: str) -> bool:
        """
        Atomically claim the refresh slot for this key.
        Returns True  → you must run the refresh then call release_refresh().
        Returns False → another coroutine is already refreshing; return stale data.
        """
        async with self._refresh_lock:
            if cache_key in self._refreshing:
                return False
            self._refreshing.add(cache_key)

        # Mirror into Redis so multiple processes see the lock (30s safety TTL)
        if self._redis:
            try:
                await self._redis.set(f"refresh:{cache_key}", "1", ex=30, nx=True)
            except Exception:
                pass
        return True

    async def release_refresh(self, cache_key: str) -> None:
        """Mark refresh complete. Must be called in a finally block."""
        self._refreshing.discard(cache_key)
        if self._redis:
            try:
                await self._redis.delete(f"refresh:{cache_key}")
            except Exception:
                pass

    def is_refreshing(self, cache_key: str) -> bool:
        return cache_key in self._refreshing


# ── module-level singleton ─────────────────────────────────────────────────
# Both main.py and routes.py import this directly:
#   from application.cache.price_cache import price_cache
price_cache = PriceCache()
