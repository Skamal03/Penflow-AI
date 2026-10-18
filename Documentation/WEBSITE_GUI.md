# PenflowAI — Website & Web GUI Specification

**Version:** 1.0 | **Last reviewed:** 18 October 2026 | **Status:** Specification only (nothing in this file is built yet)

## Related documents

| Document | What it covers | How it connects to this file |
|---|---|---|
| [README.md](./README.md) | Project overview, features, tech stack, file structure | Its `web/` folder is specified here |
| [SRS_PenflowAI.md](./SRS_PenflowAI.md) | Requirements, environment setup, model training | Section 3.9 (Web Interface Module) and Section 4 (Interfaces) are expanded here |
| [PHASES.md](./PHASES.md) | Project phases and checklists | Phase 7 (Web Interface & Website) follows this file |
| [WEBSITE_LEGAL_PAGES.md](./WEBSITE_LEGAL_PAGES.md) | Draft text for Privacy, Terms, Cookie, Refund, Acceptable Use, accessibility statement and form consent wording | Every legal page named below is drafted there |

---

## Table of Contents

1. Purpose and Scope
2. Starting Position (Honest Status)
3. Web Layer Architecture
4. Site Map
5. Public Website Pages
6. Web Application GUI (Logged-In Screens)
7. Pricing and Subscription Page
8. Legal and Compliance Requirements
9. Accessibility Requirements
10. Security Requirements for the Web App
11. Misuse Prevention (Dual-Use Controls)
12. Risk Register
13. Pre-Launch Checklist
14. Build Phases for the Web Layer
15. Suggested Folder Structure
16. Sources and Verification Notes

---

## 1. Purpose and Scope

PenflowAI is planned as a SaaS product. The core engine (Python, running in Kali Linux) does the testing. People will use it through a **separate website and web-based GUI**, which talks to the engine only through an API (see SRS FR-9.1 and FR-9.2).

This file defines:
- The public marketing website
- The logged-in web application (GUI)
- The pricing and subscription page
- The legal, privacy, accessibility and security requirements the site must meet before it goes public

Out of scope here: the engine internals (see SRS), model training (see SRS Section 8), and the academic report documents.

---

## 2. Starting Position (Honest Status)

| Fact | Consequence for the website |
|---|---|
| The product is a prototype under development. It has only been designed for lab targets (OWASP Juice Shop, DVWA). | The site must say "in development / early access". It must not describe it as a finished, proven or production-ready service. |
| No real customers, reviews or case studies exist. | No testimonials, ratings, logos, user counters or "trusted by" claims. |
| The business is not registered yet (SECP registration and tax registration are still to do). | Do not take payments in the name of a company that does not exist. Put the real operator details in the footer (Section 8.9). |
| Payments: Stripe does not officially support Pakistan-registered businesses, and many local gateways do not handle automatic recurring billing well. | Decide the billing route before building the checkout (Section 7.4). |
| Pakistan has no enacted general data protection law yet (draft bill only, as of September 2026). | Build to GDPR-style good practice anyway, but never claim "Pakistan PDPA compliant". |

**Recommended launch mode:** a **waitlist / early access site** first (landing page, how it works, planned pricing, waitlist form, legal pages). Open paid subscriptions only after the product works, the business is registered, and the billing route is confirmed.

---

## 3. Web Layer Architecture

```
Visitor / User browser
        │  HTTPS
        ▼
Public Website (static pages)  ──┐
Web Application (GUI)  ──────────┤  never talks to the engine directly
        │  HTTPS, session cookie / token
        ▼
Backend REST API  (Flask or FastAPI)   ← only entry point to the engine
        │
        ├── Core Engine (Python in Kali): ROE validation → Scope Guard → AI Agent → Risk Scorer → Reporter
        ├── Database (users, ROE records, runs, findings, reports, logs, subscriptions)
        ├── File storage (ROE uploads, report files) — outside the web root
        └── Billing provider (hosted checkout and customer portal; no card data on our servers)
```

**Rules:**
- The browser never holds AI API keys or engine credentials. All model calls happen server-side.
- The frontend is a separate app from the engine, so the engine can run without it.
- Roles match the domain model: **Requester**, **Reviewer**, **Administrator**. Every API route checks the role.
- Sessions: `HttpOnly`, `Secure`, `SameSite=Lax` (or `Strict`) cookies. Add CSRF protection on every state-changing request.

**Suggested stack (change if you prefer):** React or Next.js for the frontend, FastAPI for the API, PostgreSQL for data, object storage or a protected folder for uploads, a hosted billing portal for subscriptions. Self-host fonts and scripts (Section 8.7).

---

## 4. Site Map

**Public (no login)**
- `/` Home
- `/how-it-works`
- `/features`
- `/pricing` (Section 7)
- `/waitlist` (or `/early-access`)
- `/about` (includes business details)
- `/contact`
- `/security` (how we protect data + how to report a vulnerability)
- `/accessibility`

**Legal (linked in the footer of every page and at sign-up)**
- `/legal/privacy`
- `/legal/terms`
- `/legal/cookies`
- `/legal/refunds`
- `/legal/acceptable-use`

