# Safeguard Combined

## Referral Tracking Seed
1. Apply migrations:
   - Run `python backend/database/scripts/run_create.py` to apply schema updates (includes `alter_20260216_referral_tracking.sql`).
2. Load seed data:
   - Run `psql "$DATABASE_URL" -f backend/database/schema/seed_referral_users.sql`.
3. Verify in Admin UI:
   - Open `/admin` and confirm the "Recent Users" table shows:
    - `kol_fan` as "Referred? = Yes" with code `KOL30`.
    - `plain_user` as "Referred? = No".

## Database Connection Pool Optimization
*Modified by: Jack Liu*

### 1. Pain Points Before the Change
- **Poor Performance:** Every time the backend processed a database-related API request, it executed `psycopg2.connect()`, establishing a brand new TCP network connection and database authentication handshake. This added tens to hundreds of milliseconds of latency to each request.
- **Risk of Connection Exhaustion:** In high-concurrency scenarios (e.g., many users simultaneously viewing the Dashboard, fetching market data or news, or processing payments), each request consumed a database connection. This would quickly cause the database connection count to hit its limit (e.g., PostgreSQL's default of 100 connections), triggering a fatal "Too many connections" error and eventually causing the entire system to crash.
- **Resource Waste:** The frequent creation and destruction of connections heavily consumed server CPU and memory resources.

### 2. What Was Changed
1. **Added `backend/database/db_pool.py` module:**
   - Introduced `psycopg2.pool.ThreadedConnectionPool` to manage the connection pool.
   - Implemented global singleton pool initialization (`init_pool`) and methods for acquiring/releasing connections (`get_conn`, `release_conn`).
   - Provided a context manager `get_cursor()` to facilitate gradual code simplification in the future:
     - Defined a universal, reusable workflow for any code location: "borrow connection from pool -> create cursor and execute operations -> return connection to pool". The goal is to replace the independent connections (where a database connection is created once and closed at the end) in every API request with this reusable "borrow and return" workflow. This has not been fully applied yet because the existing code contains many custom calls, lengthy functions, complex conditional branches, and return logic, and blindly changing them might cause severe bugs.
     - However, for future new features, developers can simply use `from database.db_pool import get_cursor` to request a connection from the pool.
2. **Updated dependencies in `backend/requirements.txt`:**
   - Added `psycopg_pool` (to support modern connection pooling).
3. **Pre-warmed the connection pool on startup (`backend/application/main.py`):**
   - Called `init_pool()` within FastAPI's `@app.on_event("startup")` so that the underlying persistent database connections are established when the service starts.
4. **Refactored the direct connection logic for the first batch of high-frequency APIs:**
   - Replaced all `psycopg2.connect(os.getenv("DATABASE_URL"))` calls with acquiring a connection from the pool (`get_conn()`), and returning the connection to the pool using `release_conn(conn)` in the `finally` block instead of directly calling `close()`. The affected files are:
     - `backend/application/main.py`
     - `backend/presentation/routes.py`
     - `backend/database/scripts/user_auth.py` (`user_login` & `user_signup`)
     - `backend/database/scripts/user_preference.py`
     - `backend/database/scripts/data_request.py` (`get_curr_prices`, `get_social_posts`, `get_prices_for_training`, & `get_crypto_transactions`)
     - `backend/database/scripts/payment_operations.py`
     - `backend/application/clients/news_sentiment.py`
     - `backend/application/clients/government_client.py`
     - `backend/database/scripts/influencer_commission.py`

### 3. Purpose of Each Change and Future Benefits (Advantages of this Design)
- **Significantly Reduced Request Latency (Performance Improvement):**
  1. **Memory-resident, ready-to-use (Zero Latency):** Setting `maxconn` to 20 means these 20 connections are pre-established and kept "warm" in the pool. When a request comes in, a usable connection is taken directly from memory. This eliminates the TCP handshake and authentication time!
  2. **Extremely High Reusability (Lightning-fast Handoff):**
     - Request A gets a connection, executes a `SELECT`, and takes 2ms.
     - Request A finishes and immediately calls `release_conn()` to return it.
     - Less than 1 millisecond later, this connection is assigned to Request B, which is waiting in line. (The queuing logic is natively provided and managed by `psycopg2`'s `ThreadedConnectionPool`).
     - Result: A single connection can be cyclically reused by 100 different requests within one second!
  3. **Smooth Queue Buffering (Database Protection):** If 100 concurrent requests arrive instantly:
     - The first 20 requests instantly grab connections, execute at lightning speed, and return them.
     - The remaining 80 requests queue briefly in the application layer's memory (without being sent to the database).
     - Because execution is so fast (no network setup overhead), these 80 queued requests will quickly acquire returned connections, potentially within milliseconds to tens of milliseconds.
- **Enhanced System Stability (Preventing Database Connection Avalanches):** By setting `minconn` and `maxconn`, we can limit the number of concurrent TCP connections established between the application and the database. Even during traffic spikes, the database will not be overwhelmed; requests that cannot get a connection will queue up, ensuring that core business operations continue to run.
- **Unified Management and Reduced Maintenance Costs:** Decoupling the `db_pool.py` file allows us to control database connection behavior from a single entry point. If we ever need to switch to an asynchronous connection pool (like `asyncpg` or `SQLAlchemy`) in the future, we only need to make a smooth migration in this independent file, rather than modifying dozens of scattered API scripts. This lays an excellent foundation for future architectural upgrades.


## Price Data Multi-Level Caching & Refresh Queue
*Modified by: Blake Guo*

### 1. Pain Points Before the Change
- **Redundant External API Calls:** Every time a user requested price data (e.g., opening the Dashboard, viewing the market list, or checking a specific asset's summary), the backend made a live call to an external API (Polygon, TwelveData, Binance, Coingecko). This added hundreds of milliseconds of latency to every single request, with no reuse of previously fetched data whatsoever.
- **Risk of API Rate Limiting:** External price APIs enforce strict rate limits. Under moderate to high user concurrency (e.g., multiple users simultaneously opening market pages), the system would rapidly exhaust its API quota, triggering rate-limit errors and causing price data to become completely unavailable.
- **Duplicate Refresh Work:** If 50 users all queried BTC's price at the same moment and the cache was stale, the system would naively fire 50 simultaneous refresh requests to the external API — multiplying the load and wasting resources on identical work.

### 2. What Was Changed

1. **Added `backend/application/cache/price_cache.py` module:**
   - Implemented a **three-level (L1 → L2 → L3) cache hierarchy**:
     - **L1 (In-process memory):** A plain Python `dict` living inside each backend worker process. Provides sub-millisecond reads with zero network overhead — the fastest possible path.
     - **L2 (Redis):** A shared `redis:7-alpine` instance accessible by all backend workers. Survives individual worker restarts and ensures cache consistency across horizontally scaled processes.
     - **L3 (PostgreSQL `cache.price_snapshot`):** A persistent fallback table. Used during cold starts (e.g., after a full system restart) when both L1 and L2 are empty, preventing the system from blindly hitting the external API from scratch.
   - Defined TTLs per asset class: **crypto = 60s**, **stocks / forex / futures = 300s**, with a default of 120s. Redis stores data at **3× the stale TTL** to keep it available as a fallback buffer while a background refresh is in progress.
   - Implemented `claim_refresh(cache_key)` as an **atomic Redis lock** to guarantee that only one refresh task per asset can be in flight at any given time — preventing duplicate concurrent API calls for the same asset.
   - Implemented `release_refresh(cache_key)` to unlock the refresh slot in the `finally` block, ensuring the lock is always released regardless of success or failure.

2. **Added `backend/application/cache/price_queue.py` module:**
   - Implemented `PriceRefreshQueue` using `asyncio.Queue` to manage background price update tasks.
   - Spawns **3 concurrent worker coroutines** on startup, each independently pulling refresh tasks from the queue and executing them, allowing parallel refresh of multiple assets without blocking user-facing requests.
   - Enqueues tasks by `cache_key` (e.g., `market_list:crypto`, `market_summary:BTC:crypto:7`) — the queue holds **asset refresh tasks**, not user requests.

3. **Added `backend/database/schema/create_cache_schema.sql`:**
   - Created the `cache` schema and the `cache.price_snapshot` table with columns `cache_key (TEXT PRIMARY KEY)`, `asset_type (VARCHAR)`, `data (JSONB)`, and `last_updated_at (TIMESTAMPTZ)`.
   - Added an index on `last_updated_at DESC` to support efficient cold-start lookups.
   - This table is executed automatically on container startup via `backend/database/scripts/run_create.py`.

4. **Updated dependencies in `backend/requirements.txt`:**
   - Added `redis` and `aioredis` to support async Redis communication.

5. **Pre-warmed cache infrastructure on startup (`backend/application/main.py`):**
   - Called `price_cache.initialize()` within FastAPI's `@app.on_event("startup")` to establish the Redis connection before any request is served.
   - Called `refresh_queue.start()` to spawn the 3 background worker coroutines immediately at startup.
   - Implemented the unified helper `_cache_first(cache_key, asset_type, fetch_fn)` as the single entry point for all cache reads: it walks the L1 → L2 → L3 → direct API call chain and auto-enqueues a background refresh whenever stale data is detected.
   - Implemented `_refresh_price_fn(cache_key)` as the background refresh callback: it resolves the correct external API to call based on the cache key pattern, fetches fresh data, updates L1/L2, and persists the result to L3.

6. **Refactored price endpoints in `backend/presentation/routes.py`:**
   - `GET /prices/current` — now reads through the cache layer before querying the database.
   - `GET /api/market-list/{market}` — now uses `_cache_first()` with background refresh.
   - `GET /api/market-summary/{ticker}/{market}/{days}` — now uses `_cache_first()` with background refresh.

### 3. Purpose of Each Change and Future Benefits (Advantages of this Design)

- **Dramatically Reduced Request Latency:**
  1. **L1 sub-millisecond reads:** Once a price entry is loaded into the in-process dict, subsequent requests within the same worker return instantly — no Redis round-trip, no database query, no external API call.
  2. **L2 cross-worker consistency:** When a second worker receives a request for the same asset, it finds the data in Redis rather than re-fetching from the external API. The Redis lookup typically completes in under 1ms on the local Docker network.
  3. **Non-blocking stale returns:** If cached data has expired, the system immediately returns the last known (stale) price to the user and enqueues a background refresh task. The user never waits for the external API — they receive a response in milliseconds regardless.

- **Prevention of Duplicate Refresh:**
  - If 100 users simultaneously trigger a stale BTC price lookup, `claim_refresh("market_list:crypto")` ensures only the **first** worker acquires the refresh lock and enqueues a single update task. The remaining 99 requests all return the stale cached value instantly and do not enqueue additional tasks. This reduces 100 redundant API calls down to exactly 1.

- **Resilience Against External API Outages:**
  - Because L2 (Redis) stores data at 3× the stale TTL and L3 (PostgreSQL) retains the last known snapshot indefinitely, the system can continue serving price data even if the external API is completely down for an extended period. Users see slightly outdated prices rather than errors.