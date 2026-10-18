# PenflowAI — Web UI Build Plan (UI-First, Ahead of the Engine)

**Version:** 1.0 | **Date:** 18 October 2026 | **Status:** Plan only — no web code exists yet
**Stack decision:** Vite + React + TypeScript + React Router
**Data decision:** no fabricated/dummy findings. The UI renders **real engine output**, delivered as a JSON file written by the CLI.

Related: [WEBSITE_GUI.md](./WEBSITE_GUI.md) (what the UI must contain), [SRS_PenflowAI.md](./SRS_PenflowAI.md) (requirements), [WEBSITE_LEGAL_PAGES.md](./WEBSITE_LEGAL_PAGES.md) (policy text), [PHASES.md](./PHASES.md) (phases).

---

## 1. Why the UI can be built first

The phase order looks like it blocks this, but the project's own documents already allow it. [PHASES.md](./PHASES.md), "How to Use This Document":

> Sub-phases 7.1–7.3 (public site, waitlist, legal pages) do not need the engine at all and can start first.

Only **7.5** ("Connect frontend to backend API end-to-end on lab targets") depends on the engine. Everything else in Phase 7 — foundations, public site, legal pages, auth screens, and the app screens themselves — is specifiable and buildable now, because [WEBSITE_GUI.md](./WEBSITE_GUI.md) §4 and §6 already define every route, role and element.

**What that means for the submission:** the UI is not a mock-up that gets thrown away. The screens, components, design tokens, routes and accessibility work are real deliverables. What is deferred is only the transport — reading a JSON file instead of calling FastAPI.

---

## 2. Decisions locked for this build

| Decision | Choice | Reason |
|---|---|---|
| Frontend framework | Vite + React + TypeScript + React Router | Founder choice; fast dev server, no server-side rendering needed for a tool UI |
| Routing | React Router, route table declared in one file | Explicit control over `/app/...` and `/legal/...` paths from the sitemap |
| Styling | Hand-written CSS with design tokens (CSS custom properties) | No build-time dependency, full control of contrast ratios, easy to audit for WCAG |
| Icons | Inline SVG components, hand-authored or open-licensed | Avoids CDN icon packs (WEBSITE_GUI §8.7) |
| Fonts | Self-hosted in `public/fonts/` | Required by §8.7 (no Google Fonts) |
| Data source | Local JSON file produced by the CLI, read by the UI | No invented findings; the UI shows real results or an honest empty state |
| Auth (provisional) | Client-side session store with three roles, route gating | Backend auth is Phase 7.4; the screens and gates are built now so they are not retrofitted |
| Analytics / trackers | None | §8.3: essential cookies only, so no consent banner is needed |
| Billing / checkout | **Out of scope** | §7.1 and risk R3: waitlist-only until the business is registered |

### 2.1 The provisional-auth warning

Client-side auth is **not security**. It can be bypassed by anyone with dev tools. Therefore:

- Every auth screen and gate is labelled in the code with a `TODO(7.4)` comment pointing at SRS FR-9.1/FR-9.2.
- No page, document or demo script may describe the login as secure until the backend session work is done.
- The plan is to keep the *shape* (session object, roles, `RequireRole` guard, redirect-after-login) identical to what the real API will need, so swapping `session.ts` for real endpoints changes one module.

---

## 3. Why "no dummy data" is the right call — and how to demo it

An invented findings table would violate WEBSITE_GUI §8.10 (no claims the prototype cannot support) and would be the first thing an examiner probes. So the UI is built to consume **one contract file**:

```
web/data/penflow-run.json        ← written by the CLI engine
```

Until the engine writes it, every screen shows its genuine **empty state**: "No test runs yet. Once the engine completes a run in this workspace, results appear here." That is honest, and it is also a required screen state anyway (§6, "Empty, loading and error states").

**The demo path that avoids fabrication entirely:** run the tools you already have (Nmap, Nikto) against OWASP Juice Shop by hand, then assemble **one** contract file from that real output. Those are real findings from a real target — not dummy data — and the UI then renders a genuine report, genuine audit trail and genuine risk scores. Budget two hours for this; it is worth more than any mock screen.

---

## 4. Architecture

