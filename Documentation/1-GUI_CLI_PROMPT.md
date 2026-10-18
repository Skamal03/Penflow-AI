# Build task — PenflowAI SaaS web application (v1)

You are building the complete PenflowAI website and authenticated web application from scratch, in a **new folder `web/`** at the root of this repository. Nothing exists yet except documentation. Build the whole thing: public marketing site, legal pages, authentication, role-based authorisation, the full application GUI, an admin area, and a pricing/subscription page.

Read these files first, in this order, before writing any code:

1. `README.md` — what the product is, the pipeline, the vocabulary
2. `SRS_PenflowAI.md` — requirements (Section 3.9 is yours), glossary
3. `WEBSITE_GUI.md` — **the authoritative spec** for routes, roles, screens, accessibility, legal and pricing
4. `WEBSITE_LEGAL_PAGES.md` — the policy text you must render
5. `WEB_UI_BUILD_PLAN.md` — the TypeScript data contract for findings, ROE, runs, audit
6. `Penflow_data.docx` — executive summary/introduction and the pricing table you must reproduce (section 8 below reproduces it, so you do not strictly need to open the file)

Where this prompt contradicts those documents, **this prompt wins**. The differences are listed in section 12.

---

## 1. Definition of done

- `cd web && npm install && npm run dev` starts the API and the frontend together, on a clean machine, with no manual database setup.
- The SQLite database is created, migrated and seeded automatically on first run.
- Every route in section 7 exists, renders, and is reachable by keyboard.
- Sign-up, login, logout, role-gating and per-user data isolation genuinely work against the database — not a fake "logged in" flag in React state.
- No default Vite branding anywhere. No purple, pink, violet or magenta. No gradients.
- `npm run build` and `npm run typecheck` pass.
- A visitor who has never seen the project can log in as the three seeded roles and understand the product in under two minutes, without opening DevTools.

## 2. Stack (fixed — do not substitute)

- **Frontend:** Vite + React 18 + TypeScript + React Router v6. Plain CSS with design tokens (CSS custom properties). No Tailwind, no component library, no UI kit — the visual identity is bespoke.
- **Backend:** Node 22 + Express + TypeScript, run with `tsx` in development. The API lives in `web/server/`.
- **Database:** SQLite via `better-sqlite3`, file at `web/server/data/penflow.db`, schema and seed as versioned SQL/TS migration files so a later move to PostgreSQL touches one layer.
- **Auth:** `bcryptjs` for password hashing, server-side sessions stored in SQLite, `httpOnly` cookie. No JWT in localStorage.
- **Non-negotiable reason for Node:** this machine has no working Python. The Python engine in the SRS is still the eventual source of truth; this API is a thin, disposable BFF that must expose the same shape (`/runs/:id`, `/findings`, `/audit`) so the engine can replace it. Say this in `web/README.md`.

### Folder layout

```
web/
├── package.json                 # workspaces: frontend, server
├── README.md                    # how to run, seeded logins, what is real vs simulated
├── frontend/
│   ├── index.html               # own <title>, own favicon, no Vite markup
│   ├── vite.config.ts           # proxy /api -> http://127.0.0.1:4000
│   └── src/
│       ├── main.tsx  router.tsx
│       ├── pages/               # public/ legal/ auth/ app/ admin/
│       ├── components/          # Button, Field, Checkbox, Select, Table, Badge,
│       │                        # Alert, EmptyState, StageTracker, RiskScore,
│       │                        # LogViewer, AppShell, SiteHeader, SiteFooter, SkipLink
│       ├── lib/api.ts           # the ONLY place that calls fetch
│       ├── lib/session.tsx      # session context
│       ├── lib/types.ts         # mirrors the server contract
│       └── styles/tokens.css global.css
└── server/
    ├── index.ts                 # express app, cookie sessions, CSRF
    ├── db/                      # connection, migrations, seed
    ├── routes/                  # auth, targets, roe, review, runs, findings,
    │                            # reports, audit, plans, me, admin
    └── seed/                    # authored demo data (see section 6)
```