**Application (login required)**
- `/signup`, `/login`, `/reset-password`, `/verify-email`
- `/app/dashboard`
- `/app/targets` (add and verify a target)
- `/app/roe/new` (upload ROE)
- `/app/roe/:id` (status)
- `/app/runs` and `/app/runs/:id` (live status, log)
- `/app/findings/:runId`
- `/app/reports` and `/app/reports/:id`
- `/app/billing` (plan, invoices, cancel)
- `/app/settings` (profile, password, MFA, delete account, export data)

**Staff only**
- `/admin/review-queue` (Reviewer role)
- `/admin/users`, `/admin/tools`, `/admin/models`, `/admin/audit-log` (Administrator role)

---

## 5. Public Website Pages

### 5.1 Home
- One clear headline and one sentence explaining what PenflowAI is, in plain words.
- A visible label: **"Early access — product in development."**
- Three things it is designed to do (only what is truly built or in active build, and labelled that way): check test permission (ROE) before testing, keep the AI inside the approved targets, explain results in plain language.
- Main button: **"Join the early access waitlist"**. Secondary button: **"See how it works"**.
- Footer: business details, legal links, accessibility link.

### 5.2 How it works
Step-by-step in plain words, using the pipeline from the README. Include the architecture diagram with **alt text and a text version of the steps** (Section 9.3). Say clearly that testing happens only on targets the user owns or has written permission to test.

### 5.3 Features
List features with a status tag on each: **Built / In progress / Planned**. Do not list a planned feature as available.

### 5.4 Pricing
See Section 7.

### 5.5 Waitlist
Form fields: email (required), name (optional), "What best describes you?" (optional). Consent wording is in [WEBSITE_LEGAL_PAGES.md](./WEBSITE_LEGAL_PAGES.md), Section 6.

### 5.6 About (business details)
Must show the operator's real details. Fields are in Section 8.9.

### 5.7 Contact
A simple form or a plain email address. If a form is used, it needs the consent notice from the legal pages file. Use a project email address, not a personal one.

### 5.8 Security page
How data is protected (only claims that are true), where data is stored **[VERIFY after hosting is chosen]**, and a responsible disclosure contact. Also publish `/.well-known/security.txt`.

### 5.9 Accessibility statement
Draft is in the legal pages file, Section 7.

---

## 6. Web Application GUI (Logged-In Screens)

| Screen | Roles | Purpose | Main elements | API / engine link |
|---|---|---|---|---|
| Sign up | Public | Create account | Email, password, "I am 18 or older / acting for a business", unticked terms checkbox, button **"Create my account"** | `POST /auth/signup` |
| Log in | Public | Access account | Email, password, MFA code, **"Log in"**, **"Forgot password?"** | `POST /auth/login` |
| Dashboard | Requester | Overview | Active runs, recent reports, plan usage, button **"Start a new security test"** | `GET /dashboard` |
| Add target | Requester | Register a site to test | URL field, domain-ownership verification steps (DNS TXT record or file upload), status badge | `POST /targets`, `POST /targets/:id/verify` |
| Upload ROE | Requester | Submit permission document | File upload (type and size limits), target selection, attestation checkbox, button **"Upload ROE document"** | `POST /roe` → ROE Validation (SRS 3.1) |
| ROE status | Requester | See validation result | Status: Checking / Needs review / Approved / Rejected, plain-language reason | `GET /roe/:id` |
| Review queue | Reviewer | Manual ROE review | Flagged documents, reasons, buttons **"Approve"**, **"Reject"**, **"Ask for a corrected document"**, note field | `GET /review`, `POST /review/:id` (SRS FR-1.4, 1.5) |
| Start run | Requester | Launch a test | Approved ROE, scope summary (targets listed, read-only), button **"Start security test"** | `POST /runs` (needs scope token, SRS FR-2.1) |
| Run monitor | Requester | Watch progress | Stage tracker (Recon → Scan → Identify → Verify), live log, button **"Stop test"** | `GET /runs/:id`, stream via SSE or WebSocket |
| Findings | Requester | Review results | Table sorted by severity, type, component; risk score with a short "why this score" note | `GET /runs/:id/findings` |
| Report viewer | Requester | Read and download | Plain-language report, buttons **"Download report (PDF)"** and **"Download report (Markdown)"** | `GET /reports/:id` |
| Audit log | Requester (own runs), Admin (all) | Proof of what the AI did | Timestamped action list, filter by run | `GET /runs/:id/log` (SRS FR-8.1) |
| Billing | Requester | Manage subscription | Current plan, usage, invoices, **"Change plan"**, **"Cancel subscription"** | Billing provider's hosted portal |
| Settings | Any | Account control | Profile, password, MFA, **"Download my data"**, **"Delete my account"** | `GET/PUT /me`, `POST /me/export`, `DELETE /me` |
| Admin screens | Admin | Operate the system | Users, tools registry, model versions, retrain trigger, audit log | SRS FR-4.x, Section 8 |

**Key flows**
1. **First test:** sign up → verify email → add target → verify ownership → upload ROE (attest) → ROE checked → (review if flagged) → scope token issued → start test → monitor → findings → report.
2. **Rejected ROE:** user sees a plain reason and a **"Upload a corrected document"** button. No scope token is issued, no test can start (SRS FR-1.6).
3. **Cancel:** from Billing, cancellation must take no more steps than sign-up did (Section 7.5).

**Empty, loading and error states:** every screen needs plain-language messages ("No tests yet. Start your first one."), visible loading indicators, and error text that says what went wrong and what to do next.

---

