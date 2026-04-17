## 2025-02-14 - [CRITICAL] Prevent 500 Errors via Strict UUID Validation
**Vulnerability:** Supabase (PostgreSQL) throws an unhandled 500 Internal Server Error when an improperly formatted string is passed into a query expecting a UUID type (e.g. `userId` or `targetUserId` from query params).
**Learning:** This is a project-specific architecture pattern where API endpoints taking user IDs natively fail entirely rather than gracefully when attacked or provided malformed inputs, potentially creating DoS vectors or unhandled exceptions.
**Prevention:** All query parameters and external string inputs meant to represent UUIDs must be rigorously validated using `isValidUUID` from `@/lib/validation` before being passed to `supabaseAdmin` or `supabase` client.
