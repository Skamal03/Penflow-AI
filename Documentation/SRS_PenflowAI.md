# Software Requirements Specification (SRS)
## PenflowAI — AI-Orchestrated Web Penetration Testing Platform

**Version:** 1.0
**Project Type:** Final Year Project (Academic)
**Institution:** Riphah School of Computing & Innovation, Riphah International University, Lahore

---

## Table of Contents

1. Introduction
2. Overall Description
3. System Features (Functional Requirements)
4. External Interface Requirements
5. Non-Functional Requirements
6. System Architecture
7. Environment Setup & Build Instructions
8. Model Training Requirements
9. Data Requirements
10. Testing Requirements
11. Appendices

---

## 1. Introduction

### 1.1 Purpose
This document specifies the full functional and non-functional requirements for PenflowAI, and provides a complete, step-by-step specification for setting up the development and execution environment, integrating all required tools, and training the machine learning components the system depends on. This document is written to be detailed enough that the system can be built directly from it, section by section, without requiring outside clarification for standard setup steps.

### 1.2 Document Conventions
- "The system" refers to PenflowAI as a whole, unless a specific module is named.
- "Shall" indicates a mandatory requirement. "Should" indicates a recommended but non-mandatory requirement.
- Code blocks marked `bash` are commands to be executed in a Linux shell (Kali Linux or WSL2 running Kali).
- Code blocks marked `python` are Python source or configuration snippets.

### 1.3 Intended Audience
Developers implementing the system, evaluators reviewing the project, and any automated or manual build process responsible for constructing the environment and components described here.

### 1.4 Project Scope
PenflowAI automates web application penetration testing while adding a verification and governance layer around the process. It performs authorization validation, enforces testing scope, executes reconnaissance/scanning/controlled exploitation through an AI reasoning agent, scores findings using a trained risk model informed by real-world threat data, organizes findings, and generates a plain-language report. It does not perform deep business-logic vulnerability detection (e.g. IDOR/BOLA chains), continuous CI/CD testing, or multi-agent parallel testing in its current version.

### 1.5 References
- OWASP Juice Shop — https://owasp.org/www-project-juice-shop/
- DVWA (Damn Vulnerable Web Application) — https://dvwa.co.uk
- CISA Known Exploited Vulnerabilities (KEV) Catalog — https://www.cisa.gov/known-exploited-vulnerabilities-catalog
- National Vulnerability Database (NVD) — https://nvd.nist.gov
- scikit-learn documentation — https://scikit-learn.org
- Groq API documentation — https://console.groq.com/docs
- Kali Linux documentation — https://www.kali.org/docs/
<<<<<<< HEAD
- Website and web GUI specification — [WEBSITE_GUI.md](./WEBSITE_GUI.md)
- Draft legal pages and consent wording — [WEBSITE_LEGAL_PAGES.md](./WEBSITE_LEGAL_PAGES.md)
- Project phases — [PHASES.md](./PHASES.md)
- Project overview — [README.md](./README.md)
=======
>>>>>>> c1ee2c96e7cc4dba0e3fafbd924792e198a3bd69

---

## 2. Overall Description

### 2.1 Product Perspective
PenflowAI is a standalone backend engine with a separate, decoupled web interface. The backend engine (core system) is built entirely in Python and is designed to run inside a Kali Linux environment so that it has native access to standard penetration testing tools. The web interface communicates with the backend through an API, and is not tightly coupled to the core engine, so the system can later be deployed as a hosted (SaaS) service without restructuring the core logic.

### 2.2 Product Functions
- Validate the authenticity of a testing authorization document (ROE) before any test begins
- Issue a scope token that gates all further system activity
- Enforce the approved testing scope at a technical level
- Perform reconnaissance, scanning, vulnerability identification, and controlled exploitation using an AI reasoning agent
- Orchestrate both large third-party tools and small custom scripts as part of testing
- Score each finding using a trained machine learning model combined with real-world threat intelligence
- Organize findings by severity, type, and affected component
- Generate a plain-language report from the findings
- Log every action taken by the AI agent with a timestamp

