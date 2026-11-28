ALTER TABLE targets
  ADD CONSTRAINT targets_id_owner_unique UNIQUE (id, owner_id);

ALTER TABLE roe_documents
  ADD CONSTRAINT roe_documents_id_owner_unique UNIQUE (id, owner_id);

CREATE TABLE scope_policies (
  id UUID PRIMARY KEY,
  roe_id UUID NOT NULL,
  user_id UUID NOT NULL,
  target_id UUID NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'active', 'revoked')),
  policy_json JSONB NOT NULL,
  policy_hash TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMPTZ NOT NULL,
  UNIQUE (roe_id, version),
  CHECK (status <> 'active' OR policy_hash IS NOT NULL),
  UNIQUE (id, roe_id, user_id, target_id),
  FOREIGN KEY (roe_id, user_id)
    REFERENCES roe_documents(id, owner_id) ON DELETE CASCADE,
  FOREIGN KEY (target_id, user_id)
    REFERENCES targets(id, owner_id) ON DELETE CASCADE
);

CREATE INDEX scope_policies_roe_idx ON scope_policies(roe_id);
CREATE INDEX scope_policies_user_idx ON scope_policies(user_id);

ALTER TABLE runs
  ADD COLUMN policy_id UUID,
  ADD COLUMN target_id UUID,
  ADD CONSTRAINT runs_id_owner_unique UNIQUE (id, owner_id),
  ADD CONSTRAINT runs_policy_target_pair_check
    CHECK ((policy_id IS NULL) = (target_id IS NULL)),
  ADD CONSTRAINT runs_target_owner_fk
    FOREIGN KEY (target_id, owner_id)
    REFERENCES targets(id, owner_id),
  ADD CONSTRAINT runs_policy_binding_fk
    FOREIGN KEY (policy_id, roe_id, owner_id, target_id)
    REFERENCES scope_policies(id, roe_id, user_id, target_id);

CREATE INDEX runs_policy_idx ON runs(policy_id);
CREATE INDEX runs_target_idx ON runs(target_id);

CREATE TABLE scope_audit_log (
  id UUID PRIMARY KEY,
  run_id UUID NOT NULL,
  policy_id UUID REFERENCES scope_policies(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool TEXT NOT NULL,
  args_json JSONB NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allowed', 'blocked')),
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (run_id, user_id) REFERENCES runs(id, owner_id) ON DELETE CASCADE
);

CREATE INDEX scope_audit_run_idx ON scope_audit_log(run_id, created_at);
CREATE INDEX scope_audit_user_idx ON scope_audit_log(user_id, created_at);
