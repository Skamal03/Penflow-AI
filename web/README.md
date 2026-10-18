# PenflowAI Web Application

This folder contains the early-access website and the authenticated web application. It is a disposable Node.js BFF for the eventual Python engine. The API keeps the replaceable engine-facing shapes (`/api/runs/:id`, `/api/findings`, and `/api/audit`) separate from the React frontend. The Python engine remains the intended source of truth; this API is not the engine.

## Run locally

Requirements: Node.js 22 and npm.

```powershell
cd web
npm install
npm run db:reset
npm run dev
```

The API listens on `http://127.0.0.1:4000`; Vite serves the UI at `http://127.0.0.1:5173` and proxies `/api` to the API. The database is created, migrated, and deterministically seeded automatically on the first API start. `npm run db:reset` intentionally deletes and recreates `server/data/penflow.db`, then prints a row count for every table.

```powershell
npm run typecheck
npm run build
```

Set `VITE_DEV_ROLE_SWITCH=true` in the environment before `npm run dev` to show the explicitly labelled development role control. It reissues a real database session for a seeded user. The endpoint returns 404 in production. Do not set the flag in production.

## Seeded accounts

All five accounts share the development password `Penflow!2026`.

| Email | Person / role | What the account can access |
|---|---|---|
| `requester@penflow.test` | Ayesha Khan, requester | Own targets, four ROE records, two seeded runs, eight findings, report, billing and settings. This is the golden-path account. |
| `requester2@penflow.test` | Bilal Ahmed, requester | Only Bilal's target and approved ROE. It has no access to Ayesha's runs or reports; requesting `run_02` returns 404. |
| `reviewer@penflow.test` | Sana Malik, reviewer | Review queue and ROE decision workflow. Requester-only views and administrator screens are denied. |
| `admin@penflow.test` | Administrator | Review queue, users, tools, models, and global audit log. |
| `pending@penflow.test` | Unverified requester | Own account and requester views; email verification is pending. Verification links are written to the server log in development. |

## What is real

- Sign-up, bcrypt password hashing, database-backed HTTP-only sessions, 12-hour sliding expiry, logout, CSRF checks, login throttling, and server-side role checks.
- SQLite migrations, deterministic seed data, user-owned data queries, the run/approved-ROE database constraint, and audit records.
- Target records and DNS TXT ownership challenges. New targets remain pending until the server resolves the challenge record; restricted targets are blocked.
- Bounded PDF/DOCX ROE uploads stored outside the web root, requester ownership checks, reviewer decisions, and scope-token gating.
- Pricing data served from `server/seed/plans.ts`, waitlist submission, and pending plan-change/cancellation requests. No charge is made.

## What is simulated

- Run execution, progress, and the seeded audit timeline. No network scan is sent by the web application.
- Findings, risk scores, threat-intelligence labels, and the example report. They are authored demonstration records, not fresh output from Juice Shop or DVWA.
- Report generation. The viewer renders the seeded Markdown safely as text and headings.
- Verification email and password reset email delivery. Development links are printed to the API log.

## Deliberately absent

- The Python testing engine, external CVE/KEV lookups, AI model calls, live scan execution, and malware scanning of uploaded documents.
- Email transport, MFA, checkout, payment collection, invoices, and subscription activation.
- Production hosting details, a registered business identity, production support/security email addresses, and a production retention policy.

Do not upload sensitive or production authorization documents to this local demonstration. Legal pages are drafts and must be reviewed before publication. The interface is dark-only by design; it has no light theme, third-party trackers, external scripts, or remotely loaded fonts.

## Routes and role requirements

| Route group | Role |
|---|---|
| Public pages (`/`, `/how-it-works`, `/features`, `/pricing`, `/waitlist`, `/about`, `/contact`, `/security`, `/accessibility`) | Public |
| Legal pages (`/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/refunds`, `/legal/acceptable-use`) | Public |
| Authentication (`/signup`, `/login`, `/reset-password`, `/verify-email`) | Public |
| `/app/dashboard`, `/app/targets`, `/app/targets/new`, `/app/roe/new`, `/app/roe/:id`, `/app/runs`, `/app/runs/:id`, `/app/findings/:runId`, `/app/reports`, `/app/reports/:id`, `/app/billing` | Requester |
| `/app/settings` | Any authenticated role |
| `/admin/review-queue` | Reviewer or admin |
| `/admin/users`, `/admin/tools`, `/admin/models`, `/admin/audit-log` | Admin |

Unknown routes render a 404. Wrong-role routes render an access-denied page instead of silently redirecting.
