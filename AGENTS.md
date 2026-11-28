# AGENTS.md — PenflowAI Context File

> This file is for AI agents and collaborators continuing work on this project.
> Read it before making any changes. Update the STATUS section after every finished subtask.

---
Report module: Phase 1 (`core/reporting/`) built and committed as `078adf6`; 85/85 test checks green on Python 3.15.2 (re-verified Nov 2026). Phase 2 frontend page built (`08eadab`). Phase 3 backend ingestion is partially implemented; the engine caller remains intentionally unwired.

## 1. Project Overview

PenflowAI is an AI-orchestrated automated web penetration testing platform, built as a final year project (FYP) at a university level (team: Muhammad Sunnan, Hamza Ahmad Baig; supervisor: Ms. Kanza Zafar). The system is designed to enforce Rules of Engagement (ROE) before any testing begins, run security tools against lab targets only, score findings using an AI model via the Groq API, and generate a Markdown report (ROE Checker and Risk Scorer are planned/not built yet). The platform has three layers: a Python scanning engine (`core/`), a Node.js/Express REST API (`backend/`), and a React SPA (`web/frontend/`). The only lab target is OWASP Juice Shop (Docker Desktop on Windows, port 3000). The system version is **1.6.0**.

---

## 2. Architecture

The intended pipeline is:

```
ROE Checker → Scope Guard → Testing Agent (+Logger) → Risk Scorer → Report Writer
```

### What exists and where

| Pipeline Stage | Status | File(s) |
|---|---|---|
| **ROE Checker** (ROE fraud/tampering detection) | **MISSING** — slot exists in DB (`automated_decision = 'not_connected'`), upload endpoint stores documents, but no detection algorithm runs. The planned approach is a custom fraud-detection algorithm (not RandomForest, which is reserved for Risk Scoring). | `backend/routes/api.ts` (upload + manual review queue only) |
| **Scope Guard** (blocks out-of-scope tool calls) | **PARTIAL** — run-bound policy loading and guarded nmap/passive-ZAP dispatch are implemented; other tools remain unsupported. `check_scope()` remains as a secondary local-host guard. | `core/scope_guard/`, `core/tools/tool_registry.py`, `backend/routes/internal.ts` |
| **Testing Agent** | **PARTIAL** — ReAct loop exists, calls tools in fixed order, calls LLM for plain-language summaries of medium/high/critical findings; does NOT use LLM for tool selection decisions | `core/agent/react_loop.py`, `core/agent/llm_client.py` |
| **Logger** | **DONE** — writes timestamped JSONL log per run | `core/logging_system/action_logger.py` |
| **Risk Scorer** | **MISSING** — planned as a RandomForest classifier that predicts severity from finding features and correlates with CVE/NVD and CISA KEV data. Findings currently carry a raw `risk` string from tool wrappers; DB columns `risk_score`, `score_rationale`, `cve_id`, `actively_exploited` exist but are not populated by the engine. | `core/tools/tool_registry.py` (`finding()` helper), `backend/db/migrations/001_initial.sql` (schema) |
| **Report Writer** | **PARTIAL** — generates a Markdown + JSON report from raw findings; no AI-generated prose sections; no technical/plain-language dual summary | `core/report.py` |

### Backend web API (separate system, not connected to the engine yet)

The backend manages users, ROE document uploads, runs, findings, and reports via a PostgreSQL database. The engine writes directly to files; the API and engine are **not yet wired together** — runs created via the web UI are marked `simulated: true`.

---

## 3. Folder Map

