## 2024-05-24 - Missing Database Index on Range Query
**Learning:** The application performs heavy range queries on `daily_steps(date)` for leaderboard aggregation (Yearly, Monthly, etc.) but lacked an index on the `date` column. The existing `UNIQUE(user_id, date)` index does not support range queries on `date` alone.
**Action:** Always verify that columns used in `gte`, `lte`, or `between` filters have a supporting index, especially when the table is expected to grow linearly with time/users.
