CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('requester', 'reviewer', 'admin')),
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  plan_id TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (LOWER(email));
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX sessions_token_hash_idx ON sessions(refresh_token_hash);
CREATE TABLE login_attempts (
  id BIGSERIAL PRIMARY KEY,
  email_key TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL,
  succeeded BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX login_attempts_lookup_idx ON login_attempts(email_key, ip_address, attempted_at);
CREATE TABLE targets (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  label TEXT NOT NULL,
  verification_method TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('verified', 'pending', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE roe_documents (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  target_ids_json TEXT NOT NULL,
  scope_json TEXT NOT NULL,
  attestation BOOLEAN NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('checking', 'needs_review', 'approved', 'rejected')),
  automated_decision TEXT NOT NULL,
  confidence DOUBLE PRECISION,
  reasons_json TEXT NOT NULL,
  reviewer_id UUID REFERENCES users(id),
  decision TEXT,
  note TEXT,
  decided_at TIMESTAMPTZ,
  scope_token TEXT,
  scope_token_issued_at TIMESTAMPTZ,
  file_path TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX roe_owner_idx ON roe_documents(owner_id, uploaded_at);
CREATE TABLE runs (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  roe_id UUID NOT NULL REFERENCES roe_documents(id),
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'stopped', 'complete', 'failed')),
  stage TEXT NOT NULL CHECK (stage IN ('recon', 'scan', 'identify', 'verify')),
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  scope_json TEXT NOT NULL
);
CREATE INDEX runs_owner_idx ON runs(owner_id, started_at DESC);
CREATE FUNCTION runs_require_approved_roe() RETURNS trigger AS $$
BEGIN
  IF (SELECT status FROM roe_documents WHERE id = NEW.roe_id) <> 'approved' THEN
    RAISE EXCEPTION 'Run requires an approved ROE';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER runs_require_approved_roe
BEFORE INSERT ON runs
FOR EACH ROW EXECUTE FUNCTION runs_require_approved_roe();
CREATE TABLE findings (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  component TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  score_rationale TEXT NOT NULL,
  cve_id TEXT,
  actively_exploited BOOLEAN NOT NULL DEFAULT FALSE,
  evidence TEXT NOT NULL,
  plain_language TEXT NOT NULL
);
CREATE TABLE reports (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL UNIQUE REFERENCES runs(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  markdown TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL
);
CREATE TABLE audit_events (
  id UUID PRIMARY KEY,
  owner_id UUID REFERENCES users(id) ON DELETE CASCADE,
  run_id UUID REFERENCES runs(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL,
  blocked BOOLEAN NOT NULL DEFAULT FALSE,
  detail TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX audit_owner_idx ON audit_events(owner_id, created_at);
CREATE TABLE waitlist (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role_description TEXT,
  updates_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE UNIQUE INDEX waitlist_email_lower_idx ON waitlist (LOWER(email));
CREATE TABLE plan_change_requests (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending_activation', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ
);
CREATE TABLE password_reset_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL
);
