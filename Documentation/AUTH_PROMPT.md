ROLE: Senior backend security engineer. Replace SQLite with PostgreSQL and implement secure authentication for PenflowAI. Do NOT touch the frontend design, the scan engine modules (agent/, scope_guard/, roe_validation/, tools/, risk_scoring/, reporting/) or any business logic. Do not build features beyond what is listed.

OUTPUT RULES: Edit in place with minimal diffs. No explanations, no code comments, no placeholder/TODO/dummy code, no unused deps. Reply only with: changed/created files, and commands I must run. Ask no questions; pick the simplest secure option.

1) STRUCTURE
- Inspect the existing API (web/backend_api/) and keep its framework. If it's unclear, use FastAPI.
- Move it into a top-level backend/ folder so there is ONE API. web/ keeps only the frontend. Fix imports, scripts and README paths.
- backend/ layout: app/{main.py, config.py, db.py, models/, schemas/, auth/{security.py, deps.py, routes.py}, routes/, middleware/}, alembic/, tests/.
- docker-compose.yml with postgres:16 (named volume, healthcheck, port bound to 127.0.0.1 only). Update .env.example with DATABASE_URL, JWT_SECRET, ACCESS_TTL_MIN=15, REFRESH_TTL_DAYS=7, CORS_ORIGINS, COOKIE_SECURE. Real secrets never committed; .env in .gitignore. App refuses to start if JWT_SECRET is missing or shorter than 32 bytes.

2) DATABASE
- SQLAlchemy 2.0 + Alembic + psycopg 3 driver. Replace every SQLite usage. Port existing tables to models, then generate one Alembic migration. Add a one-time scripts/migrate_sqlite_to_postgres.py only if existing data is found.
- Use UUID primary keys and timestamptz columns. Add indexes on users.email and sessions.token_hash. Parameterized queries only, no raw SQL string building.
- Auth tables: users(id, email unique lowercase, password_hash, role, is_active, failed_attempts, locked_until, created_at), sessions(id, user_id, refresh_token_hash, user_agent, ip, created_at, expires_at, revoked_at, replaced_by), audit_events(id, user_id nullable, event, ip, user_agent, created_at).
- Roles: requester (default), reviewer, admin.
- Keep SQLite only for the pytest test DB.

3) PASSWORDS
- Use the bcrypt library directly (not passlib), cost factor 12.
- Bcrypt only reads 72 bytes, so reject passwords over 72 bytes. Minimum 12 characters. Reject the top common passwords with a small bundled blocklist.
- Constant-time verification. Run a dummy hash when the email doesn't exist, so response timing doesn't reveal valid emails.

4) JWT + SESSIONS
- Access token: JWT HS256, 15 min, claims sub, role, sid, iat, exp, jti. Validate exp, sub and sid on every request, and pin the algorithm list (never accept "none").
- Refresh token: 256-bit random from secrets.token_urlsafe, stored only as a SHA-256 hash in sessions. Rotate on every refresh. If an already-rotated token is reused, revoke the whole session family and log it (theft detection).
- Deliver both in httpOnly cookies, Secure (configurable for local dev), SameSite=Lax, path-scoped (refresh cookie path = /auth/refresh). Never return tokens in a JSON body and never use localStorage.
- Endpoints: POST /auth/register, /auth/login, /auth/refresh, /auth/logout, /auth/logout-all; GET /auth/me; GET /auth/sessions (list my active sessions) and DELETE /auth/sessions/{id}.
- Logout revokes the session in the DB immediately. Access tokens are checked against the session's revoked_at, so a revoked session dies at once.
- Idle timeout 30 min and absolute session lifetime 7 days.

5) SECURE ALL APIs
- Default-deny: a global dependency/middleware requires a valid access token on every route. Only an explicit allowlist is public: /auth/register, /auth/login, /auth/refresh, /health.
- RBAC dependency require_role(...). Admin and reviewer routes (ROE review queue, user management) are role-gated. Every query on user-owned resources (targets, runs, reports, ROE documents) filters by owner_id, so there is no IDOR. Return 404, not 403, for other users' resources.
- CSRF: cookies are SameSite=Lax, and every state-changing request must also carry a custom X-Requested-With header plus an Origin/Referer check against CORS_ORIGINS.
- CORS: exact origin allowlist from env (http://127.0.0.1:5173, http://localhost:5173 in dev), allow_credentials=True, never "*".
- Rate limiting: login 5/min per IP+email, register 3/min per IP, refresh 30/min. Account lockout for 15 min after 5 failed logins. Return the same generic error for every login failure.
- Security headers middleware: X-Content-Type-Options, X-Frame-Options DENY, Referrer-Policy, Strict-Transport-Security, a restrictive Content-Security-Policy for API responses, Cache-Control: no-store on /auth/*.
- Pydantic validation on every request body, with strict types and max lengths. Global exception handler that never leaks stack traces or SQL errors. Request body size limit.
- Never log passwords, tokens or cookies. Log auth events (login success/fail, lockout, refresh reuse, logout, role denial) into audit_events.

6) FRONTEND WIRING (minimum only)
- Point the existing login/register/logout calls to the new endpoints with fetch credentials:"include" and the X-Requested-With header. On a 401, try /auth/refresh once and retry, then redirect to login. Keep all existing UI and styling unchanged.

7) TESTS (pytest, brief)
Cover: register/login/logout flow, wrong-password generic error, lockout, expired token, revoked session rejected, refresh rotation + reuse detection, unauthenticated request to a protected route = 401, wrong role = 403, IDOR returns 404, 73-byte password rejected.

8) FINISH
Run migrations, tests and lint once and fix errors. Output the commands to start Postgres and the API.

CODE QUALITY
- Write the smallest correct solution. No dead code, unused imports, unused variables, unused functions, commented-out code, debug prints, or speculative "future use" abstractions.
- Reuse existing helpers, components and utilities before writing new ones. No duplicated logic: extract it once.
- One responsibility per function/module. Prefer simple, flat, readable logic over clever one-liners. No over-engineering (no extra classes, layers or config for a single use).
- Never remove input validation, error handling, auth checks, security headers, rate limits or tests to save lines. Those are required code, not extra code.
- Do not rewrite or reformat code outside the scope of this task. Minimal diffs only.

FILE CLEANUP (strict, safe)
- Delete ONLY files that you created during this task and that are now unused (temp scripts, scratch files, duplicate or superseded files, generated logs, empty folders you made).
- Before deleting any file, confirm it is unused by searching the whole repo for imports and references. If anything references it, keep it.
- NEVER delete or modify: .env, .env.example, .git, .gitignore, migrations, lockfiles, node_modules contents, user data, Documentation/, README.md, LICENSE, trained models (.pkl), sample or training data, or any file that existed before this task, unless I name it explicitly.
- If a pre-existing file looks unused, do NOT delete it. List it under "Suspected unused" for me to decide.
- Remove dependencies from requirements.txt / package.json only if you added them in this task and ended up not using them.