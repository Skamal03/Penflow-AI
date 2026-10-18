# PenflowAI

**An AI-Orchestrated Web Penetration Testing Platform with Authorization Verification, Enforced Scope, and Threat-Aware Risk Scoring**

PenflowAI is an AI-driven system that automates the full web penetration testing workflow — from verifying that a test is actually authorized, through scanning and controlled exploitation, to risk-scored, plain-language reporting. It is built as a Final Year Project (FYP) at Riphah International University, and is designed with an eye toward eventually operating as a SaaS product.

Unlike most existing AI pentesting tools, which focus purely on finding bugs faster, PenflowAI adds a trust and governance layer around the process: it checks whether the permission document (ROE) that authorizes a test is genuine before anything runs, technically restricts the AI agent to only the approved targets, and scores each finding using both business impact and real-world attack data — not just theoretical severity.

---

## Related Documents

| Document | What it covers |
|---|---|
| [SRS_PenflowAI.md](./SRS_PenflowAI.md) | Full requirements, environment setup, and model training |
| [PHASES.md](./PHASES.md) | The whole project broken into phases, with checklists |
| [WEBSITE_GUI.md](./WEBSITE_GUI.md) | Website and web GUI (SaaS) specification, pricing and subscription page, compliance, accessibility, security |
| [WEBSITE_LEGAL_PAGES.md](./WEBSITE_LEGAL_PAGES.md) | Draft Privacy, Terms, Cookie, Refund and Acceptable Use pages, plus form consent wording |
| [WEB_UI_BUILD_PLAN.md](./WEB_UI_BUILD_PLAN.md) | UI-first build plan for the web frontend: stack, routes, the CLI JSON data contract, screen priorities, accessibility rules |

---

## Table of Contents

