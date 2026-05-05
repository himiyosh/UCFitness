
## 2024-05-05 - UUID Validation for Query Parameters
**Vulnerability:** API endpoints relying on query parameters for UUIDs (`userId`, `targetUserId`) passed the values directly into Supabase queries without validating their format.
**Learning:** If an improperly formatted string is passed to a query expecting a UUID type, Supabase (PostgreSQL) throws an unhandled 500 Internal Server Error exception, which can be used to cause a Denial of Service or reveal implementation details via stack traces in different contexts.
**Prevention:** Always sanitize and strictly validate UUID inputs from query parameters using utilities like `isValidUUID` before passing them to the database client to ensure graceful failures (e.g., returning a 400 Bad Request instead of 500).
