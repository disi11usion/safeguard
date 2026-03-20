"""
In-memory TTL cache for price data API responses.

Provides a thread-safe, TTL-based cache that sits between the FastAPI
endpoints and the external API clients (Polygon, TwelveData).

Also provides request coalescing: when multiple users request the same
data concurrently, only one external API call is made and the result is
shared among all waiters.
"""

import asyncio
import time
import threading
import logging
from typing import Any, Callable, Coroutine, Dict, Optional, Tuple

logger = logging.getLogger("price_cache")


class PriceCache:
    """Thread-safe in-memory cache with per-entry TTL."""

    def __init__(self, default_ttl: int = 300, max_size: int = 500):
        self._cache: Dict[str, Tuple[Any, float]] = {}
        self._default_ttl = default_ttl
        self._max_size = max_size
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0

    def get(self, key: str) -> Tuple[bool, Any]:
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                self._misses += 1
                return False, None

            value, expire_time = entry
            if time.time() > expire_time:
                del self._cache[key]
                self._misses += 1
                return False, None

            self._hits += 1
            return True, value

    def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        ttl = ttl if ttl is not None else self._default_ttl
        expire_time = time.time() + ttl

        with self._lock:
            if len(self._cache) >= self._max_size and key not in self._cache:
                self._evict_expired()
                if len(self._cache) >= self._max_size:
                    oldest_key = min(self._cache, key=lambda k: self._cache[k][1])
                    del self._cache[oldest_key]
            self._cache[key] = (value, expire_time)

    def _evict_expired(self) -> None:
        now = time.time()
        expired_keys = [k for k, (_, exp) in self._cache.items() if now > exp]
        for k in expired_keys:
            del self._cache[k]

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()
            self._hits = 0
            self._misses = 0

    def stats(self) -> Dict[str, Any]:
        with self._lock:
            self._evict_expired()
            total = self._hits + self._misses
            hit_rate = round(self._hits / total * 100, 2) if total > 0 else 0.0
            return {
                "total_entries": len(self._cache),
                "max_size": self._max_size,
                "default_ttl_seconds": self._default_ttl,
                "hit_count": self._hits,
                "miss_count": self._misses,
                "total_requests": total,
                "hit_rate": f"{hit_rate}%",
            }


def make_cache_key(*args) -> str:
    return ":".join(str(a) for a in args)


# Global cache instances (different TTL per data type)
historical_cache = PriceCache(default_ttl=600, max_size=200)   # 10 min
indicators_cache = PriceCache(default_ttl=300, max_size=200)   # 5 min
top_list_cache   = PriceCache(default_ttl=300, max_size=50)    # 5 min
stock_cache      = PriceCache(default_ttl=300, max_size=200)   # 5 min


class RequestCoalescer:
    """
    Ensures concurrent requests for the same cache key only trigger
    ONE external API call. All other callers wait and share the result.
    """

    def __init__(self):
        self._in_flight: Dict[str, asyncio.Future] = {}
        self._coalesced_count = 0

    async def fetch_or_wait(
        self,
        key: str,
        cache: PriceCache,
        fetch_fn: Callable[[], Coroutine],
        ttl: Optional[int] = None,
    ) -> Any:
        # 1. Check cache
        hit, cached = cache.get(key)
        if hit:
            return cached

        # 2. If another coroutine is already fetching this key, wait
        if key in self._in_flight:
            self._coalesced_count += 1
            return await self._in_flight[key]

        # 3. We are the first requester
        loop = asyncio.get_running_loop()
        future: asyncio.Future = loop.create_future()
        self._in_flight[key] = future

        try:
            result = await fetch_fn()
            cache.set(key, result, ttl=ttl)
            future.set_result(result)
            return result
        except Exception as e:
            future.set_exception(e)
            raise
        finally:
            self._in_flight.pop(key, None)

    def stats(self) -> Dict[str, Any]:
        return {
            "in_flight_count": len(self._in_flight),
            "total_coalesced_requests": self._coalesced_count,
        }


# Global coalescer instance
request_coalescer = RequestCoalescer()
