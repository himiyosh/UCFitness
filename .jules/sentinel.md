
## 2024-05-18 - [PostgREST UUID Type Enforcement & 500 Errors]
**Vulnerability:** Supabase (PostgREST) throws unhandled 500 Internal Server Error exceptions when an improperly formatted string is passed into a query expecting a UUID type. This can cause application crashes or reveal internal stack behavior if not caught properly.
**Learning:** PostgREST strictly enforces Postgres column types before executing queries. Passing a non-UUID string to a `.eq('user_id', invalidId)` call breaks the request rather than safely returning 0 rows.
**Prevention:** Always validate UUID input using `isValidUUID` from `@/lib/validation` before using it in Supabase/PostgREST queries to ensure graceful, safe failure.
