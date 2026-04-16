## 2025-02-28 - Missing UUID validation in API routes
**Vulnerability:** Supabase API endpoints accepting user IDs via URL parameters (`/api/user/step-calendar`, `/api/user/achievement-progress`, `/api/user/follow/status`) were passing unsanitized input directly into Supabase client database queries.
**Learning:** Supabase (PostgreSQL) throws an unhandled 500 Internal Server Error when querying UUID columns with improperly formatted string values. This leads to information leakage and potential injection vulnerabilities, and breaks the app securely.
**Prevention:** Always validate that query parameters intending to be used as UUIDs are strictly validated using a Regex or the built-in `isValidUUID` from `@/lib/validation` *before* passing them to any Supabase function.