## 7. Pricing and Subscription Page

### 7.1 Pre-launch rule
Until real, final prices exist, the page must be titled **"Planned plans"** with the line **"Prices are not final. Join the waitlist to be told when plans open."** Do not show a working "Buy now" button for something that cannot be delivered.

### 7.2 Page layout (when live)

| Plan | Who it is for | Included (set real numbers) | Price | Button |
|---|---|---|---|---|
| **Starter** | One small site or project | [N] verified targets, [N] test runs per month, plain-language reports | [PRICE] per month or [PRICE] per year | **"Start Starter plan"** |
| **Team** | Small dev team | [N] targets, [N] runs per month, audit log export, [N] team members | [PRICE] | **"Start Team plan"** |
| **Agency** | Consultants with several clients | [N] targets, [N] runs, multi-client workspaces | [PRICE] | **"Start Agency plan"** |
| **Enterprise** | Large or regulated organisations | Custom limits, review support | "Contact us" | **"Talk to us"** |

Do not show a feature in a plan unless it exists. Do not use the word "unlimited" unless it is literally true.

### 7.3 How to set the prices (not guessed here)
- **Cost floor:** work out cost per test run = AI model tokens + server time + storage + payment fees. Earlier research in this project found the AI model cost can be small at low volume and grows with usage. Measure it on real runs before pricing. **[VERIFY with measured numbers.]**
- **Market check:** earlier research in this project found entry-level scanners starting around a few hundred dollars per month at the low end of the "AI pentest" tools, and cheaper self-serve scanners from about $149 per month. **[VERIFY — prices change; re-check before publishing any comparison.]**
- **Customer check:** use survey questions 16–18 (willingness to pay, monthly amount, monthly vs yearly) once responses are collected. The survey bands are hypotheses to test: under $20, $20–$50, $50–$100, over $100.
- Decide: monthly, yearly, or both. Yearly-first is the safer start given payment limits (Section 7.4).

### 7.4 Billing route (decide before building checkout)
Known constraint from earlier research in this project: Stripe does not officially support Pakistan-registered businesses, and local gateways often lack automatic recurring billing. Options to evaluate, each of which must be **[VERIFY]**-checked for "accepts Pakistan-based sellers" and "supports subscriptions" before you build on it:
1. A merchant-of-record service (it sells on your behalf and may handle VAT/sales tax) — confirm it accepts Pakistan-based sellers.
2. A payment collection account such as Payoneer — confirm subscription support.
3. Invoice-based annual billing (manual, but simplest to start).
4. A foreign company structure (more cost and paperwork — needs legal and tax advice).

Whatever you choose: **never store card numbers on your servers.** Use the provider's hosted checkout and customer portal.

### 7.5 Subscription rules the page and flow must follow
- Show the **full price, currency, billing period, and whether tax is included** before the user pays.
- State plainly if the plan **renews automatically**, when, and for how much. Send a renewal reminder email before annual renewals.
- If there is a free trial: say how long it is, what happens at the end, and that card details will be charged unless cancelled.
- **Cancel must be as easy as sign-up**: a visible **"Cancel subscription"** button in Billing, one confirmation step, and an email confirming the cancellation.
- Link to the Refund Policy right next to the buy button.
- No pre-ticked boxes, no hidden fees, no countdown timers or fake "only 2 left" messages.
- Invoices downloadable from Billing.
- Failed payment: clear email, short grace period, then downgrade, with no surprise data deletion. State the data-retention rule in the Terms.

### 7.6 Accessibility of the pricing table
Use a real HTML table with header cells, not a picture. Do not rely on colour alone to show the "recommended" plan; add text such as "Most popular" only if it is true and can be supported. Otherwise leave it out.

---

## 8. Legal and Compliance Requirements

Drafts of the policy pages are in [WEBSITE_LEGAL_PAGES.md](./WEBSITE_LEGAL_PAGES.md).

### 8.1 Which laws can apply (decide your launch markets first)

| Where users are | What can apply | Notes |
|---|---|---|
| **Pakistan** | PECA 2016 (cybercrime law); no enacted general data protection law yet | The Personal Data Protection Bill is still a draft as of September 2026, so do not claim compliance with a "Pakistan PDPA". Also check e-commerce, consumer, tax and State Bank rules **[VERIFY with a local lawyer/tax adviser]**. |
| **EU / EEA** | GDPR, ePrivacy cookie rules, Consumer Rights Directive (14-day withdrawal for consumers), European Accessibility Act (for consumer e-commerce services) | GDPR can apply to a non-EU business that offers services to people in the EU. You may need an EU representative **[VERIFY]**. |
| **UK** | UK GDPR, PECR (cookies) as changed by the Data (Use and Access) Act 2025 | Cookie rules are looser for first-party analytics than in the EU, but only under conditions. |
| **USA** | State privacy laws (e.g. California), consumer protection and auto-renewal laws, ADA expectations | Thresholds for some laws are unlikely to be met at the start **[VERIFY]**. |

**Strongest risk reducer:** state in the Terms that the service is **for businesses and adults (18+)**, and do not actively market to consumers in the EU until you are ready. This lowers consumer-law exposure. It does **not** remove GDPR duties for any EU person's data you do collect.

### 8.2 Legal pages required (all drafted in the legal pages file)