### 4.1 Folder layout

```
web/
├── data/
│   └── penflow-run.json            # contract file written by the CLI (gitignored once real)
├── frontend/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── public/
│   │   ├── fonts/                  # self-hosted
│   │   ├── diagrams/               # architecture diagram + text alternative
│   │   └── .well-known/security.txt
│   └── src/
│       ├── main.tsx
│       ├── router.tsx              # single route table
│       ├── pages/
│       │   ├── public/             # Home, HowItWorks, Features, Pricing, Waitlist, About, Contact, Security, Accessibility
│       │   ├── legal/              # Privacy, Terms, Cookies, Refunds, AcceptableUse
│       │   ├── auth/               # Signup, Login, ResetPassword, VerifyEmail
│       │   ├── app/                # Dashboard, Targets, RoeNew, RoeStatus, Runs, RunMonitor, Findings, Reports, ReportView, Settings
│       │   └── admin/              # ReviewQueue (+ later Users, Tools, Models, AuditLog)
│       ├── components/
│       │   ├── Button.tsx  Field.tsx  Checkbox.tsx  Select.tsx
│       │   ├── Table.tsx   DataTable  Badge.tsx  Alert.tsx
│       │   ├── EmptyState.tsx  LoadingState.tsx  ErrorState.tsx
│       │   ├── SkipLink.tsx  SiteHeader  SiteFooter  AppShell.tsx
│       │   └── StageTracker.tsx  RiskScore.tsx  LogViewer.tsx
│       ├── data/
│       │   ├── types.ts            # the contract, as TypeScript types
│       │   ├── source.ts           # load + validate the JSON file
│       │   └── selectors.ts        # derived views (sorted findings, run summary)
│       ├── auth/
│       │   ├── session.ts          # PROVISIONAL — replaced in 7.4
│       │   └── RequireRole.tsx
│       ├── content/
│       │   └── legal/              # policy text as typed content, placeholders intact
│       └── styles/
│           ├── tokens.css          # colours, spacing, focus, type scale
│           └── global.css
└── ASSETS_LICENCES.md
```

### 4.2 The data seam

Screens never import the JSON directly. One module owns the file:

```ts
// src/data/source.ts  (API surface — the only thing pages call)
export async function loadRunData(): Promise<RunData | null>
```

- `null` → render `<EmptyState />` with plain-language guidance.
- Parse/validate failure → render `<ErrorState />` naming the file and the first invalid field. Never crash to a blank page.
- Valid → render.

In Phase 7.4 this module is replaced by `fetch()` calls to the FastAPI routes already listed in WEBSITE_GUI §6 (`GET /runs/:id`, etc.). The types in `types.ts` are written to match those routes, so the change is confined to one file plus a transport.

### 4.3 Validation without a heavy dependency

Hand-write a `validate(data): {ok: true, data} | {ok: false, errors[]}` function in `src/data/source.ts`. It checks required fields, enum values and array shapes. A schema library is fine if one is already in `package.json`, but a 40-line validator keeps the bundle small and makes the contract explicit.

---

## 5. The data contract (what the CLI must emit)

