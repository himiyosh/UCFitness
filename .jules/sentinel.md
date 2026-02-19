## 2024-05-23 - Insecure Debug Endpoints Exposed

**Vulnerability:** Found `app/api/debug/cleanup-users/route.ts` which allowed unauthenticated mass deletion of users, and `app/api/debug/fitbit-check/route.ts` which leaked sensitive user tokens and allowed unauthorized Fitbit API queries.
**Learning:** Debug utilities placed in the `app/api` directory become public endpoints by default in Next.js, creating critical backdoors if not protected or removed.
**Prevention:** Keep administrative scripts in a separate `scripts/` directory (run via CLI) or ensure any `debug` API routes are strictly protected by admin authentication or disabled in production (`process.env.NODE_ENV !== 'production'`).

## 2024-05-23 - Unvalidated File Uploads

**Vulnerability:** `app/api/upload/group/route.ts` allowed uploading files with arbitrary extensions and MIME types, and accepted user-controlled strings for directory paths.
**Learning:** Trusting client-side `file.type` and `file.name` allows Stored XSS (uploading HTML as images) and potentially Path Traversal if directory components are not sanitized.
**Prevention:** Strictly validate `file.type` against a server-side whitelist (e.g., `image/png`, `image/jpeg`), enforce file size limits, and regenerate filenames using random IDs or strict sanitization to avoid traversal.

## 2026-01-24 - Critical Token Exposure Fixed

**Vulnerability:** The `users` table was publicly readable (`SELECT *`) via a broad RLS policy, exposing sensitive `access_token` and `refresh_token` columns to any client-side request.
**Learning:** Postgres Row Level Security (RLS) policies (`USING (true)`) grant access to the entire row by default. Restricting column access requires explicit `REVOKE SELECT` on the table and `GRANT SELECT (columns)` on specific columns.
**Prevention:** Always verify which columns are exposed by `SELECT *` when creating public tables. Use Column Level Privileges to whitelist safe columns (`id`, `name`, `username`, `image`, `step_goal`) and keep sensitive tokens strictly server-side.

## 2026-01-25 - Unprotected Notification Endpoint

**Vulnerability:** `app/api/notify-teams/route.ts` was a public GET endpoint that triggered external Teams notifications without authentication. This allowed unauthenticated users to spam the Teams channel (DoS/Annoyance) by repeatedly calling the endpoint.
**Learning:** API routes that trigger side effects (emails, notifications, DB writes) must always be protected, even if they are "internal" cron jobs. Security through obscurity (hidden URL) is not sufficient.
**Prevention:** Enforce authentication on all API routes. For cron jobs, require a shared secret (e.g., `CRON_SECRET`) in the Authorization header.

## 2026-01-28 - Prevent Account Pre-Squatting in Setup

**Vulnerability:** `app/api/user/setup/route.ts` allowed any authenticated user to change their email address to any unregistered email. An attacker could claim a victim's email before the victim signed up, causing the victim to be logged into the attacker's account upon their first login.
**Learning:** Allowing email changes without verification (magic link/OTP) is dangerous, especially when the system relies on email for account linking/recovery. Trusted emails from providers should not be mutable to arbitrary values.
**Prevention:** Restrict email updates to only users with temporary/placeholder emails (e.g., `@pending.setup`). Verified emails from providers should be immutable or require strong verification to change.

## 2026-01-30 - Missing Input Validation on Group Creation
**Vulnerability:** `app/api/user/group/route.ts` allowed creating groups with any string as a keyword (including `<script>` tags or overly long strings), leading to potential Stored XSS or data integrity issues.
**Learning:** Assuming that "if it's not in the database, create it" is safe ignores the validity of the input itself. Also, retroactive validation breaks existing data, so validation must be applied at the point of creation (ingestion) to be safe without migration.
**Prevention:** Always validate input format (length, allowed characters) *before* checking database existence or inserting. Use strictly defined schemas for identifiers (slugs).

## 2026-02-12 - Privacy Leak in User Search
**Vulnerability:** `app/api/user/search/route.ts` returned the `email` field for all users found in search results. This allowed any authenticated user to harvest email addresses by searching for usernames (or partial usernames).
**Learning:** `SELECT *` or overly broad field selection in API responses is a common source of PII leaks. APIs should only return the minimum data necessary for the UI (Principle of Least Privilege/Data Minimization).
**Prevention:** Explicitly select only public fields (id, name, username, image) in Supabase queries destined for public or semi-public responses. Never include email, tokens, or PII unless strictly required and authorized.

## 2026-03-05 - PostgREST Filter Injection in Search
**Vulnerability:** `app/api/user/search/route.ts` directly interpolated user input into a Supabase `.or()` clause without sanitization, allowing potential filter injection by using characters like `,`, `(`, and `)`.
**Learning:** PostgREST (and Supabase) filter strings use specific characters for logic delimiters. Interpolating raw strings into complex filters like `.or()` is risky even if `select` limits columns, as it can alter the query logic.
**Prevention:** Always sanitize user input intended for PostgREST filter strings by removing control characters (`,`, `(`, `)`) or using parameterized queries/RPCs where possible (though Supabase JS client handles basic values, complex filter strings are raw text).

## 2026-02-14 - Missing Group Metadata Validation
**Vulnerability:** `app/api/user/group/route.ts` validated unique group keywords but failed to validate group names (length) and image URLs (protocol). This allowed creation of groups with excessively long names (DoS/UI break) or potentially malicious image URLs.
**Learning:** Partial validation is dangerous. Validating the "key" (keyword) but not the "value" (name, metadata) leaves the application exposed. All user inputs, especially those stored and displayed to other users, must be validated.
**Prevention:** Implement comprehensive input validation for all fields in a request payload, not just the unique identifiers. Use strict length limits and protocol allowlists for URLs.

## 2025-05-18 - File Extension Spoofing in Uploads
**Vulnerability:** `app/api/upload/group/route.ts` used the user-provided filename extension to determine the file type, allowing attackers to upload malicious files (e.g., `.php`) with a valid image MIME type.
**Learning:** Never trust `file.name` for determining file type or extension, as it is completely client-controlled.
**Prevention:** Always derive the file extension from the validated MIME type on the server side.

## 2026-05-24 - Unrestricted Group Invites
**Vulnerability:** `app/api/user/group/route.ts` allowed group owners to forcibly add any user to their group without the user's consent or prior relationship. This created a potential for spam and harassment.
**Learning:** Authorization checks often focus on the *initiator's* permissions (e.g., "Is this user the owner?"), but fail to consider the *recipient's* consent. Actions that modify another user's state (like group membership) require mutual agreement or a trust relationship.
**Prevention:** Enforce a trust relationship check (e.g., "Does the target user follow the initiator?") before allowing unilateral actions like invites.

## 2026-06-25 - Authorization Bypass in Private Group Join
**Vulnerability:** `app/api/user/group/route.ts` allowed any authenticated user to join a private group (`is_public: false`) simply by knowing its keyword, bypassing the invite-only restriction.
**Learning:** Checks for resource existence often miss state-dependent authorization rules (e.g., "Group exists" vs "Group exists AND is joinable"). Relying on "secret" identifiers (keywords) is not security; if the ID leaks, the resource is exposed.
**Prevention:** Explicitly check the state of the resource (`is_public`) and enforce access control policies (must be member/invited) before allowing actions like "join".