```
e:\PENFLOW AI\
├── .env                         # Root env — GROQ_API_KEY, ZAP_API_KEY (names only; never copy values)
├── .gitignore
├── README.md
├── VERSION                      # "1.6.0"
├── AGENTS.md                    # ← this file
│
├── backend/                     # Node.js / Express REST API (TypeScript)
│   ├── .env                     # Backend env (not committed; see .env.example for var names)
│   ├── .env.example             # Template with all var names
│   ├── app.ts                   # Express app setup: CORS, Helmet, CSRF check, auth middleware
│   ├── index.ts                 # Entry point: runs migrations, seeds, starts HTTP server on port 4000
│   ├── package.json             # Dependencies: express, helmet, cors, bcryptjs, pg, multer, nodemailer, tsx
│   ├── docker-compose.yml       # Postgres + Mailpit for local dev
│   ├── auth/
│   │   ├── jwt.ts               # HS256 JWT sign/verify (custom, no library)
│   │   ├── sessions.ts          # Refresh token rotation with reuse detection
│   │   ├── tokens.ts            # Email token (verify/reset) issuing and consuming
│   │   ├── rate-limit.ts        # In-memory rate limiter
│   │   └── deps.ts              # authenticate(), requireRole(), requireVerified() middleware
│   ├── db/
│   │   ├── index.ts             # pg Pool, query/one/run/transaction/migrate helpers
│   │   ├── audit.ts             # audit() and auditAuth() helpers
│   │   ├── seed.ts              # Seeds test users (requester, reviewer, admin)
│   │   ├── reset.ts             # DB reset utility
│   │   └── migrations/
│   │       ├── 001_initial.sql  # All core tables: users, sessions, targets, roe_documents, runs, findings, reports, audit_events, waitlist, plan_change_requests, password_reset_tokens
│   │       ├── 002_verification.sql
│   │       ├── 003_email_tokens.sql
│   │       ├── 004_auth_hardening.sql  # is_active, failed_attempts, locked_until, session hardening
│   │       ├── 005_report_json.sql
│   │       ├── 006_roe_validation.sql
│   │       ├── 007_report_generated_at.sql
│   │       ├── 008_scope_policies.sql # Versioned policies, run bindings, and tool-call audit log
│   │       └── 009_scope_tool_settings.sql # Admin-controlled enabled tool catalog
│   ├── scope-guard/
│   │   └── policy-client.ts     # Invokes and validates the Python policy builder
│   ├── email/
│   │   ├── sender.ts            # nodemailer SMTP sender (fire-and-forget)
│   │   └── templates.ts         # HTML+plain-text email templates
│   ├── routes/
│   │   └── api.ts               # All REST endpoints (auth, targets, ROE, runs, findings, reports, admin)
│   ├── seed/
│   │   └── plans.ts             # Plan definitions (free, etc.)
│   ├── data/
│   │   ├── penflow.db           # SQLite file — IGNORE; real DB is Postgres via .pgverify/
│   │   └── roe-uploads/         # Uploaded ROE files (gitignored)
│   └── dist/                    # Compiled JS (gitignored in production use)
│
├── core/                        # Python scan engine
│   ├── .venv/                   # Python virtual environment (Windows path: core/.venv)
│   ├── requirements.txt         # requests, python-dotenv, groq
│   ├── main.py                  # CLI entry point: --target, --dry-run, --only flags
│   ├── report.py                # Builds Markdown + JSON report, saves to core/reports/
│   ├── check_tools.py           # Utility to verify which tools are installed
│   ├── agent/
│   │   ├── llm_client.py        # Groq API wrapper; MODEL env var defaults to openai/gpt-oss-120b
│   │   └── react_loop.py        # Main tool-execution loop; calls LLM for finding summaries
│   ├── scope_guard/             # ROE Rules extraction, restrictive policy building, and schema
│   ├── logging_system/
│   │   ├── action_logger.py     # Writes per-run JSONL log to logging_system/logs/
│   │   └── logs/                # Run logs (gitignored)
│   ├── reports/                 # Generated reports, one folder per run: <run_id>/report.json|.html|.md (gitignored)
│   ├── reporting/               # REPORT MODULE (section 6A): schema.py, builder.py, ai_writer.py,
│   │                            #   render_html.py, render_md.py, report.schema.json, test_reporting.py,
│   │                            #   sample_data/sample_findings.json
│   └── tools/
│       ├── tool_registry.py     # @register decorator, check_scope(), run_tool(), list_tools()
│       ├── shell.py             # run_cmd() wraps WSL if on Windows; ToolError, ToolSkipped, finding()
│       ├── __init__.py
│       ├── big_tools/
│       │   ├── nmap_wrapper.py
│       │   ├── zap_wrapper.py
│       │   ├── nikto_wrapper.py
│       │   ├── ffuf_wrapper.py
│       │   ├── nuclei_wrapper.py
│       │   ├── sqlmap_wrapper.py
│       │   ├── wafw00f_wrapper.py
│       │   └── whatweb_wrapper.py
│       └── custom_scripts/
│           └── header_checks.py
│
├── web/                         # React SPA (npm workspace)
│   ├── package.json             # Workspace root; runs frontend via --workspace @penflow/frontend
│   ├── next-step.txt            # Developer notes / last AI prompt used (not code)
│   └── frontend/
│       ├── package.json         # React 18, React Router 6, Vite 6, IBM Plex fonts
│       ├── vite.config.ts
│       ├── index.html
│       ├── src/
│       │   ├── main.tsx
│       │   ├── router.tsx       # All routes; roles: requester / reviewer / admin
│       │   ├── components/ui.tsx
│       │   ├── lib/
│       │   │   ├── api.ts       # Fetch wrapper (adds x-requested-with header)
│       │   │   ├── session.tsx  # Auth context
│       │   │   ├── reportTypes.ts # Typed mirror of core/reporting/report.schema.json
│       │   │   └── types.ts     # TypeScript types
│       │   ├── data/            # sample-report.json/.ts — mock report.json for the engine report page
│       │   ├── pages/
│       │   │   ├── AppPages.tsx      # Dashboard, Targets, ROE, Runs, Findings, Reports, Billing, Settings, Review, Admin
│       │   │   ├── ReportPage.tsx    # Engine report page (/app/reports/engine) from report.json
│       │   │   ├── AuthPages.tsx     # Login, Signup, ForgotPassword, ResetPassword, VerifyEmail
│       │   │   ├── PublicPages.tsx   # Home, How it works, Features, Pricing, Waitlist, About, Contact
│       │   │   └── LegalPages.tsx    # Legal page renderer
│       │   ├── content/legal/        # Markdown legal pages (privacy, terms, cookies, refunds, acceptable-use, security, accessibility)
│       │   └── styles/
│       │       ├── global.css
│       │       └── tokens.css
│       └── public/
│           └── .well-known/security.txt
│
├── Documentation/               # Project docs (do not auto-delete anything here)
│   ├── PHASES.md                # Full phase breakdown (phases 0–11) with done/in-progress/not-started markers
│   ├── AUTH_PROGRESS.md         # Auth system implementation status (phases 3–10)
│   ├── SRS_PenflowAI.md         # Software Requirements Specification
│   ├── WEBSITE_GUI.md           # Web UI full spec
│   ├── WEBSITE_LEGAL_PAGES.md   # Draft legal policy text
│   ├── WEB_UI_BUILD_PLAN.md     # Web build plan
│   ├── 1-GUI_CLI_PROMPT.md      # Earlier AI prompt used for GUI/CLI build (not read in detail)
│   ├── AUTH_PROMPT.md           # Earlier AI prompt used for auth build (not read in detail)
│   ├── PenflowAI Pitch Deck.pptx
│   └── Penflow_data.docx
│
└── scripts/                     # Bash scripts — run INSIDE WSL Kali
    ├── setup_kali_tools.sh      # apt-installs all tools + creates WSL venv (.venv inside Kali, separate from Windows core/.venv)
    ├── start_zap.sh             # Starts ZAP headless on port 8080
    └── start_all.sh             # Starts ZAP, then prints the engine run command
```

---

## 4. Environment

### Runtime split

| Component | Where it runs | Notes |
|---|---|---|
| Python engine (`core/`) | **Windows** (PowerShell, venv at `core/.venv`) | `shell.py` detects non-Linux and auto-prefixes every tool command with `wsl -d kali-linux --` so tools run in WSL transparently |
| Security tools (nmap, ffuf, nuclei, sqlmap, wafw00f, whatweb, nikto) | **WSL Kali Linux** (called by `shell.py`) | Installed via `scripts/setup_kali_tools.sh` inside WSL |
| ZAP daemon | **WSL Kali Linux**, port 8080 | Started via `scripts/start_zap.sh` inside WSL; reachable from Windows at `http://127.0.0.1:8080`; `zap_wrapper.py` calls it over HTTP, no binary needed |
| Juice Shop (lab target) | **Docker Desktop on Windows**, port 3000 | Only lab target; started manually |
| Backend API | **Windows**, port 4000 | Node.js/Express, TypeScript via `tsx` |
| Frontend dev server | **Windows**, port 5173 | Vite (`vite --host 127.0.0.1`) |
| PostgreSQL | **Windows** (via `.pgverify/` embedded Postgres, or Docker) | Connection string default: `postgres://penflow:penflow@127.0.0.1:5432/penflow` |
| Mailpit (dev SMTP) | **Windows** (Docker), SMTP 1025, web UI 8025 | Defined in `backend/docker-compose.yml` |

### Exact run commands found in source

