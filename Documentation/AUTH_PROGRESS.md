# AUTH_PROGRESS.md - Phase 3-10 Status

## PHASE 3: PASSWORDS
- **COMPLETE** - bcrypt cost factor 12, 72-byte limit, 12-char minimum, common password blocklist, constant-time verification, dummy hash for unknown emails (backend/auth/tokens.ts, backend/routes/api.ts)

## PHASE 4: JWT + SESSIONS
- **COMPLETE** - HS256 access tokens (15 min), claims sub/role/sid/iat/exp/jti, algorithm pinning, 256-bit refresh tokens, SHA-256 storage, rotation with reuse detection, httpOnly cookies, Secure/SameSite=Lax, path-scoped refresh cookie, no tokens in JSON body (backend/auth/jwt.ts, backend/auth/sessions.ts, backend/auth/tokens.ts)

## PHASE 5: SECURE ALL APIs
- **COMPLETE** - Default-deny with public allowlist, RBAC via requireRole, owner_id filtering for IDOR protection (404 not 403), CSRF via X-Requested-With + Origin/Referer check, exact CORS allowlist, rate limiting (login 5/min, register 3/min, refresh 30/min), account lockout 15 min after 5 failures, security headers (helmet), Pydantic-like validation, global error handler, no sensitive logging, audit_events logging (backend/app.ts, backend/auth/deps.ts, backend/auth/rate-limit.ts, backend/routes/api.ts)

## PHASE 6: FRONTEND WIRING
- **PARTIAL** - Frontend exists in web/frontend/ but auth integration not verified (web/frontend/src/lib/session.tsx, web/frontend/src/pages/AuthPages.tsx)

## PHASE 7: TESTS
- **COMPLETE** - pytest-style tests cover register/login/logout, generic error, lockout, expired token, revoked session, refresh rotation + reuse detection, 401 on protected route, 403 on wrong role, 404 for IDOR, 73-byte password rejection (backend/tests/auth.test.ts)

## PHASE 8: FINISH
- **PARTIAL** - Migrations exist (4 files), tests pass, but docker-compose and startup commands need verification (backend/docker-compose.yml, backend/db/migrations/)

## PHASE 9: CODE QUALITY
- **COMPLETE** - Minimal diffs, no dead code, reused helpers, flat logic, no over-engineering, validation/error handling/auth checks preserved

## PHASE 10: FILE CLEANUP
- **MISSING** - No cleanup performed yet; .pgverify/ untracked, old SQLite files in backend/data/