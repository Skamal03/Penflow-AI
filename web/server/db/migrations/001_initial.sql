PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('requester', 'reviewer', 'admin')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  plan_id TEXT NOT NULL DEFAULT 'free',
  created_at TEXT NOT NULL
);
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX sessions_token_hash_idx ON sessions(token_hash);
CREATE TABLE login_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_key TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  succeeded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX login_attempts_lookup_idx ON login_attempts(email_key, ip_address, attempted_at);
CREATE TABLE targets (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  label TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('verified', 'pending', 'blocked')),
  created_at TEXT NOT NULL
);
CREATE TABLE roe_documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  target_ids_json TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  attestation INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('checking', 'needs_review', 'approved', 'rejected')),
  automated_decision TEXT NOT NULL,
  confidence REAL,
  reasons_json TEXT NOT NULL,
  reviewer_id TEXT REFERENCES users(id),
  decision TEXT,
  note TEXT,
  decided_at TEXT,
  scope_token TEXT,
  scope_token_issued_at TEXT,
  file_path TEXT,
  uploaded_at TEXT NOT NULL
);
CREATE INDEX roe_owner_idx ON roe_documents(owner_id, uploaded_at);
CREATE TABLE runs (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roe_id TEXT NOT NULL REFERENCES roe_documents(id),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'stopped', 'complete', 'failed')),
  stage TEXT NOT NULL CHECK (stage IN ('recon', 'scan', 'identify', 'verify')),
  started_at TEXT NOT NULL,
  finished_at TEXT,
  scope_json TEXT NOT NULL
);
CREATE INDEX runs_owner_idx ON runs(owner_id, started_at DESC);
CREATE TRIGGER runs_require_approved_roe
BEFORE INSERT ON runs
WHEN (SELECT status FROM roe_documents WHERE id = NEW.roe_id) != 'approved'
BEGIN
  SELECT RAISE(ABORT, 'Run requires an approved ROE');
END;
CREATE TABLE findings (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  component TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  score_rationale TEXT NOT NULL,
  cve_id TEXT,
  actively_exploited INTEGER NOT NULL DEFAULT 0,
  evidence TEXT NOT NULL,
  plain_language TEXT NOT NULL
);
CREATE TABLE reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  markdown TEXT NOT NULL,
  generated_at TEXT NOT NULL
);
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  owner_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  run_id TEXT REFERENCES runs(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX audit_owner_idx ON audit_events(owner_id, created_at);
CREATE TABLE waitlist (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT,
  role_description TEXT,
  updates_opt_in INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE TABLE plan_change_requests (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_activation', 'cancelled')),
  created_at TEXT NOT NULL,
  cancelled_at TEXT
);
CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL
);