### 2.3 User Classes and Characteristics
- **Security Team / Test Requester** — submits a target and ROE document, receives the final report
- **Reviewer** — manually reviews ROE documents flagged by the automated validation step
- **System Administrator** — manages environment configuration, tool installation, and model retraining
- **Developer** — builds, extends, and maintains the codebase and its modules

### 2.4 Operating Environment
- **Operating System:** Kali Linux (native installation or via WSL2 on Windows 10/11)
- **Language Runtime:** Python 3.11 or later
- **AI Model Access:** Groq API (cloud-hosted inference, requires internet access and a valid API key)
- **Web Interface:** runs as a separate service, deployable independently of the core engine (local machine, VM, or cloud host)

### 2.5 Design and Implementation Constraints
- The core engine must remain independently runnable from the command line, without requiring the web interface to be active.
- All tool integrations must go through the central tool registry so new tools can be added without modifying the agent's reasoning logic.
- All testing activity must pass through the Scope Guard component; no code path may bypass scope enforcement.
- The AI model used for reasoning and reporting must be configurable (not hardcoded to a single provider or model name), since model availability and pricing can change.

### 2.6 Assumptions and Dependencies
- The system assumes it is being run against explicitly authorized targets only (lab environments such as OWASP Juice Shop and DVWA during development).
- The system assumes outbound internet access is available for AI model API calls and threat intelligence feed lookups.
- The system assumes Kali Linux (or an equivalent Debian-based penetration testing distribution) is available as the execution environment for tool-based scanning.

---

## 3. System Features (Functional Requirements)

### 3.1 ROE Validation Module
- **FR-1.1:** The system shall accept a Rules of Engagement (ROE) document as input before any testing activity is permitted.
- **FR-1.2:** The system shall run an automated check on the submitted document, evaluating document structure, field consistency, signature presence, and listed scope/date validity.
- **FR-1.3:** The system shall use a trained classification model to flag documents that show signs of tampering or inconsistency.
- **FR-1.4:** Documents flagged by the automated check shall be routed to a manual review queue rather than being auto-rejected outright.
- **FR-1.5:** A manual reviewer shall be able to approve, reject, or request correction of a flagged document, and this decision shall be recorded with a timestamp and reviewer identifier.
- **FR-1.6:** A scope token shall be generated only after a document passes either the automated check or manual review.

### 3.2 Scope Guard Module
- **FR-2.1:** The system shall require a valid, unexpired scope token before allowing any agent action to execute.
- **FR-2.2:** The system shall maintain the exact list of approved targets extracted from the validated ROE.
- **FR-2.3:** The system shall reject and log any agent action directed at a target outside the approved list, without executing that action.

### 3.3 AI Pentesting Agent Module
- **FR-3.1:** The system shall perform reconnaissance on the approved target(s), identifying reachable endpoints, technologies in use, and surface-level structure.
- **FR-3.2:** The system shall perform scanning and enumeration against discovered endpoints and input fields.
- **FR-3.3:** The system shall identify candidate vulnerabilities by matching observed behavior against known vulnerability patterns.
- **FR-3.4:** The system shall attempt controlled, limited exploitation to confirm a candidate finding, constrained to safe proof-of-concept actions.
- **FR-3.5:** The agent's reasoning shall follow a Reason-then-Act (ReAct) loop, where each action is chosen based on the outcome of the previous step.

### 3.4 Tool Integration Layer
- **FR-4.1:** The system shall provide a central tool registry through which all pentesting tools (large and small) are made available to the agent.
- **FR-4.2:** The system shall support both third-party command-line tools (e.g. Nmap, SQLMap, Nikto, OWASP ZAP) and custom Python-based check scripts through the same registry interface.
- **FR-4.3:** Adding a new tool shall not require modification of the agent's core reasoning logic — only registration in the tool registry.

### 3.5 Risk Assessment Module
- **FR-5.1:** The system shall score each confirmed finding using a trained RandomForest classification/regression model.
- **FR-5.2:** The scoring model shall take business-context features and threat-modelling features as input.
- **FR-5.3:** The system shall check each finding against CVE/NVD data where a formal vulnerability identifier applies.
- **FR-5.4:** The system shall check each finding's vulnerability type against the CISA KEV catalog to determine whether it is associated with active real-world exploitation.
- **FR-5.5:** The final risk score shall reflect both the business-context score and the real-world exploitation signal.