## 3. Branding

- Wordmark: **penflow** in lowercase, weight 600, tight letter-spacing, plus a small square glyph made of CSS (two offset strokes / a bracket motif), not an image you have to source.
- `<title>` per page: `Dashboard · PenflowAI`. Root: `PenflowAI — AI-orchestrated web penetration testing`.
- Replace `public/vite.svg` with your own `favicon.svg` and delete it from `index.html`. Delete the default counter demo, `App.css`, and React/Vite logos from the repo. **Nothing in the UI may say "Vite", "React", "powered by" or show a framework logo.**
- Tone: precise, technical, calm. Short sentences. No exclamation marks. No marketing hype words.

## 4. Colour and visual direction (hard constraints)

Black, grey, and **one** acid accent. That is the whole palette.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0A0A0B` | page background |
| `--surface` | `#121214` | cards, panels, table rows |
| `--surface-raised` | `#191A1C` | popovers, modals, hover rows |
| `--border` | `#2A2B2F` | 1px hairlines, table rules |
| `--border-strong` | `#3A3B40` | focused input borders |
| `--text` | `#F4F4F5` | primary text |
| `--text-muted` | `#A0A1A7` | secondary text, labels |
| `--text-faint` | `#6C6D74` | timestamps, metadata |
| `--accent` | `#C6F24E` | primary button fill, focus ring, active nav, "approved/verified" |
| `--accent-ink` | `#0A0A0B` | text on top of accent |
| `--danger` | `#FF5C5C` | critical severity, blocked actions, destructive buttons |
| `--warning` | `#FFB020` | high severity, "needs review", warnings |
| `--link` | `#6F9BFF` | **inline link text only** |

Rules you must follow:

- **Blue is text only.** `--link` may never fill a button, border, badge, chart, icon, gradient or background.
- **No purple, violet, magenta or pink anywhere** — not in charts, avatars, hover states, focus glow or severity colours.
- No gradients, no glassmorphism, no neon glows, no drop shadows larger than `0 8px 24px rgba(0,0,0,.5)`. Depth comes from 1px borders and surface steps.
- Medium and low severity are **grey**, not coloured (`#B9BBC2` and `#7A7C84`). Only critical (red) and high (amber) carry chroma. Never encode meaning in colour alone — every badge has text.
- No rainbow charts. A single-series bar/sparkline uses `--accent` at 100%/40% opacity steps.
- Palette is dark only. Do not build a light theme; document the decision.
- Type: `@fontsource/ibm-plex-sans` and `@fontsource/ibm-plex-mono`, self-hosted via npm (no Google Fonts — `WEBSITE_GUI.md` §8.7). Mono for logs, IDs, hashes, timestamps, scores.
- Radius: 6px on controls, 10px on panels, 999px on badges. 4px spacing scale.
- One `h1` per page, max width 72ch for prose, generous vertical rhythm. The UI should look like a serious instrument, not a landing-page template.

## 5. Authorisation (build this properly)

**Roles:** `requester`, `reviewer`, `admin`. Exactly as in `WEBSITE_GUI.md` §3.

Implement:

- Sign-up: email, password (min 12 chars, checked against a small common-password list), required unticked 18+/Terms checkbox with links, server-side validation with field-level errors. Email is unique; duplicate sign-up returns a generic "an account with that email cannot be created" rather than leaking existence.
- Login: bcrypt compare, generic "Email or password is incorrect", rate limit 5 attempts per email+IP per 15 minutes with a clear lockout message.
- Sessions: random 32-byte token, stored hashed in `sessions` table with `expires_at` (12h sliding), cookie `pf_session` `httpOnly`, `sameSite=lax`, `secure` when `NODE_ENV=production`. Logout deletes the row, not just the cookie.
- CSRF: double-submit token endpoint `GET /api/csrf`, required header `x-csrf-token` on every non-GET request. Reject with 403.
- **Server-side RBAC on every route.** A React guard is not authorisation. Write one `requireRole(...)` middleware and use it. Reviewers and admins can read the review queue; requesters cannot. Only admins reach `/api/admin/*`.
- **Ownership scoping:** every query for targets, ROEs, runs, findings, reports and audit entries filters by the session user's id. Never trust an `ownerId` from the client. Requesting another user's run returns 404, not 403.
- Password reset and email verification: build the screens and endpoints, but no mail transport. Create a `password_reset_tokens` row and expose the link only in the server log, clearly marked `[dev only]` in the UI.
- Dev role switch: a small "viewing as" control in the app shell, visible only when `VITE_DEV_ROLE_SWITCH=true`, labelled **"Development control"**. It calls a real endpoint that re-issues the session for another seeded user — it must not fake a role in React state. In production builds the control is absent and the endpoint returns 404.
- Log every login, logout, failed login, role decision, ROE decision and plan change into the same `audit_events` table the engine will later write to.