| Page | Needed? | Why |
|---|---|---|
| Privacy Policy | **Yes** | You collect emails, account data and uploaded ROE documents. Required in practice everywhere and by law in the EU/UK. |
| Terms and Conditions | **Yes** | Sets who may use the tool, authorised-use rules, liability limits. Very important for a security testing tool. |
| Cookie Policy | **Yes** (short) | Explains what cookies exist, even if only essential ones. |
| Refund and Cancellation Policy | **Yes** | You will charge subscriptions. EU consumers have a statutory 14-day right that a blanket "no refunds" line does not remove. |
| Acceptable Use Policy | **Yes** | Stops use against targets the user does not own. Core protection for you. |
| Accessibility Statement | Recommended | Shows effort and gives a contact for problems. |
| Security / responsible disclosure | Recommended | Normal for a security product. |

### 8.3 Do you need cookie consent? (decision guide)

| Your setup | Consent banner needed? |
|---|---|
| Only **strictly necessary** cookies (login session, CSRF token, remembering a cookie choice) and **no** analytics, ads, or social widgets | **No banner is legally required** for those cookies in the EU/UK. Still publish the Cookie Policy. |
| Standard Google Analytics (GA4) or similar | **Yes** for EU users: prior opt-in. Not treated as exempt in the UK either unless set up to meet the conditions. |
| UK-only first-party statistical analytics that meets the new exemption conditions | Possibly **no consent**, but you must tell users and give a simple, free way to object. The UK change took effect on 5 February 2026. |
| Ads, retargeting pixels, social media pixels, chat widgets that track | **Yes**, opt-in, everywhere it applies. |

**Recommendation:** launch with **no analytics and no marketing trackers**. Use only strictly necessary cookies. Then no banner is needed and the site stays simpler and safer. If you add analytics later, add a consent banner with **equally prominent "Accept" and "Reject" buttons**, no pre-ticked boxes, and load nothing non-essential until the user accepts. Keep a record of consent choices.

### 8.4 Forms and consent

| Form | What it must have |
|---|---|
| Sign up | Short purpose line ("We use your email to run your account"), **unticked** checkbox: "I agree to the Terms and have read the Privacy Policy" with links, and an 18+/business confirmation. |
| Waitlist | Purpose: "We will email you about early access". Separate **unticked** box if you want to send anything beyond the launch notice. |
| Marketing emails | Separate **unticked** opt-in. Every email has a one-click unsubscribe. Never bundle with the Terms checkbox. |
| ROE upload | Attestation checkbox: "I own this system or have written permission to test it, and this document is genuine." Notice that the file is processed by the platform and an AI service. |
| Contact | Notice of what is done with the message. Do not collect more than needed. |
| Survey (Jotform) | Link to the survey page with a short notice that Jotform collects the answers. Name, institute and email are optional. |
| Account deletion / data request | Easy to find, no dark patterns, confirmation by email. |

All forms: labels, keyboard support, and clear error messages (Section 9).

### 8.5 Collect only necessary data

| Data | Needed? | Purpose | Suggested handling |
|---|---|---|---|
| Email | Yes | Account, notices | Verify email. Keep while account exists. |
| Password | Yes | Login | Store only a strong salted hash (Argon2 or bcrypt). Offer MFA. |
| Name | Optional | Greeting, invoices | Make it optional unless billing needs it. |
| Organisation name | Optional | Reports, billing | Optional. |
| Phone number | **No** | — | Do not collect. |
| Date of birth, ID numbers, address | **No** (address only if tax/invoice law requires it) | — | Do not collect unless a rule requires it. |
| Target URLs | Yes | Scope, testing | Keep while the target is registered. |
| ROE documents | Yes | Validation, audit | May contain personal data of third parties. Restrict access, encrypt, set a retention period. |
| Scan results and reports | Yes | Service | Customer-owned. Delete on request or after the retention period. |
| Action logs (including IP and timestamps) | Yes | Security and accountability | Set a fixed retention period (e.g. 12 months) **[DECIDE]**. |
| Payment details | **No (never on your servers)** | — | Held by the billing provider. You keep only plan, status and invoice references. |
| Marketing/ad identifiers | **No** | — | Do not collect. |

Publish the retention periods in the Privacy Policy and actually enforce them in code.

### 8.6 Analytics tracking check
- Launch with none, or with a self-hosted, privacy-respecting tool that does not use cookies or identifiers **[VERIFY with your legal adviser that your exact setup falls outside consent rules in your target markets]**.
- If using Google Analytics: needs EU opt-in consent, IP handling review, and disclosure in the Cookie and Privacy policies.
- Remove any leftover tracking scripts, pixels or tag managers added by templates. Check with the browser's network tab and a cookie scanner before launch.
- No session-replay tools (they can capture personal data and uploaded content).

### 8.7 Third-party embeds and services register
Every outside service the site touches must be listed in the Privacy Policy and must not load before consent if it is not essential.

| Item | Decision |
|---|---|
| Google Fonts | **Self-host the fonts.** Loading them from Google sends visitors' IP addresses to Google and has caused legal problems in Europe. |
| YouTube / Vimeo videos | Avoid embeds. If needed, use a "click to load" placeholder (privacy-enhanced mode). |
| Social media widgets / share buttons | Do not use. Use plain links. |
| Maps, chat widgets, reCAPTCHA | Avoid. For spam control use rate limiting and a honeypot field. If a CAPTCHA is truly needed, disclose it and check whether it needs consent. |
| CDN-hosted scripts / icon libraries | Self-host copies. |
| Jotform survey | Link out to it, do not embed. Disclose it in the Privacy Policy. |
| AI model provider (Groq API / GPT-OSS) | **Disclose it.** ROE text and scan data may be sent to it. Minimise what is sent, never send secrets or passwords, and check the provider's terms (Section 12, R4). |
| Billing provider | Disclose. Hosted checkout only. |
| Hosting and email provider | Disclose and keep a list of processors. |