```powershell
# --- Setup (run once, INSIDE WSL Kali) ---
# Open a WSL Kali shell first, then:
bash scripts/setup_kali_tools.sh

# --- Start ZAP (INSIDE WSL Kali) ---
bash scripts/start_zap.sh
# or use the helper that also waits for ZAP to come up:
bash scripts/start_all.sh

# --- Run the Python engine (Windows PowerShell, from repo root) ---
# The engine runs on Windows; shell.py tunnels tool binaries through WSL automatically.
cd core
.\.venv\Scripts\Activate.ps1      # activate Windows venv (PowerShell)
# Set PENFLOW_SERVICE_TOKEN securely to the backend's configured service token.
python main.py --target http://127.0.0.1:3000 --run-id $env:PENFLOW_RUN_ID
python main.py --target http://127.0.0.1:3000 --run-id $env:PENFLOW_RUN_ID --dry-run
python main.py --target http://127.0.0.1:3000 --run-id $env:PENFLOW_RUN_ID --only zap,nmap
python check_tools.py                                   # verify which tools are reachable

# --- Backend API (Windows PowerShell, from backend/) ---
npm install
npm run dev        # tsx watch --env-file=.env index.ts  (dev, port 4000)
npm run build      # compile TypeScript to dist/
npm start          # run compiled dist/index.js
npm test           # auth test suite
npm run db:reset   # wipe and re-seed the database

# --- Frontend (Windows PowerShell, from web/) ---
npm install
npm run dev        # Vite dev server on http://127.0.0.1:5173

# --- Docker (Windows PowerShell, from backend/) ---
docker compose up -d   # start Postgres + Mailpit
```

---

## 5. Tools List

All tools live in `core/tools/`. Each wrapper registers itself with the `@register` decorator in `tool_registry.py`. Engine dispatch goes through `ScopeGuard.run()`, which validates the run policy before calling `run_tool()` and its secondary `check_scope()` guard.

**9 tool wrappers exist** in `core/tools/big_tools/` and `core/tools/custom_scripts/`. **8 appear in `TOOL_ORDER`** (the fixed execution list in `react_loop.py`). `nikto_wrapper.py` is registered with `@register` and callable via `run_tool("nikto", ...)` but is **not included in `TOOL_ORDER`** — it will not run in a normal engine pass unless added there.

**Execution order** (from `core/agent/react_loop.py` → `TOOL_ORDER`):

| # | Tool name | Phase | Active (sends attack traffic) | Default enabled | What it does | Binary |
|---|---|---|---|---|---|---|
| 1 | `whatweb` | reconnaissance | No | Yes | Fingerprints web technologies, frameworks, server software | `whatweb` |
| 2 | `wafw00f` | reconnaissance | No | Yes | Detects whether a WAF protects the target | `wafw00f` |
| 3 | `nmap` | reconnaissance | No | Yes | Port scan + service/version detection; outputs XML, parses open ports | `nmap` |
| 4 | `ffuf` | enumeration | Yes | Yes | Directory/file discovery with wordlist `/usr/share/wordlists/dirb/common.txt`; flags sensitive paths | `ffuf` |
| 5 | `header_checks` | vulnerability_assessment | No | Yes | Python requests call; checks for missing X-Frame-Options, CSP, HSTS, X-Content-Type-Options; checks HttpOnly on cookies | None (pure Python) |
| 6 | `nuclei` | vulnerability_assessment | Yes | Yes | Template-based detection; tags: `exposure,misconfig,tech`; excludes `dos,fuzz,intrusive`; no interactsh | `nuclei` |
| 7 | `zap` | vulnerability_assessment | No | Yes | Runtime guard permits a single-page, in-scope spider + passive scan only; no active scan | None (HTTP client) |
| 8 | `sqlmap` | validation | Yes | **No** | SQL injection verification; needs a URL with query params; must be explicitly enabled via `PENFLOW_ENABLED_TOOLS=sqlmap` | `sqlmap` |

**Registered but NOT in TOOL_ORDER:**

| Tool name | Phase | What it does | Binary |
|---|---|---|---|
| `nikto` | vulnerability_assessment | Web server misconfiguration and outdated component checks; parses JSON output | `nikto` |

**How to call a guarded tool directly** (from Python inside `core/`):
```python
from scope_guard.tool_wrapper import ScopeGuard
guard = ScopeGuard(run_id)
findings = guard.run("nmap", {"target_url": "http://127.0.0.1:3000"})
```

**Dry-run mode**: pass `--dry-run` to `main.py`. It still requires a running backend run and active scope policy; guarded nmap/ZAP return fake findings.

**WSL distro**: controlled by env var `PENFLOW_WSL_DISTRO` (default: `kali-linux`).

**Wordlist**: controlled by `PENFLOW_WORDLIST` (default: `/usr/share/wordlists/dirb/common.txt`).

---

## 6. Config

### Root `.env` (at `e:\PENFLOW AI\.env`) — variable names only

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Groq API key for the LLM |
| `ZAP_API_KEY` | OWASP ZAP daemon API key |

### Backend `.env` (at `backend/.env`) — variable names from `backend/.env.example`

| Variable | Default / Notes |
|---|---|
| `DATABASE_URL` | `postgres://penflow:penflow@127.0.0.1:5432/penflow` |
| `JWT_SECRET` | Min 32 bytes; required or server won't start |
| `ACCESS_TTL_MIN` | `15` (minutes) |
| `REFRESH_TTL_DAYS` | `7` |
| `CORS_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` |
| `COOKIE_SECURE` | `false` (set to `true` in production) |
| `APP_BASE_URL` | `http://127.0.0.1:5173` (used in email links) |
| `PENFLOW_PYTHON` | (empty; policy builder uses `core/.venv` by default, or set a Python executable path) |
| `SMTP_HOST` | `127.0.0.1` |
| `SMTP_PORT` | `1025` (Mailpit) |
| `SMTP_USER` | (empty) |
| `SMTP_PASSWORD` | (empty) |
| `SMTP_FROM` | `PenflowAI <no-reply@penflow.local>` |
| `SMTP_STARTTLS` | `false` |
| `PENFLOW_SERVICE_TOKEN` | Shared engine-to-backend bearer secret; configure securely in the backend and engine process |

### Engine env vars (set in shell before running `main.py`)

