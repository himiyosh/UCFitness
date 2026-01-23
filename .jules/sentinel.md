## 2024-05-23 - Insecure Debug Endpoints Exposed

**Vulnerability:** Found `app/api/debug/cleanup-users/route.ts` which allowed unauthenticated mass deletion of users, and `app/api/debug/fitbit-check/route.ts` which leaked sensitive user tokens and allowed unauthorized Fitbit API queries.
**Learning:** Debug utilities placed in the `app/api` directory become public endpoints by default in Next.js, creating critical backdoors if not protected or removed.
**Prevention:** Keep administrative scripts in a separate `scripts/` directory (run via CLI) or ensure any `debug` API routes are strictly protected by admin authentication or disabled in production (`process.env.NODE_ENV !== 'production'`).

## 2024-05-23 - Unvalidated File Uploads

**Vulnerability:** `app/api/upload/group/route.ts` allowed uploading files with arbitrary extensions and MIME types, and accepted user-controlled strings for directory paths.
**Learning:** Trusting client-side `file.type` and `file.name` allows Stored XSS (uploading HTML as images) and potentially Path Traversal if directory components are not sanitized.
**Prevention:** Strictly validate `file.type` against a server-side whitelist (e.g., `image/png`, `image/jpeg`), enforce file size limits, and regenerate filenames using random IDs or strict sanitization to avoid traversal.