## 6. Seed data (the demo depends on this)

Author it, don't randomise it at runtime. IDs must be stable and readable. Use a deterministic script so `npm run db:reset` reproduces the exact same state.

**No lorem ipsum. No placeholders like "Company A". No fake customers, testimonials, logos, awards or counts.** Everything must be plausible for PenflowAI and consistent with the SRS vocabulary.

Seed:

- 5 accounts: `requester@penflow.test` (Ayesha Khan, freelance), `requester2@penflow.test` (Bilal Ahmed, second tenant — used to prove isolation), `reviewer@penflow.test` (Sana Malik), `admin@penflow.test`, `pending@penflow.test` (unverified email). Shared dev password `Penflow!2026`, written in `web/README.md` only.
- Targets: `http://localhost:3000` OWASP Juice Shop (verified via DNS TXT, `verified`), `http://localhost:8080` DVWA (verified via file upload), `https://staging.example-client.test` (pending verification), and one `blocked` target to show the guardrail.
- ROE documents, one per status: `approved` (passed automatically, confidence 0.12), `needs_review` (flagged 0.91 — "Signature field empty", "Scope dates outside the requested window"), `rejected` (0.97 — "Scope list edited after signing"), and `checking` (no decision yet). Include `reviewer`, `decision`, `note`, `decidedAt` on the reviewed ones.
- Two runs: `run_01` complete on Juice Shop (stage `verify`, 8 findings), `run_02` running on DVWA (stage `identify`, partial log). A run may not exist without an `approved` ROE — enforce it in the schema.
- Findings for `run_01`, all real Juice Shop vulnerability classes: SQL injection in `/rest/products/search`, broken authentication (admin login by SQLi), XSS in the search field, sensitive data exposure via `/ftp`, security misconfiguration (missing headers), vulnerable component, CSRF, broken access control. Each with `riskScore` 0–100, a `scoreRationale` that names the actual signal ("internet-facing endpoint, customer data exposed, and this class is in the CISA KEV catalog"), `cveId` where a real identifier applies (e.g. `CVE-2023-45827` style — only use identifiers you are confident are real; otherwise `null`), `activelyExploited` boolean, evidence, and a plain-language sentence.
- Audit log for `run_01`: 18–25 entries across `requester`, `agent`, `scope_guard`, `reviewer`. **Exactly one must be `blocked: true`** — Scope Guard refusing `http://example.com/admin` with detail "Target is not in the approved scope. Request not sent." Make it visually unmistakable but not neon: red left border, `BLOCKED` badge, monospace target.
- One generated report for `run_01` with the structure from `WEBSITE_GUI.md` §6: summary, what was tested, findings by severity, what to fix first, and an AI-disclaimer footer. Markdown source stored in the DB; render with a small safe renderer (no `dangerouslySetInnerHTML` on user data).
- Waitlist: 4 entries, so the admin screen has something real.

Every seeded row must display in the UI. If a screen would be empty because no data exists, that is correct — but the seeded golden path must be non-empty.

## 7. Routes

Public: `/` `/how-it-works` `/features` `/pricing` `/waitlist` `/about` `/contact` `/security` `/accessibility`