| Variable | Default | Purpose |
|---|---|---|
| `PENFLOW_API_URL` | `http://127.0.0.1:4000/api` | Backend API base URL used by the engine's policy and audit client |
| `PENFLOW_SERVICE_TOKEN` | (required; minimum 32 bytes) | Shared engine-to-backend bearer secret; set securely and never log |
| `PENFLOW_LLM_MODEL` | `openai/gpt-oss-120b` | LLM model name passed to Groq |
| `PENFLOW_ALLOWED_HOSTS` | `127.0.0.1,localhost` | Comma-separated hostnames the scope guard allows |
| `PENFLOW_DISABLED_TOOLS` | (empty) | Comma-separated tool names to disable |
| `PENFLOW_ENABLED_TOOLS` | (empty) | Comma-separated tool names to enable (for tools with `default_enabled=False`, e.g. `sqlmap`) |
| `PENFLOW_WORDLIST` | `/usr/share/wordlists/dirb/common.txt` | Wordlist path for ffuf |
| `PENFLOW_WSL_DISTRO` | `kali-linux` | WSL distro name |
| `ZAP_API_URL` | `http://127.0.0.1:8080` | ZAP daemon URL |
| `ZAP_API_KEY` | (empty) | ZAP API key |
| `DRY_RUN` | `false` | Set to `true` for fake tool data |

### LLM setup

- **Provider**: Groq (`groq` Python package)
- **Model**: `openai/gpt-oss-120b` (set via `PENFLOW_LLM_MODEL`; originally planned Llama 3.3 70B but moved to enterprise-only)
- **Used for**: (1) report writing only — plain-language finding text + one executive summary per report, both written by `core/reporting/ai_writer.py`. The ReAct loop no longer calls the LLM (per-finding summaries were removed in Nov 2026). `ask()` accepts optional `max_tokens`, `temperature`, `reasoning_effort`; defaults unchanged.
- **Client file**: `core/agent/llm_client.py`

### Database

- **Backend**: PostgreSQL. Connection via `pg` npm package. Pool size: 10. Auto-migrates on startup via 4 SQL migration files.
- **Tables**: `users`, `sessions`, `login_attempts`, `targets`, `roe_documents`, `runs`, `findings`, `reports`, `audit_events`, `waitlist`, `plan_change_requests`, `password_reset_tokens`, `email_tokens`, `schema_migrations`
- **Roles**: `requester` (default), `reviewer`, `admin`
- **Auth**: bcrypt cost 12; HS256 JWTs (custom, no library); httpOnly cookies; refresh token rotation with reuse detection (revokes all sessions); account lockout after 5 failed logins (15 min)
- **SQLite file** at `backend/data/penflow.db` — appears to be a leftover artifact; real database is Postgres

---

## 6A. REPORT MODULE — `core/reporting/` (built Nov 2026)

One scan -> **one `report.json`** (source of truth, DB-ready) -> **one standalone `report.html`** (print-to-PDF ready) + `report.md`. Python 3.10+, **standard library only** (no Jinja, no new dependencies), runs on Windows.

### File map

| File | Job |
|---|---|
| `core/reporting/__init__.py` | Public API: `generate_report(target, findings, run_status, started, finished, use_ai=True, owner=None, refresh_ai=False) -> {"run_id","dir","json","html","md"}` and `rebuild_report(json_path)`, `load_report(json_path)` |
| `core/reporting/schema.py` | The severity scale (defined ONCE), `SCHEMA_VERSION = "1.0"`, `PROMPT_VERSION`, stable finding ids, `REPORTS_DIR` (override with `PENFLOW_REPORTS_DIR`), text helpers |
| `core/reporting/builder.py` | All facts: counts, durations, tool table, overall rating, `coverage_note`. The AI never writes a number or a table |
| `core/reporting/ai_writer.py` | Token-frugal AI text + cache + built-in fallback text + executive summary |
| `core/reporting/render_html.py` | Self-contained HTML (inline CSS, ~30 lines vanilla JS, no CDN, no external fonts), print CSS for A4 |
| `core/reporting/render_md.py` | Markdown from the same data (what the old `core/report.py` produced) |
| `core/reporting/report.schema.json` | JSON Schema (draft-07) documenting the `report.json` contract |
| `core/reporting/sample_data/sample_findings.json` | 13 sample findings + tool status, used by the tests and the frontend mock |
| `core/reporting/test_reporting.py` | 85 plain asserts, no pytest: `python reporting/test_reporting.py` (from `core/`) |
| `core/report.py` | **Thin shim only.** `save_report(target, findings, status, started, finished) -> (md_path, json_path)` still works; delegates to `generate_report` |

Output layout: `core/reports/<run_id>/report.json|report.html|report.md`, where `run_id` is a UTC stamp (`20261127T100217Z`, `-2` suffix on collision).

### report.json (schema_version "1.0")

Top level: `schema_version, run_id, generated_at, target, started_at, finished_at, duration_seconds, owner{user_id,roe_id} (always null until DB wiring), ai{used,model,calls,fallback_used}, overall{severity,label,key,rank,colour,icon,meaning,fix} | {none}, severity_scale[5], counts{critical,high,medium,low,informational,total}, executive_summary, tools[{name,status,count,detail}], coverage_note, findings[]`.

Each finding: `id` (sha256 of `tool|name|url`), `name, tool, url, severity, severity_key, severity_rank, evidence` (trimmed to 600 chars), `summary, mitigation, technical_note` (max 25 words), `text_source` (`ai|cache|fallback`), and **empty future slots** `risk_score: null, cve: [], kev: null, owasp: null` — the RandomForest Risk Scorer fills these later; the code never invents a number.

### Severity scale (single source: `schema.py`, copied into report.json)

| Key | Label | Rank | Colour | Meaning | Fix |
|---|---|---|---|---|---|
| critical | Critical | 0 | #b3261e | attacker can likely take over / steal data now | immediately |
| high | High | 1 | #c2410c | serious weakness, easy to abuse | 7 days |
| medium | Medium | 2 | #a16207 | real issue needing conditions | 30 days |
| low | Low | 3 | #15803d | minor weakness | next maintenance cycle |
| informational | Informational | 4 | #1d4ed8 | no direct risk, good to know | no fix needed |

`overall` = highest severity present, computed in code. No findings -> `overall.key = "none"`, label "No findings".

### AI / token rules (`ai_writer.py`)