### 8.8 Refunds and consumer rights
- A refund policy page is required (draft in the legal pages file).
- If EU/UK **consumers** can buy: they have a 14-day right to withdraw from a subscription, and if they ask for the service to start immediately you may charge a fair proportion for what was used. A one-line "no refunds" statement does not override this. The EU also added a requirement for an easy online withdrawal function from June 2026 **[VERIFY exact scope with an EU adviser]**.
- If sales are **business-only**, you can set your own refund terms, but they must be clear, fair and consistent with your billing provider's rules.
- Make the policy match what the billing system can actually do.

### 8.9 Business details (footer and About page)
Show real details, never invented ones.

| Field | Value |
|---|---|
| Trading name | PenflowAI |
| Operator / legal entity | [Legal name once registered. Until then: the individual founders, as the responsible persons] |
| Registration number | [SECP number once registered. Leave out until it exists] |
| Tax number | [NTN / sales tax registration once issued] |
| Registered / postal address | [Business address. Avoid using a home address if possible] |
| Contact email | [project email, e.g. contact@yourdomain] — not a personal or student email |
| Support hours / response time | [Only promise what you can keep] |
| Data protection contact | [Email for privacy requests] |

**Do not publish personal phone numbers.** The phone numbers and student email addresses in the proposal documents are for the university, not for the public website.

### 8.10 Remove unsupported claims (audit list)
Because the product is a prototype, check every sentence on every page against this table.

| Do not write | Write instead |
|---|---|
| "Finds all vulnerabilities" / "100% accurate" | "Designed to find common web vulnerabilities. Tested on practice lab sites." |
| "Trusted by companies", logos, user counts | Nothing, until it is true and you have permission. |
| "Enterprise-grade", "bank-level security", "military-grade" | Describe the actual measures (e.g. "passwords are stored as salted hashes"). |
| "Compliant with SOC 2 / ISO 27001 / GDPR / Pakistan PDPA" | Only say what you have actually done, and never claim a certification you do not hold. |
| "Fully automated penetration test replaces human testers" | "Helps with early checks. Does not replace a full manual test." |
| "Better than Escape / XBOW / Burp Suite" | Avoid naming competitors in public marketing. If you must compare, use only facts you can source, dated, and keep it fair. Do not use their logos. |
| "Instant results", "no false positives" | Remove unless measured and documented. |
| "Safe for any website" | "For use only on systems you own or have written permission to test." |
| "AI never makes mistakes" | State that AI output can be wrong and must be reviewed. |

Also remove: invented statistics, fake "as seen in" badges, fake awards, countdown timers, and any "limited spots" message that is not true.

### 8.11 Reviews and testimonials
There are no real reviews yet, so **show none**. Do not write them yourself, do not ask friends to post as customers, and do not add star ratings. Later, only publish real reviews from real users with their permission, say if they received a reward, and keep negative reviews that are genuine. Fake or misleading reviews are an offence or a regulator target in several markets, including the USA (FTC rule on fake reviews) and the EU **[VERIFY exact rules for your markets]**.

### 8.12 Images, icons, fonts and licences
- Keep a register file (`ASSETS_LICENSES.md`) listing every image, icon, font and code library: source, licence, author, and any attribution required.
- **Your own diagrams** (architecture, use case, ERD, domain model) are yours to use. Give them alt text.
- **Stock photos:** only from sources whose licence allows commercial use. Save a copy of the licence. No images copied from Google Images or other websites.
- **Logos:** do not use Escape, XBOW, Burp Suite or OWASP logos. Writing a name in plain text to say what you test against is fine.
final year project and whether you may commercialise it **[VERIFY with your department]**.
- **AI-generated images:** check the tool's terms on commercial use.
- **Fonts and icons:** use open-licensed ones (e.g. SIL Open Font License) and self-host.
- **Software licences:** the tools your engine runs (Nmap, SQLMap, Nikto, OWASP ZAP, etc.) each have their own licences. Using them inside a paid online service may have conditions. **[VERIFY each licence before charging customers.]**

### 8.13 Other local-law flags to review with a Pakistani lawyer
- **PECA 2016:** section 3 makes unauthorised access to an information system a crime (up to three months or a fine, or both, in the text found); related sections cover interference with systems and data, and the supply of devices for use in an offence. A penetration testing tool is dual-use, so the Terms, domain verification and misuse controls (Section 11) matter to protect **you** as well as customers.
- **Company and tax registration:** SECP registration, NTN, and any sales tax on services and rules for receiving foreign payments. **[VERIFY current requirements.]**
- **Electronic contracts and consumer rules:** make sure the click-to-accept flow and the Terms are valid and clear **[VERIFY]**.
- **Copyright and trademark:** check that "PenflowAI" is not already taken as a name or domain, and consider registering the name **[VERIFY]**.
- **Data breach duties:** Pakistan has no general breach-notice law yet, but GDPR requires notifying the EU/UK regulator within 72 hours for in-scope data. Write a one-page breach response plan now.