### 3.6 Vulnerability Organizer Module
- **FR-6.1:** The system shall group and sort all findings by severity, vulnerability type, and affected component before report generation.

### 3.7 Reporting Module
- **FR-7.1:** The system shall generate a final report using the AI model, based on the organized findings.
- **FR-7.2:** The report shall be written in plain, non-technical language suitable for both technical and non-technical readers.
- **FR-7.3:** The report shall include the risk score and a brief justification for each finding.

### 3.8 Logging Module
- **FR-8.1:** The system shall record every action taken by the AI agent, along with a timestamp, into a persistent log.
- **FR-8.2:** The system shall record all ROE validation decisions (automated and manual) in the same audit trail.

### 3.9 Web Interface Module
- **FR-9.1:** The system shall expose its core functionality (ROE submission, run status, report retrieval) through a backend API.
- **FR-9.2:** The web front-end shall communicate with the core engine exclusively through this API, with no direct access to internal modules.
<<<<<<< HEAD
- **FR-9.3:** The system shall provide a public website (home, how it works, features, pricing, waitlist, about, contact, security) and a logged-in web application (dashboard, targets, ROE upload and status, review queue, run monitor, findings, reports, audit log, billing, settings), as specified in [WEBSITE_GUI.md](./WEBSITE_GUI.md).
- **FR-9.4:** The website shall publish a Privacy Policy, Terms and Conditions, Cookie Policy, Refund and Cancellation Policy, and Acceptable Use Policy, linked from every page footer and from the sign-up form (drafts in [WEBSITE_LEGAL_PAGES.md](./WEBSITE_LEGAL_PAGES.md)).
- **FR-9.5:** The system shall display accurate plan, price, billing period, tax and renewal information before payment, and shall let a user cancel a subscription in no more steps than it took to sign up.
- **FR-9.6:** The system shall require proof of control of each target (for example a DNS record) and an attestation checkbox on ROE upload before a scope token can be issued.
- **FR-9.7:** The web interface shall collect only the personal data needed to provide the service, shall not store payment card numbers, and shall load no non-essential third-party scripts, fonts or trackers without prior consent.
- **FR-9.8:** The web interface shall meet WCAG 2.2 Level AA, including keyboard-operable forms, labelled inputs, text alternatives for images and diagrams, and sufficient colour contrast.
- **FR-9.9:** The website shall not publish testimonials, ratings, customer logos or product claims that are not supported by the actual state of the system.
=======
>>>>>>> c1ee2c96e7cc4dba0e3fafbd924792e198a3bd69

---

## 4. External Interface Requirements

### 4.1 User Interfaces
- A command-line interface for direct interaction with the core engine.
- A web-based interface (separate application) for submitting ROE documents, monitoring test runs, and viewing reports.

### 4.2 Hardware Interfaces
No special hardware is required. A standard development machine capable of running Kali Linux (natively or via WSL2) with a minimum of 8GB RAM is recommended for smooth tool execution.

### 4.3 Software Interfaces
- **Groq API** — used for AI model inference (reasoning agent and report generation).
- **CISA KEV feed** — used for active-exploitation lookups.
- **NVD / CVE data source** — used for formal vulnerability identification.
- **Kali Linux tool binaries** — Nmap, SQLMap, Nikto, OWASP ZAP, and others, invoked as subprocesses by the tool integration layer.

### 4.4 Communication Interfaces
All external API calls (Groq, CISA KEV, NVD) shall be made over HTTPS. The web interface shall communicate with the backend over a REST API (HTTP/HTTPS).

---

## 5. Non-Functional Requirements

### 5.1 Performance
The system should complete a full scan-to-report cycle against a lab target (such as OWASP Juice Shop) within a reasonable time frame suitable for iterative development and demonstration (target: under 30 minutes per full run, hardware-dependent).

### 5.2 Security
- API keys and credentials shall be stored in environment variables or a secrets file excluded from version control, never hardcoded.
- The Scope Guard shall be enforced at the code level, not left to agent instruction-following alone.

### 5.3 Reliability
The system shall log errors and failed tool executions without halting the entire pipeline, where a failure in one tool does not need to block the rest of the run.