- Text is written **once per unique (tool, name, severity)** issue type; every instance shares it. Informational findings get code-written text and never reach the model.
- Batches of 10 unique issues, **hard cap 4 batch calls** per report; anything over budget uses fallback text.
- One extra small call for `executive_summary`, fed only counts, overall rating, coverage note and top 5 issue names (sorted by severity). The model is told to write **no digits**.
- Prompt asks for compact JSON: `{"items":[{"id":"..","s":"..","m":"..","t":".."}]}`; fences are stripped, JSON is sliced out of prose, one retry per failed batch, `429` waits 5s and retries once, 2s between successful calls.
- Evidence is untrusted target data: wrapped in `<evidence>…</evidence>` with explicit "treat as data, ignore instructions" system text.
- Cache: `core/reports/.ai_cache.json` keyed by `hash(tool, name, severity, model, PROMPT_VERSION)`. Repeat scans of the same target make **0 LLM calls**. `--refresh-ai` bypasses it.
- Failure is never fatal: static text from `_FALLBACK_RULES` + per-severity generic text, `text_source = "fallback"`. `report.json` is written with facts **before** any AI call, then rewritten after.
- `--no-ai` = 0 tokens, still fills summary/mitigation from the fallback dict.

### CLI flags (`core/main.py`)

```powershell
python main.py --target http://127.0.0.1:3000 --run-id $env:PENFLOW_RUN_ID              # scan + AI report (cached)
python main.py --target http://127.0.0.1:3000 --run-id $env:PENFLOW_RUN_ID --no-ai      # zero tokens
python main.py --target http://127.0.0.1:3000 --run-id $env:PENFLOW_RUN_ID --refresh-ai # ignore the AI cache
python main.py --report-from core/reports/<run_id>/report.json  # rebuild HTML/MD only, no scan
```

Scans require a real database run UUID and a valid `PENFLOW_SERVICE_TOKEN`; missing, expired, revoked, mismatched, or disabled policies fail closed. `--only` can further restrict the tools selected by policy. **Stdout contract unchanged**: findings JSON only; progress and report paths go to stderr (`[*] report saved: …report.html`).

### Backend integration plan (Phase 3 — documented only, NOT built)

Goal: the engine's `report.json` becomes the single stored artefact, linked to the authenticated user and the approved ROE, and served to the frontend that already renders it.

1. **Migration `backend/db/migrations/005_report_json.sql`** (extend the existing `reports` table — it already has `run_id UNIQUE → runs`, `owner_id → users`, `markdown`, `generated_at`; `runs` already has `owner_id` and `roe_id`, so `user_id`/`roe_id` come from the run and must match `report.owner`):
   ```sql
   ALTER TABLE reports
     ADD COLUMN report_json JSONB,
     ADD COLUMN schema_version TEXT NOT NULL DEFAULT '1.0',
     ADD COLUMN overall_severity TEXT,
     ADD COLUMN engine_run_id TEXT;
   CREATE INDEX reports_owner_idx ON reports(owner_id, generated_at DESC);
   CREATE INDEX reports_json_gin ON reports USING GIN (report_json jsonb_path_ops);
   ```
2. **Engine -> API bridge** (future `core/publish_report.py`): after `generate_report`, POST the folder's `report.json` + `report.md` to `POST /api/internal/reports` with header `x-penflow-service-token` (no user session). Body: `{ engineRunId, target, report }`. The route validates `schema_version`, looks up the `runs` row, rejects if `run.roe_id` is not approved, inserts/updates the `reports` row, sets `runs.status = 'complete'`, and returns `{ id }`. `owner.user_id` / `owner.roe_id` in report.json are filled from `runs.owner_id` / `runs.roe_id` at insert time.
3. **Endpoints (all behind `authenticate`, owner-or-staff checks):**
   - `GET /api/run-reports` -> list for the current user: `id, run_id, generated_at, overall_severity, counts` (no full JSON, keeps the list light).
   - `GET /api/run-reports/:id` -> `{ id, run_id, generated_at, report: <report_json> }`; the frontend renders that object directly.
   - Never re-render HTML on the server: `report.html` stays a downloadable file, the SPA renders from JSON.
4. **Frontend wiring (already prepared):** `ReportPage` takes an optional `report: ScanReport` prop and defaults to `src/data/sample-report.ts`. Replace the default with a `useApi<{ report: ScanReport }>('/run-reports/:id')` fetch and delete the mock import — no other component changes needed. Types live in `src/lib/reportTypes.ts` and mirror `report.schema.json`.
5. **Retention / audit:** store `schema_version` so old reports remain readable; add an `audit_events` row `report.stored` on insert. Deleting a run cascades to its report (`ON DELETE CASCADE` already set).

### Report module status

- **DONE**: package, schema, builder, AI writer + cache + fallback, standalone HTML (cover, exec summary, severity bar with overall marker, filter chips, Simple/Technical toggle, `<details>` cards, auto-text badge, tool table, AI disclaimer, print CSS), Markdown, CLI flags, `--report-from`, `react_loop.py` per-finding LLM removed, tests (85 checks green).
- **DONE (Phase 2)**: frontend Report page at `/app/reports/engine` — `web/frontend/src/pages/ReportPage.tsx`, typed mirror in `src/lib/reportTypes.ts`, mock data `src/data/sample-report.json` + `sample-report.ts`, styles `.rp-*` appended to `src/styles/global.css` (dark theme + print overrides). "Download PDF" = `window.print()`; `beforeprint` opens every card. Re-verified Nov 2026: `npx tsc --noEmit` and `npx vite build` both exit 0, and the mock JSON contains every field `reportTypes.ScanReport` declares. Route is wrapped in `<RoleGate roles={['requester']}>` in `router.tsx`.
- **Phase 1 files (all done, in build order)**: `schema.py` (severity scale, stable ids, `REPORTS_DIR`) → `builder.py` (all facts: counts, durations, tool table, overall, `coverage_note`) → `render_html.py` (self-contained HTML, filter chips, Simple/Technical toggle, print CSS) → `ai_writer.py` (issue-type batching, hard call cap, cache, fallback dict) → `render_md.py` (Markdown from the same data) → `main.py` / `react_loop.py` / `llm_client.py` edits (`--no-ai`, `--refresh-ai`, `--report-from`; per-finding LLM call removed, `f["summary"] = f["name"]`; `ask()` gained `max_tokens` / `temperature` / `reasoning_effort` with unchanged defaults) → `test_reporting.py` (85 plain asserts, green). `core/report.py` is a thin shim.
- **PARTIAL (Phase 3)**: backend JSONB persistence and `ingestReport(runId, reportFolderName)` are implemented. The engine caller remains unwired; the planned `/api/run-reports` endpoints and engine report-page API wiring are not built.
- **Known issues**: `header_checks` still makes a real HTTP request in `--dry-run` (pre-existing, it is a pure-Python tool); AI text is English-only; the AI executive summary is cached by payload hash, so changing counts invalidates it by design; the frontend report page still uses mock data.

### Progress log

