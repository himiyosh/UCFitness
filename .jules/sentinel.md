## 2025-05-25 - Supabase UUID Type Input Validation
**Vulnerability:** API endpoints (e.g., `/api/user/follow/status`, `/api/user/achievement-progress`, `/api/user/step-calendar`, `/api/challenge`, `/api/reactions`) accept user IDs or group IDs as query parameters without validating their format.
**Learning:** Supabase (PostgreSQL) throws unhandled 500 Internal Server Error exceptions if an improperly formatted string is passed into a query expecting a UUID type. This crashes the endpoint and can potentially be used in denial-of-service or error-based reconnaissance.
**Prevention:** Always sanitize and validate UUID inputs using `isValidUUID` from `@/lib/validation` before passing them to the Supabase client to ensure graceful 400 responses instead of 500 errors.