### 5.4 Usability
Reports generated by the system shall be understandable without requiring the reader to look up technical terms.

### 5.5 Maintainability / Extensibility
The tool integration layer and the AI model client shall both be built as replaceable components, so that new pentesting tools or a different underlying AI model can be introduced with minimal changes elsewhere in the system.

---

## 6. System Architecture

```
ROE Document
     │
     ▼
ROE Validation (automated model + manual review)
     │
     ├── Invalid → Reject (no token issued)
     ▼ Valid
Scope Token Generated
     │
     ▼
Scope Guard (enforces approved target list)
     │
     ▼
AI Agent (ReAct loop): Recon → Scan → Identify → Controlled Exploit
     │
     ├──────────────► Logger (timestamped action log)
     ▼
Findings
     │
     ▼
Risk Scorer (RandomForest + threat modelling + CVE/KEV lookup)
     │
     ▼
Vulnerability Organizer (sorted by severity/type/component)
     │
     ▼
Report Writer (AI-generated, plain language)
     │
     ▼
Final Report → delivered via Web Interface / CLI
```

---

## 7. Environment Setup & Build Instructions

This section provides the complete steps required to prepare the development environment, install dependencies, configure the AI model, and bring up every component of the system.

### 7.1 Prerequisites

- A machine capable of running Kali Linux, either:
  - **Option A (native):** Kali Linux installed directly or in a virtual machine (VirtualBox/VMware)
  - **Option B (WSL2):** Windows 10/11 with WSL2 enabled, running the Kali Linux WSL distribution
- Python 3.11 or later
- Git
- An internet connection (required for AI model API calls and threat intelligence lookups)
- A Groq API account and API key

### 7.2 Kali Linux Environment Setup

**Option B — WSL2 setup (Windows host):**

```bash
# Run in Windows PowerShell (as Administrator)
wsl --install -d kali-linux
wsl --set-version kali-linux 2

# Launch Kali and update it
wsl -d kali-linux
sudo apt update && sudo apt full-upgrade -y
```

**Required Kali packages (both native and WSL2):**

```bash
sudo apt update
sudo apt install -y \
    python3 python3-venv python3-pip \
    nmap sqlmap nikto \
    zaproxy \
    git curl wget \
    build-essential
```

> `zaproxy` provides OWASP ZAP. Some Kali images require enabling the full repository set (`kali-linux-large` metapackage) if a tool above is not found by default.

### 7.3 Python Environment Setup

```bash
# Clone the project repository
git clone https://github.com/<your-org>/penflowai.git
cd penflowai

# Create an isolated virtual environment
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
pip install --upgrade pip
pip install -r requirements.txt
```

**Minimum `requirements.txt` contents:**

```
scikit-learn>=1.4
pandas>=2.0
numpy>=1.26
requests>=2.31
python-dotenv>=1.0
groq>=0.9
flask>=3.0          # or fastapi, for the backend API layer
pytest>=8.0
joblib>=1.3
```

### 7.4 AI Model Setup (GPT-OSS via Groq API)

```bash
# Create the environment configuration file
cp .env.example .env
```

**`.env` file contents:**

```
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-120b
NVD_API_KEY=optional_nvd_api_key_here
```

**Basic client verification (`agent/llm_client.py` usage check):**

```python
import os
from groq import Groq
from dotenv import load_dotenv

load_dotenv()

client = Groq(api_key=os.environ["GROQ_API_KEY"])

response = client.chat.completions.create(
    model=os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"),
    messages=[{"role": "user", "content": "Respond with OK if you are reachable."}],
)

print(response.choices[0].message.content)
```

Run this script after setup to confirm the model connection works before building the rest of the agent logic on top of it.

### 7.5 Machine Learning Model Setup & Training — Risk Scoring (RandomForest)

**Step 1 — Prepare the training dataset**

Create a labeled dataset of past findings with features such as:

| Feature | Description |
|---|---|
| `vulnerability_type` | Category of the bug (e.g. SQLi, XSS, CSRF) |
| `asset_criticality` | How important the affected system/component is (numeric scale) |
| `data_sensitivity` | Whether sensitive data is exposed (boolean/numeric) |
| `actively_exploited` | Whether this vulnerability type appears in the CISA KEV feed (boolean) |
| `exposure_level` | Whether the affected component is internal or internet-facing |
| `risk_label` | The target value — the resulting severity score/class to train against |