- 2026-11-27 — Phase 1 reporting module built and committed (`feat(core): reporting module`); 85 test checks pass; `--no-ai` dry run verified end-to-end.
- 2026-11-27 — Phase 2 frontend Report page built and committed (`feat(web): engine report page`); `npm run typecheck` and `npm run build` pass.
- 2026-11-27 — Phase 3 backend integration plan written (documented only).
- 2026-11-27 — Phase 1 re-verified end-to-end: `python reporting/test_reporting.py` = 85/85 pass; sample-data `--no-ai` run regenerated `report.json`/`report.html`/`report.md` under `core/reports/` for manual review of the HTML. No Phase 2/3 work started.
- 2026-11-27 — Phase 2 re-verified against its spec (overall badge, severity bar with marker, exec summary, filter chips, Simple/Technical toggle, cards, tool table, `window.print()` + print CSS, typed mirror, mock data, no backend changes, no new dependencies). `tsc --noEmit` and `vite build` exit 0; zero-findings edge case confirmed (`overall.key = "none"` still carries `colour`/`icon`, so the badge renders). Phase 3 route plan already written in 6A — nothing built.

---

## 7. Code Conventions

- **Backend**: TypeScript (strict), ESM modules (`"type": "module"`), no framework beyond Express. Functions are small, flat, and named clearly. No classes. Helpers extracted once and reused (e.g. `route()`, `safeUser()`, `safeRoe()`). No `any` casts where avoidable. All routes use `route()` wrapper for async error propagation.
- **Python engine**: Python 3 with type hints. Functions and modules have one responsibility. `@register` decorator pattern for tools. `ToolError` / `ToolSkipped` exceptions propagate cleanly without killing the loop. Findings are plain dicts with keys: `tool`, `name`, `risk`, `url`, `evidence`.
- **Frontend**: React 18 functional components, hooks only. `useApi<T>()` custom hook for all data fetching. TypeScript strict. No external UI library — custom components in `components/ui.tsx`. IBM Plex Sans / IBM Plex Mono fonts (self-hosted via `@fontsource`). CSS custom properties for design tokens.
- **Naming**: `snake_case` in Python and SQL; `camelCase` in TypeScript; `kebab-case` for CSS classes and file names.
- **Secrets**: never logged, never in code. `.env` files are gitignored. Email tokens stored as SHA-256 hashes only.
- **No dead code rule**: the developer actively enforces no unused imports, no debug prints, no commented-out code, no speculative abstractions.

---

## 8. Rules for AI Agents

1. **Lab targets only.** The engine must only test `127.0.0.1`, `localhost`, or hosts explicitly in `PENFLOW_ALLOWED_HOSTS`. Never point tools at a live internet host.
2. **Never touch live sites.** Even if a URL is passed, `check_scope()` will raise `ScopeError`. Do not modify or bypass `check_scope()`.
3. **No secrets in code or logs.** Never hardcode API keys, tokens, or passwords. Never log token values, JWT payloads, email bodies, or reset links. Log only audit event metadata.
4. **Do not change the LLM setup.** The model is `openai/gpt-oss-120b` via Groq. Do not swap the provider, change the model name, or change `core/agent/llm_client.py` without explicit instruction. The model choice is documented and defensible for the FYP.
5. **Keep changes small.** Edit only the files the task requires. Do not reformat or refactor code outside the task scope. Minimal diffs only.
6. **Do not delete existing files** unless you created them in this task and they are now unused. Check all imports before deleting anything. Never delete migrations, lockfiles, Documentation/, or `.env.example`.
7. **Scope Guard must stay in the tool path.** Every engine tool dispatch must go through `ScopeGuard.run()`, which rebuilds safe arguments before calling `run_tool()` and `check_scope()`. Never call a tool wrapper function directly in a way that skips scope checking.
8. **Backend and engine are not wired together yet.** Do not assume that creating a run via the web UI triggers the Python engine. They are separate systems at this stage.
9. **Out of scope for this FYP.** Do not implement or plan: IDOR/BOLA detection, CI/CD pipeline integration, multi-agent orchestration, or any testing against live company/internet sites. These are explicitly listed as post-FYP future work in `Documentation/PHASES.md`.
10. **Detection logic must be custom, not only tool integration.** The FYP differentiator is custom algorithms (ROE fraud detection, risk scoring with CVE/CISA KEV correlation). Do not substitute these with a simple call to an existing tool. Tool wrappers feed raw data; the custom logic processes it.

---

## 9. STATUS

### Done

- **Phase 0 (Planning & Docs)**: SRS, diagrams, pitch deck, WBS all complete.
- **Core engine — tool wrappers**: 9 tool wrappers implemented (8 in TOOL_ORDER, nikto registered but not in TOOL_ORDER) (`nmap`, `whatweb`, `wafw00f`, `ffuf`, `header_checks`, `nuclei`, `zap`, `nikto`, `sqlmap`). `--dry-run` mode works.
- **Core engine — ReAct loop**: `core/agent/react_loop.py` runs tools in fixed order, catches errors/crashes gracefully. It no longer calls the LLM (Nov 2026): `f["summary"] = f["name"]` and all AI text is written once per report by the reporting module.
- **Core engine — Logger**: `core/logging_system/action_logger.py` writes per-run JSONL logs. Existing log files in `logging_system/logs/` confirm it has been run.
- **Core engine — Report Writer**: built Nov 2026 in `core/reporting/` (see section 6A). One scan -> `core/reports/<run_id>/report.json` (source of truth) + `report.html` (standalone, print-to-PDF) + `report.md`. Token-frugal AI text with a disk cache and static fallback. Old `core/report.py` is a thin shim. Tests: `python reporting/test_reporting.py` (85 checks, all green).
- **Core — ROE Validator module**: `core/roe_validator/` validates ROE fields, dates, blocked/private targets, and ownership tokens via DNS, a well-known file, or homepage meta. It is standalone: no DB/auth, no scan-logic changes, and no caller sets `lab_mode` by default.
- **Scope Guard — steps 1–3**: the policy builder/API bind restrictive policies to the owner, ROE, verified target, and run. The engine now loads the exact run policy through the service-authenticated backend API, checks its schema/hash/window/target, applies current admin tool toggles, and audits each allow/block. The first adapters are nmap (pinned IP and target port, reconstructed flags) and passive single-page ZAP; other tools are not dispatched by the guarded engine.
- **Backend — Auth system**: full auth stack done: registration, email verification, login with lockout, JWT access + refresh tokens, session management, password reset, rate limiting, RBAC, CSRF protection, security headers, audit logging. 4 DB migrations applied. Email verification and password reset: implemented, not verified end-to-end.
- **Backend — ROE workflow**: migration 006, Python validator bridge, validation/submission, per-target ownership verification, reviewer decisions, admin lab-mode/revocation controls, and run gating are implemented. The frontend now collects tools and authorization windows and limits run targets to approved ROE scope. Typechecks and isolated bridge tests pass; DB-backed workflow tests require `TEST_DATABASE_URL` and were not run.
- **Backend — API endpoints**: targets, ROE documents (upload + manual review queue), runs (simulated), findings, reports, billing (simulated), admin views all wired.
- **Backend — Email**: nodemailer sender + templates for verification, password reset, password changed, account-exists notice.
- **Frontend — Full SPA**: all pages built: Dashboard, Targets, ROE upload, ROE status, Runs, Run Monitor, Findings, Reports, Billing, Settings, Review Queue, Admin (users, tools, models, audit-log), all auth pages, all public/legal pages. **DONE.**
- **Frontend — Auth integration**: login, signup, session management, email verification, password reset flows all wired to backend API. **DONE.**
- **Frontend — Dashboard and role entry**: dashboard report timestamps are normalized by migration 007 for legacy databases; sign-in and `/app` route users to their role's workspace, and the workspace logo returns to the public landing page.
- **Frontend — engine report page**: `/app/reports/engine` renders a real `report.json` (mock file for now) with overall badge, severity scale, filter chips, Simple/Technical toggle, finding cards and tool coverage. PRINT/PDF via `window.print()`. **DONE (mock data).** Files: `src/pages/ReportPage.tsx`, `src/lib/reportTypes.ts`, `src/data/sample-report.*`, `.rp-*` styles in `global.css`.

