# Security Fixes Applied

Summary of security-related changes made to the backend.

## Critical

1. **JWT secret** – Signup and Socket.IO now use `getJwtSecret()` from `config/env.js`, which throws in production if `JWT_SECRET` is missing or is the default. No fallback to `dev-secret-key` in production.

2. **XSS in Instagram OAuth callback** – Query params `code` and `error` are HTML-escaped and length-limited before being used in the response. Safe string is used for the message; raw params are not interpolated into HTML.

3. **Password strength** – New helper `validatePasswordStrength()` enforces: length 8–128, at least one uppercase, one lowercase, one number, one special character. Used in signup and reset-password.

4. **Rate limiting on public signal** – `GET /api/v1/dining-lists/signal/:restaurantId` uses `publicSignalLimiter` (60 requests/minute per IP) to limit enumeration.

## High

5. **Admin checkins/ratings** – `GET /admin/checkins` and `GET /admin/ratings` now require `requireAdmin` (were previously any authenticated user).

6. **Admin search length** – User/restaurant search query string is trimmed and capped at 200 characters to avoid abuse.

7. **matching_radius_miles** – Invalid or out-of-range values now return 400 with a clear message instead of silently defaulting to 1.5.

8. **DEV_RETURN_RESET_TOKEN** – Reset token is only returned in the JSON response when `NODE_ENV !== 'production'` and `DEV_RETURN_RESET_TOKEN === 'true'`.

9. **File upload** – Multer `fileFilter` uses `AppError` for consistent handling; validation allows only image MIME types and common image extensions (JPEG, PNG, GIF).

10. **Admin role assignment** – Create/update user only accept roles from an allowlist (`user`, `admin`, `restaurant`); raw body `role` is sanitized to this list.

## Medium

11. **Database query timeout** – `config/database.js` wraps queries in `Promise.race` with a timeout (default 30s, overridable via `DB_QUERY_TIMEOUT_MS`).

12. **Portals API URL** – Removed hardcoded production IP. Portal uses current page protocol and hostname for the API base URL (HTTPS when the portal is served over HTTPS).

## Other

- **Login logging** – Removed `console.log` of email and password check results to avoid logging sensitive data.

## Not changed (by design or deferred)

- **Reset token in URL** – Portal still reads `token` from the query string once for the reset-password form, then uses `replaceState` to remove it. The actual reset is sent via POST body. Moving to a POST-only flow would require a different email flow (e.g. one-time link that posts to the portal).
- **CORS** – Already configured in `server.js`; verify allowed origins for your deployment.
- **Generic 500 messages** – Controllers still throw `AppError` with messages; ensure your error handler does not leak stack traces or internals to clients in production.
