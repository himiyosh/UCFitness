## 2024-05-24 - Missing Database Index on Range Query
**Learning:** The application performs heavy range queries on `daily_steps(date)` for leaderboard aggregation (Yearly, Monthly, etc.) but lacked an index on the `date` column. The existing `UNIQUE(user_id, date)` index does not support range queries on `date` alone.
**Action:** Always verify that columns used in `gte`, `lte`, or `between` filters have a supporting index, especially when the table is expected to grow linearly with time/users.

## 2025-02-20 - Sequential Batch Updates & N+1 Queries
**Learning:** The cron job `updateAllUserSteps` was processing users sequentially using `for...of` and `await`, combined with an N+1 query pattern where user details were fetched individually inside the loop. This creates a linear performance degradation as the user base grows.
**Action:** Always fetch all required data in a single initial query (selecting specific columns) and use `Promise.all` to process independent records in parallel, especially for cron jobs.

## 2025-02-24 - Parallel N+1 Queries in Server Components
**Learning:** Even when using `Promise.all` to parallelize queries (e.g., fetching group details for a list of keywords), it still results in N separate database requests, which can saturate connections and increase latency.
**Action:** Replace parallel individual queries with a single bulk query (e.g., `.in('field', values)`) and use an in-memory Map to associate results back to the original list.

## 2025-02-25 - N+1 Queries in Complex Aggregations
**Learning:** The dashboard was fetching group rankings by iterating through group IDs and executing a complex aggregation query for each. Although parallelized with `Promise.all`, this resulted in N+1 (actually 2N+1) database calls, scaling poorly with the number of groups a user belongs to.
**Action:** Implement "Batch Aggregation" functions that accept a list of IDs (e.g., `getBatchGroupRankings(groupIds)`), fetch all related raw data in constant queries (using `.in()`), and perform the grouping and aggregation in memory.

## 2025-05-24 - Payload Bloat from Table Joins
**Learning:** Joining `users` in `daily_steps` queries (`users!inner`) caused user profile data to be repeated for every single daily step record, massively bloating the JSON response size from Supabase.
**Action:** For large time-series datasets linked to static entities, fetch the time-series data (IDs only) and entities (User Profiles) in two separate queries, then join in memory to reduce network payload.

## 2025-05-25 - Expensive Global Aggregations in Dynamic Pages
**Learning:** The main dashboard (`app/page.tsx`) is set to `force-dynamic`, causing the expensive `getAllRankings('GLOBAL')` function (which aggregates 365 days of steps for all users) to run on every single request.
**Action:** Wrap expensive global aggregations in `unstable_cache` (with a short revalidation time, e.g., 60s) to decouple data freshness from page rendering strategy. This allows the page to be dynamic (for user-specific data) while serving cached global data.

## 2025-05-26 - In-Memory Derivation from Cached Globals
**Learning:** The dashboard was fetching group rankings using `getBatchGroupRankings` which executed a heavy range query on `daily_steps` for all group members on every request (due to `force-dynamic`). However, the global rankings (containing all users' aggregated data) were already fetched and cached.
**Action:** Implemented `deriveBatchGroupRankings` to reuse the cached global data. This eliminates the need for redundant `daily_steps` queries, replacing them with a much lighter in-memory pivot and a small query to fetch group membership and missing (0-step) users.

## 2025-05-27 - Uncached Global Aggregation in Dynamic Page
**Learning:** `getCombinedGroupCompetitionRankings` was performing a heavy aggregation of all daily steps for all users for the entire year on every request because `page.tsx` is `force-dynamic`. This duplicated the cost of `getAllRankings` but for a different view (Group Competition).
**Action:** Wrapped the function in `unstable_cache` with a 60-second revalidation. This allows the expensive aggregation to be shared across all users and requests, reducing database load from O(Requests) to O(1) per minute.