1. [Overview](#overview)
2. [Key Features](#key-features)
3. [How It Works — The Pipeline](#how-it-works--the-pipeline)
4. [ROE Validation System](#roe-validation-system)
5. [AI Model](#ai-model)
6. [Pentesting Stages (AI-Driven)](#pentesting-stages-ai-driven)
7. [Scope Limitation](#scope-limitation)
8. [Tool Integration Layer](#tool-integration-layer)
9. [Risk Assessment](#risk-assessment)
10. [CVE Check & Actively Exploited Vulnerabilities](#cve-check--actively-exploited-vulnerabilities)
11. [Vulnerability Organizing](#vulnerability-organizing)
12. [Report Writing](#report-writing)
13. [Logging & Audit Trail](#logging--audit-trail)
14. [Tech Stack](#tech-stack)
15. [Project Scope](#project-scope)
16. [Installation & Setup](#installation--setup)
17. [Usage](#usage)
18. [Ethical Use & Disclaimer](#ethical-use--disclaimer)
19. [Roadmap](#roadmap)
20. [Contributors](#contributors)
21. [References](#references)
22. [License](#license)
23. [Full File Structure](#full-file-structure)

---

## Overview

Manual web application penetration testing is slow, expensive, and requires skilled testers — a real barrier for small teams and startups. Existing AI-based pentesting tools solve the speed problem, but introduce a new one: an AI agent working without proper checks can test something it was never authorized to touch, or misjudge how serious a bug really is because it has no visibility into real-world attacker behavior.

PenflowAI is built to close that specific gap. It combines automated vulnerability scanning with:

- Verification that the testing authorization itself is genuine
- Hard technical enforcement of what the agent is allowed to touch
- Risk scoring that factors in real-world exploitation activity, not just internal business impact
- A full, timestamped record of everything the AI agent did

---

## Key Features

- **ROE Validation** — automated and manual checks confirm the Rules of Engagement document is genuine before testing starts
- **Scope Limitation (Scope Guard)** — the AI agent is technically restricted to only the targets approved in the ROE
- **Full AI-Driven Pentesting Pipeline** — reconnaissance, scanning, vulnerability identification, and controlled exploitation are all performed by the AI agent
- **Tool Orchestration** — the AI model runs and coordinates both large, well-known pentesting tools and small custom utility scripts, through a single pipeline
- **Extensible Tool Layer** — new tools can be plugged into the system without reworking the core agent
- **Risk Assessment** — a RandomForest machine learning model scores each finding using business context and threat modelling
- **CVE & Active Exploitation Check** — findings are cross-referenced against CVE data and known actively-exploited vulnerability feeds
- **Vulnerability Organizing** — findings are sorted and categorized (by severity, type, and affected component) before reporting
- **AI-Generated Reporting** — a plain-language report is produced automatically for both technical and non-technical readers
- **Action Logging** — every step the AI agent takes is recorded with a timestamp, creating a full audit trail
- **SaaS-Ready Architecture** — the core engine and the web interface are built as separate components, so the platform can be offered as a hosted service

---

## How It Works — The Pipeline

```
ROE Document
     │
     ▼
ROE Validation (automated + manual)
     │
     ├── Invalid → Reject, no token issued, testing does not proceed
     │
     ▼ Valid
Scope Token Generated
     │
     ▼
Scope Guard (enforces approved targets only)
     │
     ▼
AI Pentesting Agent (recon → scanning → identification → controlled exploitation)
     │
     ├──────────────► Logger (records every action, timestamped)
     ▼
Findings
     │
     ▼
Risk Scorer (RandomForest + threat modelling + CVE / KEV data)
     │
     ▼
Vulnerability Organizer (sorted by severity, type, component)
     │
     ▼
Report Writer (AI-generated, plain language)
     │
     ▼
Final Report
```

---

## ROE Validation System

Before any testing begins, PenflowAI verifies that the Rules of Engagement (ROE) document is genuine and unaltered. This happens in two layers:

### Automated Steps
- Parses the submitted ROE document (structure, fields, target list, authorized dates/time window)
- Checks for signs of tampering — inconsistent formatting, edited fields, mismatched or missing signatures, broken document metadata
- Cross-checks the listed scope, dates, and authorizing signatory against expected patterns using a trained fraud-detection model
- Flags any document that fails these automated checks and halts the pipeline — no scope token is issued for a failed document

### Manual Steps
- Documents flagged as suspicious, borderline, or incomplete by the automated check are routed to a human reviewer for confirmation
- A reviewer can approve, reject, or request a corrected document before testing is allowed to proceed
- Every manual decision (who reviewed it, what was decided, and when) is recorded as part of the audit trail
- This manual layer exists specifically for edge cases the automated model isn't confident about — it is a safety net, not the primary check

Only after a document passes both layers is a **scope token** generated, which is what actually unlocks the rest of the pipeline.

---

## AI Model

PenflowAI's reasoning engine is built on **GPT-OSS** (OpenAI's open-weight model family, accessed via the Groq API), used in a **ReAct (Reason + Act)** loop. The model:

- Reasons about what testing step to take next based on what it has already found
- Drives tool selection and execution during the pentesting stages
- Powers the final plain-language report generation

> **Note:** The project originally targeted Llama 3.3 (70B) via Groq. Groq moved that model to an enterprise-only tier in August 2026, so the platform now runs on **GPT-OSS (gpt-oss-120b)**, which Groq's own documentation recommends as a free-tier replacement with comparable or better performance. The model can be swapped again in the future with minimal changes to the agent logic, since the pipeline is not hard-wired to one specific model.

---

## Pentesting Stages (AI-Driven)

All core stages of a penetration test are carried out by the AI agent, not scripted separately:

1. **Reconnaissance** — discovers the target's structure, endpoints, and technologies in use
2. **Scanning & Enumeration** — probes discovered endpoints and inputs for weaknesses
3. **Vulnerability Identification** — matches observed behavior against known vulnerability patterns
4. **Controlled Exploitation** — attempts safe, limited proof-of-concept exploitation to confirm a finding is real, within the boundaries set by the Scope Guard
5. **Result Collection** — findings, evidence, and context are handed off to the Risk Scorer

> Exploitation is intentionally kept limited and controlled rather than exhaustive. The priority of this project is reliable vulnerability discovery; deeper, more aggressive exploitation chains are a future extension, not a guarantee of the current system.

---

## Scope Limitation

The **Scope Guard** component sits between the ROE Validation step and the AI agent. It:

- Holds the exact list of approved targets from the validated ROE
- Physically blocks the AI agent from sending requests to anything outside that list
- Requires a valid scope token to activate — without one, the agent does not run at all

This is one of PenflowAI's core differentiators: most existing tools rely on the agent "remembering" its instructions or a loosely enforced allow-list. PenflowAI enforces scope as a hard technical boundary, not a prompt-level instruction.

---

## Tool Integration Layer

The AI model does not test manually — it drives and orchestrates a library of underlying pentesting tools, including:

- **Large, established tools** — e.g. Nmap, Nikto, SQLMap, OWASP ZAP, Burp Suite (where scriptable)
- **Small, purpose-built scripts** — custom Python utilities for specific checks the larger tools don't cover well

The tool layer is built to be **extensible**: new tools can be registered and made available to the AI agent without changes to the core reasoning loop, so the platform's capabilities can grow over time without a redesign.

---

## Risk Assessment

Each confirmed finding is scored by a **RandomForest** machine learning model that combines:

- **Business context** — what the affected asset is, and how critical it is
- **Threat modelling** — how the vulnerability could realistically be used against the system
- **Real-world exploitation data** — whether this type of vulnerability is being actively exploited right now (see below)

This produces a single, explainable risk score per finding, rather than a generic "high/medium/low" label with no reasoning behind it.

---

## CVE Check & Actively Exploited Vulnerabilities

Findings are cross-referenced against public vulnerability intelligence sources, including:

- **CVE / NVD data** — to identify the formal vulnerability classification, where applicable
- **CISA's Known Exploited Vulnerabilities (KEV) catalog** — to check whether a vulnerability type is currently being actively exploited by real attackers

This lets the Risk Scorer distinguish between a bug that is theoretically serious and one that is a live, active target for attackers — a distinction most competing tools don't make at all.

---

## Vulnerability Organizing

Before reaching the report stage, findings are automatically sorted and grouped by:

- **Severity** (from the Risk Scorer)
- **Vulnerability type** (e.g. injection, authentication, misconfiguration)
- **Affected component / endpoint**

This keeps the final report structured and avoids dumping an unsorted list of raw findings on the reader.

---

## Report Writing

The same AI model that drives testing is used to generate the final report. The report:

- Explains each finding in plain language, avoiding unnecessary jargon
- Is understandable by both technical staff (developers, security engineers) and non-technical stakeholders (managers, business owners)
- Includes the risk score and reasoning behind it for each finding
- Groups findings using the structure produced by the Vulnerability Organizer

---

## Logging & Audit Trail

Every action the AI agent takes — every request sent, every tool invoked, every decision made — is logged with a timestamp. This log:

- Provides a complete, reviewable record of what happened during a test
- Supports accountability and trust, especially important given the agent is acting autonomously
- Is kept alongside the ROE validation decisions (automated and manual) for a single, end-to-end audit trail

---

## Tech Stack

| Layer | Technology |
|---|---|
| Core engine / AI agent | Python |
| AI reasoning & reporting model | GPT-OSS (gpt-oss-120b) via Groq API |
| Agent reasoning method | ReAct (Reason + Act) loop |
| Risk scoring model | scikit-learn (RandomForest) |
| Pentesting execution environment | Kali Linux (via WSL2 or native) |
| Web interface | Separate front-end application (decoupled from the core engine, to support a SaaS deployment model) |
| Threat intelligence source | CISA Known Exploited Vulnerabilities (KEV) catalog, CVE/NVD data |
| Version control | Git and GitHub |
| Test targets (development) | OWASP Juice Shop, DVWA |

> The web interface is intentionally kept as a separate component from the core Python engine. This lets the core pentesting/AI logic run as an independent backend service, which the web front-end (and eventually a SaaS platform) communicates with via an API — rather than being tightly coupled into a single monolithic application.

---

## Project Scope

**Included:**
- ROE authenticity validation (automated + manual)
- Enforced scope limitation for the AI agent
- Full AI-driven scanning and controlled exploitation
- Extensible tool integration layer
- Risk scoring using business context + threat intelligence
- CVE / active-exploitation cross-referencing
- Vulnerability organizing
- Full action logging
- AI-generated plain-language reporting

**Not included (current version):**
- Deep business-logic vulnerability detection (e.g. complex IDOR/BOLA chains requiring business-process understanding)
- Continuous testing as part of a CI/CD pipeline
- Multiple AI agents operating in parallel
- Testing of live, production, third-party systems — development and testing are limited to authorized lab environments

---

## Installation & Setup

```bash
# 1. Clone the repository
git clone https://github.com/<your-org>/penflowai.git
cd penflowai

# 2. Create and activate a virtual environment
python3 -m venv venv
source venv/bin/activate      # On Windows: venv\Scripts\activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Configure environment variables
cp .env.example .env
# Add your Groq API key and any other required config into .env

# 5. Set up the pentesting environment
# PenflowAI expects a Kali Linux environment (native, VM, or WSL2)
# with the required tools installed (see tools/requirements-tools.txt)

# 6. Run the core engine
python main.py --help
```

---

## Usage

```bash
# Example: run a full test against an authorized lab target
python main.py --target http://localhost:3000 --roe ./data/sample_roe.pdf

# Example: run only the ROE validation step
python main.py --validate-roe ./data/sample_roe.pdf

# Example: generate a report from a previous run's findings
python main.py --report --run-id <run_id>
```

> Exact command-line arguments depend on the current implementation — check `main.py --help` for the up-to-date list of options.

---

## Ethical Use & Disclaimer

PenflowAI is built strictly for **authorized security testing**. It must only be used against:

- Systems you own, or
- Systems you have explicit, documented, and verifiable permission to test (a valid ROE)

Using PenflowAI, or any of the tools it orchestrates, against systems without proper authorization is illegal in most jurisdictions and is explicitly against the intended use of this project. This project was developed and tested exclusively against safe, legal lab environments (OWASP Juice Shop, DVWA). The authors are not responsible for misuse of this tool.

---

## Roadmap

Planned future directions beyond the current FYP scope:

- Business-logic vulnerability detection (IDOR, BOLA, workflow bypass)
- CI/CD pipeline integration for continuous testing
- Multi-agent orchestration for parallel testing
- Broader authentication handling (MFA, SSO, token rotation)
- Expanded tool library and community-contributed tool plugins
- Full SaaS deployment with subscription billing
- Formal red-team/production-scale validation

---

## Contributors

- **Muhammad Sunnan** — BSCY-7, Riphah International University
- **Hamza Ahmad Baig** — BSCY-7, Riphah International University

**Supervised by:**
- Ms. Kanza Zafar (Lecturer, Supervisor)
- Mr. Sameer Sohail (Co-Supervisor)

Riphah School of Computing & Innovation, Riphah International University, Lahore, Pakistan

---

## References

- Escape – AI Penetration Testing Platform. https://escape.tech
- XBOW – Autonomous AI Security Testing. https://xbow.com
- Burp Suite AT – PortSwigger. https://portswigger.net/burp
- CISA Known Exploited Vulnerabilities (KEV) Catalog. https://www.cisa.gov/known-exploited-vulnerabilities-catalog
- OWASP Juice Shop. https://owasp.org/www-project-juice-shop/
- DVWA – Damn Vulnerable Web Application. https://dvwa.co.uk
- scikit-learn documentation – RandomForestClassifier. https://scikit-learn.org
- Groq – Model Deprecations & GPT-OSS documentation. https://console.groq.com/docs/deprecations

---

## License

This project is developed as an academic Final Year Project. License terms (e.g. MIT, Apache 2.0) are to be finalized before any public or commercial release.

---

## Full File Structure

```
penflowai/
├── README.md
├── LICENSE
├── requirements.txt
├── .env.example
├── main.py
│
├── roe_validation/
│   ├── __init__.py
│   ├── automated_check.py        # fraud/tampering detection model
│   ├── manual_review.py          # manual review queue & decision recording
│   ├── token_issuer.py           # generates the scope token on approval
│   └── models/
│       └── roe_fraud_model.pkl
│
├── scope_guard/
│   ├── __init__.py
│   ├── enforcer.py                # blocks agent actions outside approved scope
│   └── target_list.py
│
├── agent/
│   ├── __init__.py
│   ├── react_loop.py               # core ReAct reasoning loop
│   ├── llm_client.py                # GPT-OSS / Groq API wrapper
│   ├── recon.py
│   ├── scanning.py
│   ├── vulnerability_identification.py
│   └── controlled_exploitation.py
│
├── tools/
│   ├── __init__.py
│   ├── tool_registry.py            # plugin-style registry for adding new tools
│   ├── big_tools/
│   │   ├── nmap_wrapper.py
│   │   ├── sqlmap_wrapper.py
│   │   ├── zap_wrapper.py
│   │   └── nikto_wrapper.py
│   └── custom_scripts/
│       ├── header_checks.py
│       ├── file_upload_check.py
│       └── csrf_check.py
│
├── risk_scoring/
│   ├── __init__.py
│   ├── random_forest_model.py
│   ├── threat_modelling.py
│   ├── cve_lookup.py                # CVE / NVD integration
│   ├── kev_check.py                 # CISA KEV integration
│   └── models/
│       └── risk_scorer.pkl
│
├── vulnerability_organizer/
│   ├── __init__.py
│   └── sorter.py                    # groups/sorts by severity, type, component
│
├── reporting/
│   ├── __init__.py
│   ├── report_generator.py
│   └── templates/
│       └── report_template.md
│
├── logging_system/
│   ├── __init__.py
│   ├── action_logger.py
│   └── logs/
│       └── (timestamped run logs)
│
├── web/                              # separate web interface (SaaS front-end) — full spec in WEBSITE_GUI.md
│   ├── backend_api/
│   │   ├── app.py
│   │   ├── routes/
│   │   ├── auth/
│   │   └── billing/                  # provider webhooks only, no card data
│   ├── frontend/
│   │   ├── src/
│   │   │   ├── pages/                # public site, legal pages, app screens, admin
│   │   │   ├── components/           # accessible forms, buttons, tables
│   │   │   └── styles/
│   │   ├── public/
│   │   │   ├── fonts/                # self-hosted
│   │   │   └── .well-known/security.txt
│   │   └── package.json
│   ├── content/legal/                # policy text — drafts in WEBSITE_LEGAL_PAGES.md
│   └── ASSETS_LICENSES.md            # licence register for images, icons, fonts, libraries
│
├── data/
│   ├── sample_roe.pdf
│   ├── training_data_roe_fraud/
│   └── training_data_risk_scoring/
│
├── config/
│   └── settings.yaml
│
├── tests/
│   ├── test_roe_validation.py
│   ├── test_scope_guard.py
│   ├── test_agent.py
│   ├── test_risk_scoring.py
│   └── test_reporting.py
│
├── docs/
│   ├── architecture_diagram.png
│   └── proposal/
│
└── scripts/
    ├── setup_kali_env.sh
    └── setup_wsl2.sh
```