---

## 9. Accessibility Requirements

**Target: WCAG 2.2 Level AA.** The EU Accessibility Act applies to consumer e-commerce services, even from non-EU sellers, but exempts very small service businesses (under 10 staff and up to €2 million turnover). Even if you are exempt, build accessibly: it is good practice, reduces legal risk in other markets, and makes the product better.

### 9.1 Checklist

| Area | Requirement |
|---|---|
| **Page structure** | One `<h1>` per page, headings in order, landmarks (`header`, `nav`, `main`, `footer`), page `<title>` that is unique, `lang` attribute set. |
| **Skip link** | "Skip to main content" link as the first focusable item. |
| **Keyboard** | Everything reachable and usable with Tab, Shift+Tab, Enter, Space, Esc. No keyboard traps. Logical tab order. |
| **Focus** | Visible focus outline on every control, never removed; focus is not hidden behind sticky headers or banners. |
| **Colour contrast** | Normal text at least **4.5:1**; large text (18pt or 14pt bold) and UI parts (borders of inputs, icons, focus rings) at least **3:1**. Do not use colour alone to give meaning (e.g. severity). |
| **Text resize** | Page works at 200% zoom and on a small phone screen with no horizontal scrolling for text. |
| **Target size** | Buttons and links at least 24×24 CSS pixels (bigger is better). |
| **Motion** | No auto-playing video or animation. Respect "reduce motion" settings. |
| **Login** | Do not make users solve puzzles or memorise things to log in. Allow password managers and paste. |
| **Language** | Plain words, short sentences, spelled-out abbreviations the first time (e.g. "Rules of Engagement (ROE)"). |

### 9.2 Forms — keyboard and screen-reader friendly
- Every input has a visible `<label>` tied to it with `for`/`id`. A placeholder is not a label.
- Mark required fields in text ("required"), not only with a colour or an asterisk.
- Group related inputs with `<fieldset>` and `<legend>` (e.g. plan choice, radio buttons).
- Errors: say which field and how to fix it ("Enter an email like name@example.com"), link to the field, and announce the error to screen readers (`aria-live` or focus the error summary).
- Never clear what the user typed when an error appears.
- Autocomplete attributes (`autocomplete="email"`, `"current-password"`, `"new-password"`).
- Submit with Enter works. Tab order follows the visual order.
- Checkboxes for consent are real checkboxes with clear text, not custom pictures without labels.

### 9.3 Alt text rules

| Image type | Alt text |
|---|---|
| Informative image | Short description of what it shows and why it matters. |
| Decorative image | Empty alt (`alt=""`) so screen readers skip it. |
| Icon inside a button | Put the meaning in the button's text or `aria-label`; the icon itself gets `alt=""`. |
| Logo that links home | "PenflowAI home". |
| **Architecture diagram** | Short alt ("Diagram of PenflowAI's pipeline from ROE document to final report") **plus a nearby text list of the steps** — a picture alone is not enough for complex diagrams. |
| Charts (e.g. Gantt) | Short alt plus a data table or text summary. |

### 9.4 Clear button and link labels

| Instead of | Use |
|---|---|
| Submit | **Create my account** / **Join the waitlist** / **Send message** |
| Click here | **Read the Privacy Policy** |
| Go | **Start security test** |
| Upload | **Upload ROE document** |
| OK | **Yes, cancel my subscription** (with a matching **Keep my subscription**) |
| Delete | **Delete my account and data** |
| Download | **Download report (PDF)** |

Buttons do actions; links go to pages. A button's label should still make sense when read alone out of context.

### 9.5 How to test
- Automated: axe DevTools, Lighthouse, WAVE (these catch only part of the problems).
- Manual keyboard test: unplug the mouse and complete every flow.
- Screen reader test: NVDA (Windows, free) or VoiceOver.
- Contrast: use a contrast checker on every text and background pair, in every state (hover, focus, disabled, error).
- Zoom to 200% and test on a phone-size window.
- Record the date and results in the Accessibility Statement.

---

## 10. Security Requirements for the Web App

A security product with a weak website would be embarrassing and risky.

- HTTPS everywhere with HSTS. Redirect HTTP to HTTPS.
- Security headers: Content-Security-Policy (strict, no inline scripts), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, frame protection.
- Rate limiting and lockout on login, sign-up, password reset and the contact form.
- MFA for Reviewer and Administrator accounts; offer it to everyone.
- Strong password hashing (Argon2/bcrypt). Check new passwords against common-password lists.
- Role-based access control on every API route; users can only see their own runs, ROEs, findings and reports.
- **Secure file upload for ROE documents:** allow-list file types, size limit, rename files, store outside the web root, scan for malware, never execute or render them as HTML.
- Input validation and output encoding on everything (guard against SQL injection and XSS in your own site).
- Secrets only in environment variables or a secrets manager. Never in the repository or the frontend.
- Dependency scanning and updates (e.g. `pip-audit`, `npm audit`, Dependabot).
- Encrypted backups, tested restores.
- Audit log of admin and reviewer actions.
- Run your **own** tool and a standard scanner against your own site before launch.
- Publish `security.txt` and respond to reports.
- Follow OWASP ASVS as the checklist for the web app.

---

