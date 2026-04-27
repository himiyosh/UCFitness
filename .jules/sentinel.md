## 2026-04-27 - [Add UUID Validation to Reactions DELETE Route]
**Vulnerability:** Missing UUIDv4 validation for `toUserId` query parameter in DELETE method of `app/api/reactions/route.ts`.
**Learning:** Supabase (PostgreSQL) throws unhandled 500 Internal Server Error exceptions if an improperly formatted string is passed into a query expecting a UUID type. This could lead to a Denial of Service (DoS) if heavily hit.
**Prevention:** Always sanitize and validate UUID inputs (e.g., using `isValidUUID` from `lib/validation`) before passing them to the database client to ensure graceful failures.