Store this as `data/training_data_risk_scoring/dataset.csv`.

**Step 2 — Training script**

```python
# risk_scoring/train_model.py
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report
import joblib

df = pd.read_csv("data/training_data_risk_scoring/dataset.csv")

features = [
    "vulnerability_type_encoded",
    "asset_criticality",
    "data_sensitivity",
    "actively_exploited",
    "exposure_level",
]
X = df[features]
y = df["risk_label"]

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

model = RandomForestClassifier(
    n_estimators=200,
    max_depth=None,
    random_state=42,
)
model.fit(X_train, y_train)

print(classification_report(y_test, model.predict(X_test)))

joblib.dump(model, "risk_scoring/models/risk_scorer.pkl")
print("Model saved to risk_scoring/models/risk_scorer.pkl")
```

```bash
python risk_scoring/train_model.py
```

**Step 3 — Loading the trained model for inference**

```python
import joblib

model = joblib.load("risk_scoring/models/risk_scorer.pkl")
score = model.predict(new_finding_features)
```

Categorical fields such as `vulnerability_type` must be encoded (e.g. via `sklearn.preprocessing.LabelEncoder` or one-hot encoding) using the same encoding scheme at both training and inference time. Save the fitted encoder alongside the model file so inference remains consistent.

### 7.6 Model Setup & Training — ROE Fraud Detection

**Step 1 — Prepare labeled ROE samples**

Collect a set of genuine and artificially tampered ROE documents (structure, metadata, signature fields, formatting) and label each as `genuine` or `tampered`. Store under `data/training_data_roe_fraud/`.

**Step 2 — Feature extraction**

Extract structural and metadata features from each document: field completeness, signature presence, formatting consistency, metadata timestamps, and any detectable edit history.

**Step 3 — Training**

```python
# roe_validation/train_fraud_model.py
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
import joblib

df = pd.read_csv("data/training_data_roe_fraud/features.csv")

X = df.drop(columns=["label"])
y = df["label"]  # 0 = genuine, 1 = tampered

X_train, X_test, y_train, y_test = train_test_split(
    X, y, test_size=0.2, random_state=42
)

model = RandomForestClassifier(n_estimators=200, random_state=42)
model.fit(X_train, y_train)

joblib.dump(model, "roe_validation/models/roe_fraud_model.pkl")
```

```bash
python roe_validation/train_fraud_model.py
```

Documents scoring above the decision threshold for `tampered` shall be routed to manual review (FR-1.4), not automatically rejected, unless the confidence score exceeds a stricter, separately configured auto-reject threshold.

### 7.7 Tool Integration Setup

Each tool wrapper under `tools/big_tools/` invokes its underlying Kali binary as a subprocess and parses its output into a common finding format. Example pattern:

```python
# tools/big_tools/nmap_wrapper.py
import subprocess

def run_nmap(target: str) -> str:
    result = subprocess.run(
        ["nmap", "-sV", "-Pn", target],
        capture_output=True, text=True, timeout=300
    )
    return result.stdout
```

New tools are added by:
1. Writing a wrapper function following the same input/output pattern.
2. Registering the wrapper in `tools/tool_registry.py`.
3. No changes are required in `agent/react_loop.py` — the registry is queried dynamically by the agent.

### 7.8 Threat Intelligence Feed Integration

```python
# risk_scoring/kev_check.py
import requests

KEV_URL = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"

def is_actively_exploited(cve_id: str) -> bool:
    data = requests.get(KEV_URL, timeout=10).json()
    known_ids = {entry["cveID"] for entry in data["vulnerabilities"]}
    return cve_id in known_ids
```

Cache this feed locally (refresh on an interval, e.g. every 24 hours) rather than fetching it on every single finding, to avoid unnecessary repeated network calls during a single test run.

### 7.9 Web Interface Setup

```bash
# Backend API
cd web/backend_api
pip install -r requirements.txt
python app.py     # starts the API server, default port configurable in config/settings.yaml

# Frontend (separate terminal)
cd web/frontend
npm install
npm run dev
```

