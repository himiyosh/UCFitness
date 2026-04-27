## 2025-02-18 - Supabase `.in()` Batching Limits
**Learning:** When refactoring mapped `Promise.all` `.select()` queries into batched `.in()` queries to prevent N+1 issues in Supabase, using an unbounded array can lead to HTTP 414 URI Too Long errors and silent data truncation (due to PostgREST's default 1,000-row limit).
**Action:** Always wrap `.in()` queries in a loop that processes the array in smaller chunks (e.g., size 20) when the input array size is unbounded or potentially large.