This is the most important artefact in this plan: it is the handshake between the engine and the UI. Field names follow the vocabulary already used in the SRS and README.

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-18T14:02:11Z",
  "engine": { "model": "openai/gpt-oss-120b", "riskModelVersion": "risk_scorer_v1" },

  "targets": [
    {
      "id": "tgt_01",
      "url": "http://localhost:3000",
      "hostname": "localhost",
      "verification": { "method": "dns_txt", "status": "verified", "checkedAt": "..." }
    }
  ],

  "roe": {
    "id": "roe_01",
    "fileName": "sample_roe.pdf",
    "uploadedAt": "...",
    "attestation": true,
    "status": "approved",            // checking | needs_review | approved | rejected
    "automated": { "decision": "flagged", "confidence": 0.91,
                   "reasons": ["Signature field empty", "Scope date outside window"] },
    "review": { "reviewer": "reviewer@example.org", "decision": "approved",
                "note": "Signature verified by phone.", "decidedAt": "..." },
    "scopeTokenIssuedAt": "..."
  },

  "run": {
    "id": "run_01",
    "roeId": "roe_01",
    "status": "complete",            // queued | running | stopped | complete | failed
    "stage": "verify",               // recon | scan | identify | verify
    "startedAt": "...", "finishedAt": "...",
    "scope": ["http://localhost:3000"]   // read-only list shown before start
  },

  "findings": [
    {
      "id": "f_01",
      "type": "sql_injection",
      "title": "SQL injection in product search",
      "component": "/rest/products/search",
      "severity": "high",            // critical | high | medium | low | info
      "riskScore": 87,
      "scoreRationale": "Internet-facing endpoint, customer data exposed, and this vulnerability class is in the CISA KEV catalog.",
      "cveId": "CVE-2024-0000",      // null when no identifier applies
      "activelyExploited": true,     // CISA KEV (FR-5.4)
      "evidence": "Payload returned 5 rows where 1 was expected.",
      "plainLanguage": "A visitor could read data from the database that they should not be able to see."
    }
  ],

  "report": {
    "id": "rep_01",
    "markdown": "## Summary\n...",
    "generatedAt": "..."
  },

  "audit": [
    {
      "id": "a_01",
      "timestamp": "...",
      "actor": "agent",              // agent | reviewer | requester | system
      "action": "http_request",
      "target": "http://localhost:3000/rest/products/search",
      "blocked": false,
      "detail": "GET via recon tool"
    },
    {
      "id": "a_02",
      "timestamp": "...",
      "actor": "scope_guard",
      "action": "http_request",
      "target": "http://example.com/admin",
      "blocked": true,               // ← the differentiator, shown in the UI
      "detail": "Target is not in the approved scope. Request not sent."
    }
  ]
}
```

Rules for the contract:

- `schemaVersion` is required; the UI refuses unknown major versions with a clear message.
- Every enum is closed; unknown values render as a neutral "unknown" badge rather than crashing.
- `audit[].blocked` must be populated by the Scope Guard, not the UI. The UI only displays it.
- File location is configurable via `VITE_DATA_URL`, defaulting to `/data/penflow-run.json` served from `public/`.

---

## 6. Screen inventory and priority

Priorities: **P0** = needed for the demo and the marks · **P1** = build if time allows · **CUT** = explicitly out.

### 6.1 Public site

| Route | Priority | Notes |
|---|---|---|
| `/` Home | P0 | Headline, one-sentence description, "Early access — product in development" label, two buttons (§5.1) |
| `/how-it-works` | P0 | Pipeline steps as an ordered list **and** a text version alongside the diagram (§9.3) |
| `/features` | P0 | Every feature tagged **Built / In progress / Planned** — currently mostly Planned, which is the honest state |
| `/pricing` | P0 | Titled **"Planned plans"**, no prices, no Buy button (§7.1) |
| `/waitlist` | P0 | Email required, name + role optional, unticked optional updates box (§6.1 of legal file) |
| `/about` | P0 | Business details block; operator = the two founders until registration |
| `/contact` | P1 | Simplest compliant option: a plain `mailto:` link plus the reply-purpose notice |
| `/security` | P0 | Responsible disclosure text from the legal file |
| `/accessibility` | P1 | Statement with the "not yet tested" wording that is true today |

### 6.2 Legal pages (all P0 — required by FR-9.4)

`/legal/privacy`, `/legal/terms`, `/legal/cookies`, `/legal/refunds`, `/legal/acceptable-use`.

Build these as view components fed by typed content, with every `[PLACEHOLDER]` visible in a distinct style (not styled away) and a page-level banner: **"Draft — pending legal review. Not legal advice."** Fill in only what is genuinely known (operator names, jurisdiction). Never invent a registration number, address or provider name to make a page look finished.

### 6.3 Auth screens

| Route | Priority | Notes |
|---|---|---|
| `/signup` | P0 | Email, password, unticked 18+/terms checkbox with links, button **"Create my account"** |
| `/login` | P0 | Email, password, **"Log in"**, **"Forgot password?"** (link may lead to a P1 screen) |
| `/reset-password`, `/verify-email` | P1 | Screen and copy only; no email transport yet |
| Role switch (dev-only affordance) | P0 | Lets a demo viewer move between Requester / Reviewer / Administrator. Must be visibly marked as a development control. |
| `RequireRole` guard | P0 | Redirects to `/login` with a `returnTo`, and shows a plain "You do not have access to this page" for wrong-role access |

### 6.4 Application screens

| Route | Role | Priority | Key elements |
|---|---|---|---|
| `/app/dashboard` | Requester | P0 | Run summary, latest report link, **"Start a new security test"**, empty state |
| `/app/targets` | Requester | P0 | URL field, DNS-TXT/file verification instructions, status badge |
| `/app/roe/new` | Requester | P0 | File input with type/size limits, target selection, **required unticked** attestation, **"Upload ROE document"** |
| `/app/roe/:id` | Requester | P0 | Status: Checking / Needs review / Approved / Rejected + plain-language reason + "Upload a corrected document" when rejected |
| `/app/runs` | Requester | P1 | List with status and date |
| `/app/runs/:id` | Requester | P0 | Read-only scope summary, **"Start security test"** (disabled until ROE approved), stage tracker, log, **"Stop test"** |
| `/app/findings/:runId` | Requester | P0 | Table sorted by severity → type → component, risk score with the "why this score" note, KEV marker as text |
| `/app/reports/:id` | Requester | P0 | Rendered report, **"Download report (Markdown)"**, print stylesheet for PDF |
| Audit log panel (inside run monitor) | Requester | P0 | Timestamped list, blocked requests visually flagged **with text**, not colour alone |
| `/app/settings` | Any | P1 | Profile fields, "Download my data" / "Delete my account and data" buttons with the confirmation copy from legal §6.8 |
| `/app/billing` | Requester | **CUT** | Nothing to bill; leave out until §7.4 route is decided |

### 6.5 Admin screens

| Route | Priority | Notes |
|---|---|---|
| `/admin/review-queue` | P0 | The reviewer's three actions (Approve / Reject / Ask for a corrected document) plus a note field. This screen *is* the differentiator; do not cut it. |
| `/admin/users` | P1 | Read-only list |
| `/admin/tools`, `/admin/models`, `/admin/audit-log` | CUT (for now) | Post-demo; the global audit view can be reached later from the run log |

---

## 7. Design tokens and components

Define in `tokens.css` before writing any screen:

- **Colour:** background, surface, text, muted text, border, focus ring, plus semantic `--sev-critical/high/medium/low/info`. Every text/background pair must be checked to **4.5:1** (normal) and **3:1** (large text, borders, focus rings). Severity never conveyed by colour alone — always with a word.
- **Focus:** one `--focus-ring` token, `outline: 3px solid`, `outline-offset: 2px`, never `outline: none`.
- **Spacing:** 4px scale.
- **Type:** a modular scale with a minimum 16px body.
- **Target size:** minimum 24×24 CSS px for every interactive element; 44×44 for primary buttons.
- **Motion:** all transitions wrapped in `@media (prefers-reduced-motion: no-preference)`.

Components required before screens (about a dozen, all accessible by construction): `Button`, `Field` (label + hint + error + `aria-describedby`), `Checkbox` (real input, visible label), `Select`, `Badge`, `Alert`, `Table`, `EmptyState`, `LoadingState`, `ErrorState`, `SkipLink`, `SiteHeader`, `SiteFooter`, `AppShell`, `StageTracker`, `RiskScore`, `LogViewer`.

---

## 8. Accessibility build rules (WCAG 2.2 AA — FR-9.8)

Bake these in from the first commit; retrofitting is where projects lose days.

- One `<h1>` per page, headings never skipped, `header`/`nav`/`main`/`footer` landmarks, unique `<title>` per route, `lang="en"`.
- "Skip to main content" as the first focusable element.
- Every input has a visible `<label for>`; placeholders are never labels.
- Required fields marked with the word "required", not an asterisk alone.
- Errors: field-level message, linked via `aria-describedby`, summarised in an `aria-live="polite"` region, and **user input is never cleared**.
- Focus moved to the `<h1>` or error summary on route change (React Router: a small `useRouteFocus` hook).
- `autocomplete` on email/password fields.
- Table headers use `<th scope="col">`; the findings table is a real `<table>`, never a div grid.
- Print stylesheet for the report page.

Verification at the end: axe DevTools + Lighthouse on every route, a keyboard-only pass through the whole golden path, 200% zoom check, and one screen-reader pass (NVDA on Windows). Record the date and result in the Accessibility Statement.

---

## 9. Honest labelling rules

| Situation | What the UI says |
|---|---|
| No contract file present | "No test run data yet. This workspace has not produced a run." |
| Contract file invalid | "Could not read the results file. Field `findings[3].severity` has an unexpected value." |
| Results present but engine disconnected | A small chip in the app header: **"Results loaded from file — engine not connected"** |
| Legal pages | Banner: **"Draft — pending legal review."** |
| Features page | Every item tagged Built / In progress / Planned |
| Auth | Code-level `TODO(7.4)`; nothing in the UI claims security |

No fabricated testimonials, counters, logos, ratings or urgency anywhere (§8.10).

---

## 10. Build order

Estimates assume one person, focused, and include the accessibility work. Total ≈ **46–56 hours**.

| # | Milestone | Deliverable | Est. |
|---|---|---|---|
| M0 | Scaffold | Vite + TS + React Router project in `web/frontend/`, tokens, fonts, global CSS, lint | 3h |
| M1 | Component library | The dozen components above, each keyboard-tested in isolation | 8h |
| M2 | Public site | 9 public routes, header/footer, legal link wiring | 8h |
| M3 | Legal pages | 5 pages from the draft text, placeholder styling, banner | 4h |
| M4 | Auth shell | Session store, three roles, `RequireRole`, guard, signup/login screens, dev role switch | 6h |
| M5 | Data layer | `types.ts`, `source.ts` with validation, empty/error states proven by hand-editing the file | 5h |
| M6 | Golden-path screens | Targets → ROE upload/status → run monitor (scope gate, stage tracker, audit log) → findings → report | 14h |
| M7 | Review queue | `/admin/review-queue` with the three decisions and note field | 4h |
| M8 | Accessibility + polish | axe/Lighthouse/NVDA pass, keyboard sweep, 200% zoom, print stylesheet | 5h |
| M9 | One real run | Assemble the contract file from a genuine manual Juice Shop scan and confirm the UI renders it | 2h |

**Critical ordering:** M5 before M6. Building screens against a data shape you have not finalised is the single most common source of rework.

---

## 11. What to cut if the deadline tightens

In order: `/contact` form (use `mailto:`) → `/app/runs` list → `/app/settings` beyond the two delete/export buttons → `/admin/users` → password reset screens → the public `/security` and `/accessibility` pages → PDF export (keep print). 

**Never cut:** the ROE status screen, the review queue, the scope summary with the disabled Start button, the findings table with risk rationale, the audit log with a blocked entry. Those five screens carry the FYP's contribution.

---

## 12. Definition of done

- [ ] `npm run build` and `npm run dev` both succeed with no TypeScript errors
- [ ] Every route in §6 exists and is reachable without a manual URL guess
- [ ] Missing contract file → useful empty state on every app screen; corrupt file → specific error
- [ ] A valid contract file populates dashboard, findings, report and audit log
- [ ] Start button is genuinely disabled until `roe.status === "approved"`
- [ ] Wrong-role navigation is refused with a plain message
- [ ] axe: zero critical/serious issues on every route
- [ ] Full golden path completed with keyboard only
- [ ] No page claims a capability the engine does not have
- [ ] `security.txt` present in `public/.well-known/`
- [ ] `ASSETS_LICENCES.md` lists every image, icon, font and library

---

## 13. Open items for the founders

1. **Project email address** for footer, privacy and abuse contacts (not a personal or student address).
2. **Operator name** in the footer — the two founders' names until SECP registration exists.
3. **Domain name**, if one is registered, for `security.txt` and the report footer.
4. **Who runs the one real Juice Shop scan** to produce the contract file, and when.
5. Confirmation that **pricing stays "Planned plans"** in the submission, with no figures shown.

---

## Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 18 Oct 2026 | First version: UI-first plan with Vite/React stack, CLI JSON contract, screen priorities, accessibility rules, build order |
