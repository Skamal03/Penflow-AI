ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;

UPDATE users SET email_verified_at = created_at WHERE email_verified = TRUE;

CREATE TABLE email_tokens (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  ip TEXT
);
CREATE INDEX email_tokens_token_hash_idx ON email_tokens(token_hash);
CREATE INDEX email_tokens_user_purpose_idx ON email_tokens(user_id, purpose, used_at);

CREATE TABLE rate_events (
  bucket TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX rate_events_bucket_idx ON rate_events(bucket, created_at);

DROP TABLE password_reset_tokens;
DROP TABLE email_verification_tokens;