## 11. Misuse Prevention (Dual-Use Controls)

A penetration testing service can be used to attack people. These controls protect users, third parties, and **you**. Most of them match the project's core idea (ROE check + Scope Guard).

| Control | How |
|---|---|
| **Prove the target is theirs** | Domain-ownership verification (DNS TXT record or a file at a known path) before any target can be tested. |
| **Written permission** | ROE upload plus the attestation checkbox. Reviewer step for anything the model flags. |
| **Hard scope** | Scope Guard blocks any request outside the verified targets (SRS FR-2.x). |
| **Blocked targets** | Block government, military, health, financial-infrastructure and other sensitive domains, and shared-hosting IP ranges you cannot prove they control. |
| **Limits** | Rate limits and a maximum request volume per run so tests cannot become a denial-of-service attack. |
| **Safe mode by default** | Exploitation limited and controlled (as in the project scope). No destructive actions. |
| **Logging** | Full timestamped audit log kept for the retention period. |
| **Abuse reporting** | A visible address to report misuse, and the right to suspend accounts immediately. |
| **Acceptable Use Policy and Terms** | Forbid unauthorised testing and require the user to take responsibility for permission. |
| **Law-enforcement requests** | Have a documented, lawyer-approved process before answering any. |

---

## 12. Risk Register

| # | Risk | Severity | What to do | Status |
|---|---|---|---|---|
| R1 | Tool used to attack systems the user does not own (criminal and civil exposure for the operator) | **High** | Section 11 controls; Terms; Acceptable Use Policy; lawyer review | Open |
| R2 | Claims on the site that the prototype cannot support (misleading advertising) | **High** | Section 8.10 audit; "early access" labelling | Open |
| R3 | Taking payments before the business is registered and the billing route exists | **High** | Waitlist-only until registered; decide billing route (Section 7.4) | Open |
| R4 | AI provider rules: the model provider's acceptable use policy may restrict security-testing use, and sending client ROE or scan data to a third-party AI service raises privacy duties | **High** | Read the Groq and model terms and usage policies for security testing; get written clarity if unclear; disclose in the Privacy Policy; minimise data sent **[VERIFY]** | Open |
| R5 | Unclear data protection duties if EU/UK users sign up (GDPR/UK GDPR; possible EU representative) | Medium–High | Launch B2B and non-EU-targeted first; follow GDPR practices; breach plan **[VERIFY]** | Open |
| R6 | Cookie/tracking non-compliance from template scripts, fonts or embeds | Medium | Section 8.6 and 8.7; scan before launch | Open |
| R7 | Third-party tool licences (Nmap, SQLMap, Nikto, ZAP) may restrict use in a paid online service | Medium | Read each licence; consider commercial licences or replace tools **[VERIFY]** | Open |
| R8 | University rules on project ownership and use of name/logo | Medium | Ask the department in writing; remove logo until allowed | Open |
| R9 | Stored ROE documents contain third-party personal data and are a breach target | Medium | Encrypt, restrict, set retention, breach plan | Open |
| R10 | Accessibility complaints or EU Accessibility Act exposure | Medium (lower if exempt/B2B) | Section 9 build and test | Open |
| R11 | Trademark clash on "PenflowAI" or competitor trademark misuse | Low–Medium | Name search; no competitor logos | Open |
| R12 | Tax and foreign-payment rules for a new Pakistan-based digital service | Medium | Tax adviser **[VERIFY]** | Open |
| R13 | Consumer refund law (14-day EU right) if consumers can buy | Medium | B2B-only terms; refund policy; withdrawal function if consumers are served | Open |
| R14 | Comparison claims about competitors (unfair or outdated) | Medium | Remove or source and date them | Open |
| R15 | The website itself gets hacked | High | Section 10 | Open |

---

## 13. Pre-Launch Checklist

**Content and claims**
- [ ] Every sentence checked against Section 8.10
- [ ] "Early access / in development" label on Home, Features and Pricing
- [ ] No testimonials, ratings, logos, counters, awards or fake urgency
- [ ] Feature list tagged Built / In progress / Planned, and matches reality
- [ ] No competitor logos; any competitor facts sourced and dated (or removed)

**Business and legal**
- [ ] Business details added to footer and About page (real ones only)
- [ ] Privacy Policy, Terms, Cookie Policy, Refund Policy, Acceptable Use Policy published and linked in the footer and at sign-up
- [ ] Lawyer has reviewed the pages
- [ ] Company registered (SECP) and tax registration done before charging
- [ ] University permission on file (name/logo use, project ownership)
- [ ] Billing route decided and confirmed to accept Pakistan-based sellers
- [ ] AI provider and tool licence checks done (R4, R7)

**Data and cookies**
- [ ] Only necessary data collected (Section 8.5)
- [ ] Retention periods written and enforced
- [ ] No analytics/trackers, or consent banner with equal Accept/Reject
- [ ] Cookie scan done; list matches the Cookie Policy
- [ ] Fonts and scripts self-hosted; no unneeded third-party embeds
- [ ] All forms have the consent wording from the legal pages file
- [ ] Data export and account deletion work

**Accessibility**
- [ ] Alt text on all images; long description for diagrams
- [ ] Contrast checked in every state
- [ ] All forms and flows work by keyboard only
- [ ] Button and link labels are clear
- [ ] axe/Lighthouse/WAVE run; NVDA or VoiceOver tested
- [ ] Accessibility Statement published

