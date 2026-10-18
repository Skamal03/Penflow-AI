# PenflowAI — Project Phases

**Project:** PenflowAI — AI-Orchestrated Web Penetration Testing Platform
**Type:** Final Year Project (Academic), with an entrepreneurial track running alongside it
**Team:** Muhammad Sunnan, Hamza Ahmad Baig (BSCY-7) — Supervisor: Ms. Kanza Zafar, Co-Supervisor: Mr. Sameer Sohail

This document breaks the whole project into phases, covering both the academic FYP build and the parallel business/validation work. Related documents: [README.md](./README.md), [SRS_PenflowAI.md](./SRS_PenflowAI.md), [WEBSITE_GUI.md](./WEBSITE_GUI.md) (website, GUI, pricing, compliance) and [WEBSITE_LEGAL_PAGES.md](./WEBSITE_LEGAL_PAGES.md) (draft policy pages). Status markers (`Done`, `In Progress`, `Not Started`) reflect where things stand based on work completed so far — update them as the project moves forward.

---

## Phase 0 — Planning & Documentation
**Goal:** Define what the project is, why it matters, and how it will be built, before writing code.

- [x] **Done** — Project idea, problem statement, and proposed solution defined
- [x] **Done** — Competitive analysis (Escape, XBOW, Burp Suite AT) and identified gap (ROE authenticity, threat-intel-based scoring, action logging)
- [x] **Done** — Project Proposal & Plan document (Word, filled from official template)
- [x] **Done** — Project Proposal Presentation (PowerPoint, Template-04)
- [x] **Done** — Software Requirements Specification (SRS), including full environment setup and model training instructions
- [x] **Done** — Work Breakdown Structure (WBS) and Gantt chart (one-semester timeline)
- [x] **Done** — Use Case Diagram, ERD, System Architecture Diagram, Domain Model Diagram
- [x] **Done** — Mapping to Complex Computing Problem characteristics (CCP document)
- [x] **Done** — GitHub profile README

---

## Phase 1 — Environment Setup
**Goal:** Get a working development environment ready before building any module.

- [ ] **Not Started** — Install and configure Kali Linux (native or via WSL2 on Windows)
- [ ] **Not Started** — Install required Kali tools: Nmap, SQLMap, Nikto, OWASP ZAP
- [ ] **Not Started** — Set up Python 3.11+ virtual environment and install dependencies
- [ ] **Not Started** — Obtain Groq API key and configure `.env` (model: `openai/gpt-oss-120b`, replacing the originally planned Llama 3.3 70B after Groq moved it to enterprise-only access)
- [ ] **Not Started** — Verify AI model connectivity with a basic test call
- [ ] **Not Started** — Set up OWASP Juice Shop and DVWA as local lab test targets (e.g. via Docker)

---

## Phase 2 — Core Engine: Authorization & Scope
**Goal:** Build the trust layer that must exist before any scanning happens — this is the project's main differentiator.

- [ ] **Not Started** — ROE document parser (reads structure, fields, target list, dates)
- [ ] **Not Started** — Automated ROE fraud/tampering detection model (RandomForest, trained on genuine vs. tampered sample documents)
- [ ] **Not Started** — Manual review queue for ROE documents flagged by the automated check
- [ ] **Not Started** — Scope Token generator (issued only after ROE passes validation)
- [ ] **Not Started** — Scope Guard module (technically blocks the agent from acting outside the approved target list)

---

## Phase 3 — Core Engine: AI Pentesting Agent
**Goal:** Build the AI-driven scanning and testing logic.

- [ ] **Not Started** — ReAct reasoning loop (Reason → Act) wired to the Groq API / GPT-OSS
- [ ] **Not Started** — Reconnaissance stage (endpoint discovery, technology fingerprinting)
- [ ] **Not Started** — Scanning & enumeration stage
- [ ] **Not Started** — Vulnerability identification stage (pattern matching against known vuln types: SQLi, XSS, CSRF, broken auth, misconfig, command injection, file upload issues, sensitive data exposure, vulnerable components)
- [ ] **Not Started** — Controlled, limited exploitation stage (safe proof-of-concept only)
- [ ] **Not Started** — Tool integration layer / tool registry (so new tools can be added without touching agent logic)
- [ ] **Not Started** — Wrappers for big tools (Nmap, SQLMap, Nikto, ZAP) and small custom check scripts

