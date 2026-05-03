## 2024-05-18 - [Missing UUID Validation Leads to Supabase 500 Errors]
**Vulnerability:** Endpoints fetching via Supabase utilizing user-provided query parameters (like `userId` or `targetUserId`) lacked UUID format validation.
**Learning:** Supabase (PostgreSQL) throws an unhandled 500 Internal Server Error when it attempts to query a `uuid` column with a malformed string instead of a valid UUID, which could be utilized for DoS attacks or lead to ungraceful application failures.
**Prevention:** Always use the `isValidUUID` utility function from `@/lib/validation` to rigorously validate UUID query parameters before performing database operations in Next.js API Routes.