### In Progress

- **Business/pitch deck**: 14-slide entrepreneurial pitch deck is planned but not complete (per `Documentation/PHASES.md`).

### Next Task

Await user approval before the next Scope Guard step. Runtime enforcement currently supports only guarded nmap and passive single-page ZAP; expanding adapters requires separate approval. Report ingestion from the engine remains a separate unwired task.

### Known Issues

- **ROE automated analysis not connected**: every uploaded ROE document is saved with `automated_decision = 'not_connected'` and goes straight to manual review. The fraud-detection algorithm is not built; the current validator does not determine document authenticity.
- **Risk Scorer not built**: findings have no numeric `risk_score` from a model; the DB columns exist but are unused by the engine.
- **Scope Guard adapter coverage is intentionally limited**: only nmap and passive single-page ZAP are supported by the engine dispatcher; other tools are not run. ZAP's classic spider remains unsuitable for crawling the Juice Shop SPA. Engine-to-report ingestion is not wired.
- **Backend has a stale SQLite file**: `backend/data/penflow.db` exists but the real database is Postgres. The SQLite file should not be used.
- **`.pgverify/` in repo root**: an untracked embedded-Postgres data directory; not in `.gitignore` by name. `AUTH_PROGRESS.md` notes old SQLite files in `backend/data/` as a cleanup item.
- **ZAP with Juice Shop (SPA)**: `zap_wrapper.py` notes that the classic ZAP spider can't crawl single-page apps like Juice Shop — the AJAX spider would be needed.
- **Frontend visual bugs**: mentioned as a backlog item but specific bugs are not documented in code.
- **ReAct loop uses a fixed tool order**: `TOOL_ORDER` in `react_loop.py` is a hardcoded list. The LLM does not choose which tools to run or in what order (it only writes report text now).
- **Report ingestion is not invoked automatically**: `ingestReport(runId, reportFolderName)` persists report JSON and findings for the run owner, but is intentionally not called until an engine/orchestrator caller is added.
- **ROE Validator is standalone**: `core/roe_validator/` is not wired into the Scope Guard or scan pipeline; `lab_mode` must only be supplied explicitly by a caller.

### Progress log

