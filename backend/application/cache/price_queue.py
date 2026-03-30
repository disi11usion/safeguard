"""
price_queue.py – Background price refresh queue.

Usage:
    queue = PriceRefreshQueue(refresh_fn=my_refresh_fn, num_workers=3)
    await queue.start()          # call once at startup
    await queue.enqueue("key")   # enqueue a refresh task
    await queue.stop()           # call on shutdown

Deduplication:
    PriceCache.claim_refresh() gates enqueuing – only the first caller
    enqueues a task; duplicates are dropped before reaching this queue.
"""

import asyncio
import logging
from typing import Awaitable, Callable

logger = logging.getLogger(__name__)


class PriceRefreshQueue:
    def __init__(
        self,
        refresh_fn: Callable[[str], Awaitable[None]],
        num_workers: int = 3,
    ) -> None:
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._refresh_fn = refresh_fn
        self._num_workers = num_workers
        self._tasks: list = []

    async def start(self) -> None:
        for i in range(self._num_workers):
            task = asyncio.create_task(self._worker(i), name=f"price-refresh-{i}")
            self._tasks.append(task)
        logger.info(f"[PriceRefreshQueue] {self._num_workers} workers started")

    async def stop(self) -> None:
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        logger.info("[PriceRefreshQueue] Workers stopped")

    async def enqueue(self, cache_key: str) -> None:
        await self._queue.put(cache_key)
        logger.debug(f"[PriceRefreshQueue] Enqueued '{cache_key}' (qsize={self._queue.qsize()})")

    async def _worker(self, worker_id: int) -> None:
        logger.info(f"[PriceRefreshQueue] Worker-{worker_id} ready")
        while True:
            cache_key = await self._queue.get()
            logger.debug(f"[PriceRefreshQueue] Worker-{worker_id} processing '{cache_key}'")
            try:
                await self._refresh_fn(cache_key)
            except Exception as exc:
                logger.error(
                    f"[PriceRefreshQueue] Worker-{worker_id} failed for '{cache_key}': {exc}"
                )
            finally:
                self._queue.task_done()