Legal: `/legal/privacy` `/legal/terms` `/legal/cookies` `/legal/refunds` `/legal/acceptable-use` — render the text from `WEBSITE_LEGAL_PAGES.md`, keep every `[PLACEHOLDER]` visible in a distinct muted-chip style, and put a page-top banner: **"Draft — pending legal review. Not legal advice."** Never invent a company number, address or provider to make a page look finished.

Auth: `/signup` `/login` `/reset-password` `/verify-email`

App (login required): `/app/dashboard` `/app/targets` `/app/targets/new` `/app/roe/new` `/app/roe/:id` `/app/runs` `/app/runs/:id` `/app/findings/:runId` `/app/reports` `/app/reports/:id` `/app/billing` `/app/settings`

Staff: `/admin/review-queue` (reviewer, admin), `/admin/users` `/admin/tools` `/admin/models` `/admin/audit-log` (admin)

Also: `/app` redirects to `/app/dashboard`; unknown routes render a proper 404 inside the shell; wrong-role access renders a 403 page saying what the user can access instead of redirecting silently.

## 8. Pricing and subscription page (use these exact numbers)

Reproduce this table on `/pricing`. It is the only source of plan data — read it from `server/seed/plans.ts` so the page, the billing screen and the API agree.

| | Free | Starter | Pro | Team |
|---|---|---|---|---|
| Price / month | $0 | $19 (PKR 5,263) | $39 (PKR 10,803) | $89 (PKR 24,653) |
| Yearly (2 months free) | n/a | $190 (PKR 52,630) | $390 (PKR 108,030) | $890 (PKR 246,530) |
| Target segment | Trial users | Solo freelancer | Small software house | Agencies / teams |
| Seats / apps | 1 user / 1 app | 1 user / 1 app | 3 users / 5 apps | 10 users / 20 apps |
| Scans per month | 2 | 5 | 15 | 40 |
| Core security guardrails | ROE + Scope Guard | ROE + Scope Guard | ROE + Scope Guard | ROE + Scope Guard |
| Report type | Basic text | Standard PDF | Standard PDF | Custom-logo PDF |
| Action-log retention | 7 days | 30 days | 90 days + export | 1 year + export |

Requirements for this page:

- Real `<table>` with `<th scope>`, plus a monthly/yearly toggle built as a `<fieldset>` with radios. Yearly shows the annual total and the "2 months free" saving in text.
- Mark Pro as recommended with the word **"Recommended"**, not colour alone.
- **No working checkout and no card fields.** Buttons say **"Choose Starter"** etc.; on click, an authenticated requester gets a confirmation dialog that writes a `plan_change_requests` row with status `pending_activation` and shows: *"Billing is not live during early access. Your plan request is recorded and we will email you at launch."* A logged-out visitor is sent to `/waitlist`.
- A visible line above the table: **"Early access — plans and prices shown are for launch. Nothing is charged today."**
- `/app/billing` shows the seeded plan, usage bars (2 of 5 scans etc.), invoice table with a truthful "No invoices — billing is not live" empty state, and a **Cancel plan request** action.
- Every claim on the page must be true today. Do not write "unlimited", "enterprise-grade", "trusted by", "SOC 2", "AI never misses", "100% accurate", or compare to named competitors.

## 9. Screen content that carries the project's contribution

These are not optional decoration — they are the thesis. Build them to be understood at a glance.