- 2026-11-28 — Added backend report JSON persistence and owner-derived ingestion, fixed report-list timestamps, returned JSONB in the owner-filtered report endpoint, and added cross-user ingestion tests. The ingestion function is intentionally not wired to a completion endpoint or core code. Files: `backend/db/migrations/005_report_json.sql`, `backend/db/index.ts`, `backend/reporting/ingest-report.ts`, `backend/routes/api.ts`, `backend/tests/auth.test.ts`, `web/frontend/src/lib/types.ts`, `web/frontend/src/components/ui.tsx`, `AGENTS.md`. Next: connect the engine caller with both the DB UUID and timestamp folder name.
- 2026-11-28 — Added the standalone ROE Validator and 13 mocked network/validation tests; existing `check_scope()` and scan logic were not changed. Files: `core/roe_validator/__init__.py`, `__main__.py`, `rules.py`, `network.py`, `ownership.py`, `cli.py`, `tests/test_roe_validator.py`, `AGENTS.md`. The validator and report-ingestion caller remain intentionally unwired.
- 2026-11-28 — Added the backend ROE validation and ownership workflow, role-gated review/admin actions, and run-time scope/window checks; added frontend ROE scope controls and injectable-validator tests. Backend/frontend typechecks and the isolated validator bridge tests pass. Database-backed tests were not run because `TEST_DATABASE_URL` is unset. Files: `backend/db/migrations/006_roe_validation.sql`, `backend/db/index.ts`, `backend/db/seed.ts`, `backend/db/reset.ts`, `backend/package.json`, `backend/roe/validator-client.ts`, `backend/routes/api.ts`, `backend/tests/auth.test.ts`, `backend/tests/roe-validator-client.test.ts`, `web/frontend/src/pages/AppPages.tsx`, `AGENTS.md`.
- 2026-11-28 — Fixed requester dashboard loading against the existing legacy reports schema with migration 007, routed users to role-appropriate pages after login, and made the workspace logo return to the public home page. Verified requester dashboard and admin users page in the running app; backend/frontend typechecks pass. Files: `backend/db/index.ts`, `backend/db/migrations/007_report_generated_at.sql`, `web/frontend/src/lib/session.tsx`, `web/frontend/src/pages/AuthPages.tsx`, `web/frontend/src/router.tsx`, `web/frontend/src/components/ui.tsx`, `AGENTS.md`.
- 2026-11-28 — Scope Guard step 1 adds versioned scope policies, run-to-policy/target binding columns, and tool-call audit storage in migration 008; migration registration and database test/reset cleanup are updated. Backend typecheck passes; database migration and integration tests await a disposable `TEST_DATABASE_URL`. Next: policy extraction and owner/admin policy API after user approval. Files: `backend/db/migrations/008_scope_policies.sql`, `backend/db/index.ts`, `backend/db/reset.ts`, `backend/tests/auth.test.ts`, `AGENTS.md`.
- 2026-11-28 — Scope Guard step 2 adds Rules-only policy extraction, schema validation, code-side tool/flag/limit/time-window narrowing, policy hashing, and backend policy lifecycle/run binding with owner/admin access. Reviewer access is admin-only; the admin tools page now controls the catalog. Backend/frontend typechecks and isolated policy/validator tests pass; DB-backed migration/isolation tests await a disposable `TEST_DATABASE_URL`. Next: implement engine enforcement and wrap nmap/ZAP. Files: `core/scope_guard/`, `core/requirements.txt`, `backend/scope-guard/policy-client.ts`, `backend/db/migrations/008_scope_policies.sql`, `backend/db/migrations/009_scope_tool_settings.sql`, `backend/db/index.ts`, `backend/db/reset.ts`, `backend/routes/api.ts`, `backend/tests/auth.test.ts`, `backend/tests/policy-client.test.ts`, `backend/package.json`, `web/frontend/src/pages/AppPages.tsx`, `web/frontend/src/router.tsx`, `web/frontend/src/components/ui.tsx`, `web/frontend/src/lib/types.ts`, `AGENTS.md`.
- 2026-11-28 — Scope Guard step 3 adds service-authenticated run-policy retrieval and audit writes, fail-closed policy/hash/window/target checks, pinned target validation, and guarded nmap/passive-ZAP dispatch. The CLI now requires `--run-id`; target addresses are restricted to local lab ranges and live/public addresses are rejected even in lab mode. Tests: Scope Guard 24/24, ROE Validator 16/16, and reporting 85/85 pass; backend typecheck and isolated service-token test pass. DB-backed integration tests were not run. Files: `backend/auth/service-token.ts`, `backend/routes/internal.ts`, `backend/app.ts`, `backend/.env.example`, `backend/tests/internal-auth.test.ts`, `backend/package.json`, `core/scope_guard/policy_client.py`, `core/scope_guard/target_check.py`, `core/scope_guard/tool_wrapper.py`, `core/scope_guard/tests/test_policy_client.py`, `core/scope_guard/tests/test_target_check.py`, `core/scope_guard/tests/test_tool_wrapper.py`, `core/tools/big_tools/nmap_wrapper.py`, `core/tools/big_tools/zap_wrapper.py`, `core/agent/react_loop.py`, `core/main.py`, `AGENTS.md`. Next: wait for approval before expanding guarded adapters or wiring report ingestion.
- 2026-11-28 — Fixed backend test fixtures for the strict scope-policy contract. The policy-builder mock omitted four mandatory blocked actions; the run workflow test used the obsolete `target` request field, omitted `policyId`, and added a second ROE target without a matching ownership verification. Updated only test setup; no production policy checks were loosened. Full backend suite: 25/25 pass; backend typecheck passes. Files: `backend/tests/auth.test.ts`, `AGENTS.md`. Next: await the next task.
- 2026-11-28 — Repaired the seven ROE DOCX fixtures with separate normalized validator fields, clean section headings, and timezone-aware authorization windows; added pytest coverage for validator decisions and Rules extraction. The forgery fixture is rejected by expiry only: the current validator has no authenticity/fraud detector. Tests: fixture pytest 8/8; combined fixture, ROE Validator, and Scope Guard tests 48/48. No production validation or extraction logic changed. Files: `core/tests/fixtures/roes/ROE-01_Normal_UserA.docx`, `ROE-02_Different_UserA.docx`, `ROE-03_UserB.docx`, `ROE-04_PromptInjection.docx`, `ROE-05_NoRulesSection.docx`, `ROE-06_BroadAsk_StrictRules.docx`, `ROE-07_Forged_Fraud.docx`, `core/tests/test_roe_scope_fixtures.py`, `AGENTS.md`. Next: await user approval for the next task.

---

## 10. BACKLOG

The following items are planned but not yet started (confirmed from `Documentation/PHASES.md` and the user's stated requirements):

| Item | Description |
|---|---|
| **ROE Validator — automated** | Build the custom fraud/tampering detection algorithm that reads an uploaded ROE document and decides if it is genuine (RandomForest is only for the Risk Scorer). Currently every upload goes straight to manual review with `automated_decision = 'not_connected'`. |
| **ROE Validator — manual** | The manual review queue UI and backend endpoints exist. What is missing: proper notification to reviewers, and the connection to the automated check result feeding into the queue. |
| **Scope Guard — adapter coverage** | Extend the fail-closed runtime guard beyond its current nmap and passive single-page ZAP adapters; every added tool needs safe argument reconstruction, exact target pinning, limits, and audit coverage. |
| **Report Writer — better reporting** | Add a dual-summary format: (1) technical summary with CVE IDs, CVSS-style reasoning, evidence; (2) plain-language summary for non-technical stakeholders. Currently the report is a flat Markdown table. |
| **More tools** | Additional wrappers (e.g. AJAX spider for ZAP, Burp Suite integration, custom SQLi/XSS scripts). |
| **Database storage linked to user** | Engine scan results (findings, reports) are written to files only. They need to be inserted into the Postgres DB and linked to the authenticated user's run record. |
| **Admin panel — tools on/off** | The API stub exists (`GET /admin/tools` returns a hardcoded list). Build real toggle endpoints and wire them to `PENFLOW_DISABLED_TOOLS` / `PENFLOW_ENABLED_TOOLS` or a DB table. |
| **Admin panel — view/change AI model** | The API stub exists (`GET /admin/models` returns hardcoded data). Build a real endpoint that reads and writes the model selection, and passes it to the engine. |
| **Admin panel — approve/reject ROE** | The reviewer queue UI and `POST /review/:id` endpoint exist. What is missing: admin-specific override capability and the trigger to issue a scope token to the engine. |
| **Admin panel — user management** | `GET /admin/users` exists (read-only). Missing: activate/deactivate user, change role, manual plan assignment. |
| **Connect frontend to engine** | The web UI creates simulated runs only. Need a bridge: web run → trigger Python engine → engine writes findings to DB → frontend displays real results. |
| **Fix visual bugs** | UNKNOWN — user mentioned visual bugs exist but specific details not found in code. |
| **User's own model API key** | Allow users to supply their own Groq (or other provider) API key so they are not rate-limited by the platform's key. |

---

## UPDATE PROTOCOL

**After every finished subtask, update the STATUS section above before starting the next one.**

Write in STATUS:
- What changed (1–3 sentences)
- Which files were modified or created
- What is next
- Any new known bug or issue discovered

Keep each STATUS update short. Never contradict or delete earlier STATUS entries — append or amend only.

