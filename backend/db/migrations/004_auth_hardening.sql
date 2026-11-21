ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN locked_until TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'sessions' AND column_name = 'token_hash'
  ) THEN
    ALTER TABLE sessions RENAME COLUMN token_hash TO refresh_token_hash;
  END IF;
END $$;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;
ALTER TABLE sessions ADD COLUMN ip TEXT;
ALTER TABLE sessions ADD COLUMN revoked_at TIMESTAMPTZ;
ALTER TABLE sessions ADD COLUMN replaced_by UUID REFERENCES sessions(id);
ALTER TABLE sessions ADD COLUMN last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
CREATE INDEX sessions_user_idx ON sessions(user_id, created_at DESC);
DELETE FROM sessions;

ALTER TABLE audit_events ADD COLUMN ip TEXT;
ALTER TABLE audit_events ADD COLUMN user_agent TEXT;