1. **ROE status** — a four-step verdict rail (Submitted → Automated check → Manual review → Scope token) with the current step marked, the automated confidence and reasons listed verbatim, the reviewer's decision and note, and either a scope-token panel (`issued`, timestamp, scope hash in mono) or an explicit **no token issued** state explaining that no test can start.
2. **Review queue** — flagged documents with confidence, reasons, the attestation text that was accepted, and Approve / Reject / Request correction with a required note on reject. Every action writes an audit event and updates the ROE row in one transaction.
3. **Scope summary before start** — read-only target list pulled from the approved ROE, plus a genuinely `disabled` **Start security test** button with `aria-describedby` explaining *why* it is disabled when no token exists. Do not fake the disabled state with CSS alone.
4. **Run monitor** — Recon → Scan → Identify → Verify tracker, elapsed time, and a monospace log with actor, action, target, timestamp and a `BLOCKED` treatment for refused requests. Simulate progress client-side from the seeded log (a 900ms tick), and label it **"Simulated live view — engine not connected"**.
5. **Findings** — table with severity, type, component, risk score, KEV flag and rationale on expand. Score rendered as a number plus a thin bar; rationale text must state business context *and* threat intelligence.
6. **Audit log** — filter by actor and blocked-only, showing the single blocked out-of-scope request prominently.

## 10. Global requirements

- **Empty, loading and error states on every data view.** Plain language: "No test runs yet. Start your first security test." Loading uses a skeleton or spinner with `aria-busy`. Errors say what failed and what to do next.
- **Honesty banner** in the app shell: `Engine not connected — scan activity shown is simulated from seeded data.` It must be dismissible per session but not permanently hideable.
- **Accessibility, WCAG 2.2 AA**: skip link first in tab order, landmarks, one `h1`, visible `:focus-visible` ring using `--accent` at 2px with 2px offset, labelled inputs (placeholders are not labels), required fields marked in text, error summary with `aria-live` and focus moved to the first invalid field, no keyboard traps, 24×24px minimum targets, works at 200% zoom and 360px width, respects `prefers-reduced-motion`.
- **Forms**: never clear input on error, `autocomplete` attributes on email/password, Enter submits.
- **No third-party fonts, scripts, analytics, pixels or chat widgets.** No Google Fonts. Self-host everything.
- **No secrets in the frontend.** The API base URL is the only config.
- Responsive down to 360px; tables collapse to stacked rows with labels, not horizontal scroll.
- `web/README.md` must state plainly: what is real (auth, RBAC, data isolation, ROE workflow, pricing data), what is simulated (scan execution, report generation), and what is deliberately absent (payments, email, the Python engine).

## 11. Verification you must run before reporting back

1. `npm install` from `web/` completes with exit code 0.
2. `npm run db:reset` creates and seeds the database; the script prints row counts for every table.
3. `npm run typecheck` passes.
4. `npm run build` passes.
5. `npm run dev`, then with `curl`:
   - `GET /api/runs` unauthenticated → 401
   - login as `requester@penflow.test` → 200 with a `Set-Cookie`
   - `GET /api/runs` as that user → only their runs
   - `GET /api/runs/run_02` as `requester2@penflow.test` → 404
   - `GET /api/admin/users` as requester → 403, as admin → 200
   - `POST /api/roe` without the CSRF header → 403
   - six rapid failed logins → 429
6. Open the app in a browser. Confirm: no Vite logo or default favicon, no purple/pink anywhere, keyboard-only pass through login → dashboard → run monitor → findings, the disabled Start button is truly disabled without a token, and the blocked audit entry renders.
7. Fix what fails. Do not weaken tests or skip checks to make this list pass. If something cannot pass (for example the dev-role-switch flag in a production build), say so explicitly in your report.

## 12. Where this prompt overrides the docs

| Topic | Docs say | Build this |
|---|---|---|
| Pricing page | "Planned plans", no prices (`WEBSITE_GUI.md` §7.1) | Show the real plan table above, labelled early access, no checkout |
| Backend | Flask/FastAPI (`SRS` §7.9) | Express + TypeScript now; same route shape, replaceable |
| Data source | One JSON contract file | SQLite seeded with the same field names as `WEB_UI_BUILD_PLAN.md` §5 |
| Frontend | "React or Next.js" | Vite + React + React Router |
| Stack identity | — | No framework logos or mentions anywhere in the UI |

## 13. Report back with

- The commands you ran and their real exit status.
- A route list with the role required for each.
- The exact list of seeded logins and what each one can see.
- Anything in `WEBSITE_GUI.md` you did **not** implement, and why.
- Anything you could not verify, stated as a limitation rather than a pass.
