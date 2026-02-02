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

## 2025-05-24 - N+1 Queries in Badge Assignment
**Learning:** The badge assignment job was processing users one-by-one, performing 4+ queries per user (fetching goals, steps history, aggregates). For 1000 users, this would result in 4000+ database calls.
**Action:** Implement batch processing (e.g., chunk size 10-50). Fetch shared data (goals, step history) for the entire batch in 1-2 bulk queries, then perform logic in-memory using Maps. This reduces queries from O(N) to O(N/BatchSize).