**Security**
- [ ] Section 10 items done; own tool and a standard scanner run against the site
- [ ] Domain verification, blocked-target list, rate limits working (Section 11)
- [ ] `security.txt` published; breach response plan written

**Pricing and billing**
- [ ] Pricing page shows full price, currency, period, tax and renewal terms
- [ ] Cancel button in Billing works and is as easy as sign-up
- [ ] Refund Policy linked beside the buy button
- [ ] Invoices and renewal reminder emails work

---

## 14. Build Phases for the Web Layer

These sub-phases sit inside Phase 7 of [PHASES.md](./PHASES.md).

| Sub-phase | Work | Output |
|---|---|---|
| 7.1 Foundations | Pick stack, repo, design system with accessible colours and focus styles, `ASSETS_LICENSES.md` | Skeleton site that builds and passes basic accessibility checks |
| 7.2 Public site and waitlist | Home, How it works, Features, Pricing (planned), About, Contact, Waitlist | Public early-access site |
| 7.3 Legal pages and consent | Publish the five policies, accessibility statement, form consent, cookie setup | Legal pages live and linked |
| 7.4 Accounts and API | Sign-up, login, MFA, roles, backend routes for ROE, runs, findings, reports | Working authenticated app shell |
| 7.5 Core screens | Targets and verification, ROE upload and status, review queue, run monitor, findings, reports, audit log | End-to-end flow with the engine on lab targets |
| 7.6 Billing | Chosen billing route, plans, hosted checkout, customer portal, cancellation | Test-mode subscriptions |
| 7.7 Hardening and audit | Section 10 tests, accessibility tests, cookie scan, pre-launch checklist | Signed-off checklist |

---

## 15. Suggested Folder Structure

```
web/
├── frontend/
│   ├── public/
│   │   ├── .well-known/security.txt
│   │   └── fonts/                 # self-hosted
│   ├── src/
│   │   ├── pages/
│   │   │   ├── index
│   │   │   ├── how-it-works
│   │   │   ├── features
│   │   │   ├── pricing
│   │   │   ├── waitlist
│   │   │   ├── about
│   │   │   ├── contact
│   │   │   ├── security
│   │   │   ├── accessibility
│   │   │   ├── legal/ (privacy, terms, cookies, refunds, acceptable-use)
│   │   │   └── app/ (dashboard, targets, roe, runs, findings, reports, billing, settings)
│   │   ├── admin/ (review-queue, users, tools, models, audit-log)
│   │   ├── components/            # accessible form, button, table, alert components
│   │   └── styles/                # tokens: colours checked for contrast
│   └── package.json
├── backend_api/
│   ├── app.py
│   ├── routes/ (auth, targets, roe, review, runs, findings, reports, billing, me, admin)
│   ├── auth/ (sessions, mfa, roles)
│   └── billing/                   # provider webhooks only; no card data
├── content/
│   └── legal/                     # source text from WEBSITE_LEGAL_PAGES.md
└── ASSETS_LICENSES.md
```

---

## 16. Sources and Verification Notes

Information below was checked in October 2026. Laws and prices change; recheck before launch.

- Pakistan data protection status (draft bill, none in force as of September 2026): https://cybersilo.tech/pakistan-personal-data-protection-act and https://practiceguides.chambers.com/practice-guides/data-protection-privacy-2026/pakistan
- PECA 2016 text (section 3, unauthorised access): https://nasirlawsite.com/laws/peca1.htm and https://www.pakistancode.gov.pk/pdffiles/administrator6a061efe0ed5bd153fa8b79b8eb4cba7.pdf
- UK cookie rule change (Data (Use and Access) Act 2025, from 5 February 2026): https://www.policypros.co.uk/cookie-consent-changes-duaa-guide/
- UK vs EU cookie difference and Google Analytics point: https://zenlio.co.uk/blog/cookie-consent-2026-data-use-and-access-act/
- General cookie consent rules (GDPR/ePrivacy): https://privacylawapplies.com/cookie-consent
- EU 14-day withdrawal for digital services and consent/acknowledgement rules: https://legalitgroup.com/en/terms-of-use-for-online-services-and-digital-platforms-compliance-when-entering-the-eu-market/
- EU withdrawal function ("cancel button") from June 2026: https://churnkey.co/guides/eu-consumer-rights-directive
- European Accessibility Act scope and microenterprise exemption: https://goingstellar.ro/research/european-accessibility-act-online-stores/ and https://prymecommerce.com/european-accessibility-act-ecommerce/
- Pakistan payment gateway limits (from earlier research in this project): https://www.payoneer.com/resources/business/guide-to-payment-gateways-in-pakistan/
- Groq model deprecations (from earlier research in this project): https://console.groq.com/docs/deprecations

**Things I could not verify (marked [VERIFY] above):** current Pakistani tax and foreign-payment rules; whether specific billing providers accept Pakistan-based sellers and support subscriptions; the AI provider's usage policy for security testing; each security tool's licence for paid online use; exact scope of the EU withdrawal-function rule; whether an EU representative is needed for you; the university's rules on project ownership and logo use; US state-law thresholds.

---

## Change Log

| Version | Date | Change |
|---|---|---|
| 1.0 | 18 Oct 2026 | First version: GUI spec, pricing page, compliance, accessibility, security, misuse controls, risk register |