---

## Phase 4 — Risk Scoring & Threat Intelligence
**Goal:** Turn raw findings into a meaningful, explainable risk score.

- [ ] **Not Started** — Collect/label training data for the risk-scoring model (business context + outcome labels)
- [ ] **Not Started** — Train RandomForest risk-scoring model
- [ ] **Not Started** — CVE/NVD lookup integration
- [ ] **Not Started** — CISA KEV (Known Exploited Vulnerabilities) feed integration, cached locally
- [ ] **Not Started** — Combine business-context score with real-world exploitation signal into a final score

---

## Phase 5 — Organizing & Reporting
**Goal:** Turn scored findings into something a human can actually read and act on.

- [ ] **Not Started** — Vulnerability Organizer (sort/group by severity, type, affected component)
- [ ] **Not Started** — Report Writer module (uses the same AI model to generate plain-language reports)
- [ ] **Not Started** — Report template design (technical + non-technical sections)

---

## Phase 6 — Logging & Audit Trail
**Goal:** Make every AI action traceable and accountable.

- [ ] **Not Started** — Action logger (timestamped record of every step the agent takes)
- [ ] **Not Started** — ROE validation decision logging (automated + manual, tied into the same audit trail)
- [ ] **Not Started** — Log storage and retrieval for a given test run

---

## Phase 7 — Website & Web GUI (SaaS-Ready)
**Goal:** Build the public website and the separate, decoupled web app so the core engine can run as a hosted service. Full specification: [WEBSITE_GUI.md](./WEBSITE_GUI.md). Draft policy text: [WEBSITE_LEGAL_PAGES.md](./WEBSITE_LEGAL_PAGES.md).

**7.1 Foundations**
- [ ] **Not Started** — Choose stack (frontend, FastAPI backend, database, file storage)
- [ ] **Not Started** — Design tokens with accessible colours and visible focus styles
- [ ] **Not Started** — Create `ASSETS_LICENSES.md` (licence register for images, icons, fonts, libraries)

**7.2 Public site and waitlist**
- [ ] **Not Started** — Home, How it works, Features (with Built / In progress / Planned tags), About, Contact
- [ ] **Not Started** — Waitlist form with consent wording
- [ ] **Not Started** — Pricing page in "Planned plans" mode (no final prices until costs and survey results are known)
- [ ] **Not Started** — Claims audit: remove unsupported claims, fake reviews, logos and counters

**7.3 Legal pages and consent**
- [ ] **Not Started** — Lawyer review of Privacy Policy, Terms, Cookie Policy, Refund Policy, Acceptable Use Policy
- [ ] **Not Started** — Publish the policies and link them in the footer and sign-up
- [ ] **Not Started** — Business details in footer and About page (real details only)
- [ ] **Not Started** — Cookie decision: launch with essential cookies only, or add a consent banner with equal Accept / Reject
- [ ] **Not Started** — Self-host fonts and scripts; remove unneeded third-party embeds
- [ ] **Not Started** — Accessibility Statement and `security.txt`

**7.4 Accounts and API**
- [ ] **Not Started** — Backend REST API (Flask/FastAPI) exposing ROE submission, run status, and report retrieval
- [ ] **Not Started** — Sign-up, login, MFA, roles (Requester, Reviewer, Administrator)
- [ ] **Not Started** — Data export and account deletion

**7.5 Core application screens**
- [ ] **Not Started** — Add target and domain-ownership verification
- [ ] **Not Started** — ROE upload with attestation, ROE status, reviewer queue
- [ ] **Not Started** — Run monitor, findings, report viewer, audit log
- [ ] **Not Started** — Connect frontend to backend API end-to-end on lab targets

