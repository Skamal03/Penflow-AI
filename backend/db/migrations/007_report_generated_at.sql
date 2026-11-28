ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS generated_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'reports'
      AND column_name = 'created_at'
  ) THEN
    EXECUTE 'UPDATE reports SET generated_at = created_at WHERE generated_at IS NULL';
  END IF;
END
$$;

UPDATE reports
SET generated_at = CURRENT_TIMESTAMP
WHERE generated_at IS NULL;

ALTER TABLE reports
  ALTER COLUMN generated_at SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN generated_at SET NOT NULL;
