## 2024-05-24 - Missing Database Index on Range Query
**Learning:** The application performs heavy range queries on `daily_steps(date)` for leaderboard aggregation (Yearly, Monthly, etc.) but lacked an index on the `date` column. The existing `UNIQUE(user_id, date)` index does not support range queries on `date` alone.
**Action:** Always verify that columns used in `gte`, `lte`, or `between` filters have a supporting index, especially when the table is expected to grow linearly with time/users.

## 2025-02-20 - Sequential Batch Updates & N+1 Queries
**Learning:** The cron job `updateAllUserSteps` was processing users sequentially using `for...of` and `await`, combined with an N+1 query pattern where user details were fetched individually inside the loop. This creates a linear performance degradation as the user base grows.
**Action:** Always fetch all required data in a single initial query (selecting specific columns) and use `Promise.all` to process independent records in parallel, especially for cron jobs.

## 2025-02-24 - Parallel N+1 Queries in Server Components
**Learning:** Even when using `Promise.all` to parallelize queries (e.g., fetching group details for a list of keywords), it still results in N separate database requests, which can saturate connections and increase latency.
**Action:** Replace parallel individual queries with a single bulk query (e.g., `.in('field', values)`) and use an in-memory Map to associate results back to the original list.