**7.6 Billing and subscriptions**
- [ ] **Not Started** — Decide billing route (confirm provider accepts Pakistan-based sellers and supports subscriptions)
- [ ] **Not Started** — Register the business (SECP) and tax details before charging
- [ ] **Not Started** — Hosted checkout, customer portal, invoices, renewal reminders, easy cancellation

**7.7 Hardening and pre-launch audit**
- [ ] **Not Started** — Web app security checks (headers, rate limits, secure uploads, scan your own site)
- [ ] **Not Started** — Accessibility tests (axe, Lighthouse, WAVE, keyboard-only, screen reader)
- [ ] **Not Started** — Misuse controls: blocked targets, request limits, abuse reporting
- [ ] **Not Started** — Work through the pre-launch checklist in [WEBSITE_GUI.md](./WEBSITE_GUI.md) (Section 13) and the risk register (Section 12)

---

## Phase 8 — Testing & Evaluation
**Goal:** Prove the system actually works, end to end, against real (lab) targets.

- [ ] **Not Started** — Unit tests for each module (ROE validation, Scope Guard, risk scoring, reporting)
- [ ] **Not Started** — Integration test of the full pipeline (ROE → token → agent → score → report)
- [ ] **Not Started** — Manual acceptance testing against OWASP Juice Shop
- [ ] **Not Started** — Manual acceptance testing against DVWA
- [ ] **Not Started** — Bug fixing and refinement based on test results

---

## Phase 9 — Market Validation & Business Track
**Goal:** Validate the idea as more than just an academic exercise, running in parallel with the technical build.

- [x] **Done** — Market analysis with references (market size, competitor funding, regional context)
- [x] **Done** — SWOT analysis
- [x] **Done** — Business model and revenue streams defined (subscription, tiered pricing)
- [x] **Done** — Market research survey built (PenflowAI Market Research Survey, live on Jotform)
- [ ] **In Progress** — Entrepreneurial pitch deck (14-slide structure planned: title, problem, solution/UVP, demo, customer discovery, market size, competition, business model, GTM, financials, risks/legal, team, roadmap, ask)
- [ ] **Not Started** — Collect and analyze survey responses
- [ ] **Not Started** — Incorporate survey findings back into the pitch deck and product priorities

---

## Phase 10 — Final Documentation & Defense Prep
**Goal:** Package everything for submission and present it convincingly.

- [ ] **Not Started** — Final project report (incorporating any changes made during development)
- [ ] **Not Started** — Final presentation slides (technical defense version, distinct from the entrepreneurial pitch deck)
- [ ] **Not Started** — Live demo script and rehearsal against lab targets
- [ ] **Not Started** — Viva/defense preparation — anticipate questions on scope limitations, model choices, and the Groq/Llama 3.3 deprecation decision

---

## Phase 11 — Post-FYP Roadmap (Future Work, Out of Current Scope)
**Goal:** What comes after graduation, if this continues as a real product.

- Business-logic vulnerability detection (IDOR, BOLA, workflow bypass)
- CI/CD pipeline integration for continuous testing
- Multi-agent orchestration for parallel testing
- Broader authentication handling (MFA, SSO, token rotation)
- Expanded tool library and plugin ecosystem
- Full SaaS billing and subscription infrastructure
- Formal, production-scale validation beyond lab targets

---

## How to Use This Document

- Check off tasks as they're completed and update the phase status label.
- Phases 2–6 (the core engine) can be worked on roughly in order, since each depends on the one before it — Scope Guard needs a Scope Token from Phase 2, the Agent needs the Scope Guard from Phase 2, Risk Scoring needs Findings from Phase 3, and so on.
- Phase 7 (Website & Web GUI) and Phase 9 (Market Validation) can run in parallel with the core engine work, since neither blocks the other. Sub-phases 7.1–7.3 (public site, waitlist, legal pages) do not need the engine at all and can start first. Do not open paid subscriptions (7.6) until the product works, the business is registered, and the billing route is confirmed.
- Phase 8 (Testing) should start as soon as any individual module is working, not only once everything is finished — test each module as it's built, then do the full end-to-end pass once Phases 2–6 are complete.
