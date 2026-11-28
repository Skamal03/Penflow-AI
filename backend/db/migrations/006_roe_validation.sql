ALTER TABLE roe_documents
  ADD COLUMN lab_mode BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE roe_documents
  DROP CONSTRAINT IF EXISTS roe_documents_status_check;

UPDATE roe_documents
SET status = CASE status
  WHEN 'checking' THEN 'submitted'
  WHEN 'needs_review' THEN 'review_pending'
  WHEN 'approved' THEN 'approved'
  WHEN 'rejected' THEN 'rejected'
  ELSE status
END;

ALTER TABLE roe_documents
  ADD CONSTRAINT roe_documents_status_check
  CHECK (status IN ('draft', 'submitted', 'rejected', 'ownership_pending', 'ownership_verified', 'review_pending', 'approved', 'expired', 'revoked'));

CREATE TABLE roe_verifications (
  id UUID PRIMARY KEY,
  roe_id UUID NOT NULL REFERENCES roe_documents(id) ON DELETE CASCADE,
  target TEXT NOT NULL,
  token TEXT NOT NULL,
  method TEXT CHECK (method IN ('dns', 'file', 'meta')),
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ,
  UNIQUE (roe_id, target)
);