The frontend shall be configured (via its own `.env` or config file) with the backend API's base URL, and shall not embed any AI model credentials directly — all model calls happen server-side, through the core engine.

### 7.10 Environment Variables Reference

| Variable | Purpose |
|---|---|
| `GROQ_API_KEY` | Authenticates requests to the Groq API |
| `GROQ_MODEL` | Model identifier used for reasoning and reporting (e.g. `openai/gpt-oss-120b`) |
| `NVD_API_KEY` | Optional, increases NVD API rate limits |
| `SCOPE_TOKEN_SECRET` | Secret used to sign/verify scope tokens |
| `LOG_DIR` | Directory where timestamped action logs are written |

### 7.11 Running an End-to-End Verification

```bash
# 1. Start the lab target (example: OWASP Juice Shop via Docker)
docker run -d -p 3000:3000 bkimminich/juice-shop

# 2. Validate a sample ROE
python main.py --validate-roe data/sample_roe.pdf

# 3. Run a full test against the lab target
python main.py --target http://localhost:3000 --roe data/sample_roe.pdf

# 4. Review the generated report
cat reporting/output/latest_report.md
```

A successful end-to-end run confirms: ROE validation, scope token issuance, agent execution, tool invocation, risk scoring, and report generation are all functioning together correctly.

---

## 8. Model Training Requirements

| Model | Algorithm | Input Features | Output | Retraining Trigger |
|---|---|---|---|---|
| Risk Scoring Model | RandomForest | Business context + threat data | Risk score/class | New labeled findings accumulated, or KEV data drifts significantly |
| ROE Fraud Detection Model | RandomForest | Document structure/metadata features | Genuine / Tampered classification | New tampering patterns identified, or false-positive/negative rate exceeds acceptable threshold |

Both models shall be versioned (e.g. `risk_scorer_v1.pkl`, `risk_scorer_v2.pkl`) so that a report can record which model version produced a given score, supporting reproducibility.

---

## 9. Data Requirements

- **ROE training data:** a balanced set of genuine and artificially tampered ROE documents, stored under `data/training_data_roe_fraud/`.
- **Risk scoring training data:** a labeled dataset of past findings with business-context and threat-data features, stored under `data/training_data_risk_scoring/`.
- **Sample ROE document:** a valid example document for end-to-end testing, stored as `data/sample_roe.pdf`.
- All training data shall be reviewed to ensure it contains no real, sensitive, or production system information — synthetic or anonymized data only.

---

## 10. Testing Requirements

- **Unit tests** shall cover the ROE validation model, the Scope Guard enforcement logic, the risk scoring model's feature pipeline, and the report generator's formatting logic independently.
- **Integration tests** shall verify that the full pipeline (ROE → token → agent → risk scoring → report) executes correctly end-to-end against a lab target.
- **Manual acceptance testing** shall be performed against OWASP Juice Shop and DVWA before any project milestone demonstration.

---

## 11. Appendices

### Appendix A — Glossary
- **ROE:** Rules of Engagement — the document authorizing a penetration test and defining its scope.
- **Scope Token:** an internally generated credential that unlocks agent activity once ROE validation succeeds.
- **KEV:** Known Exploited Vulnerabilities — CISA's catalog of vulnerabilities confirmed to be under active attack.
- **ReAct loop:** a reasoning pattern where a model alternates between reasoning about a task and taking an action based on that reasoning.

### Appendix B — Sample `.env.example`

```
GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120b
NVD_API_KEY=
SCOPE_TOKEN_SECRET=
LOG_DIR=./logging_system/logs
```

### Appendix C — Directory Structure Reference

<<<<<<< HEAD
See the project `README.md` for the complete file and folder structure, which mirrors the module breakdown defined in Section 3 of this document. The `web/` folder, the legal pages and the compliance, accessibility and pricing requirements are detailed in `WEBSITE_GUI.md` and `WEBSITE_LEGAL_PAGES.md`.
=======
See the project `README.md` for the complete file and folder structure, which mirrors the module breakdown defined in Section 3 of this document.
>>>>>>> c1ee2c96e7cc4dba0e3fafbd924792e198a3bd69
