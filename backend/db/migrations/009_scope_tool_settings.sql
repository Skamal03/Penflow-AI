CREATE TABLE scope_tool_settings (
  tool TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by UUID REFERENCES users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO scope_tool_settings (tool, enabled) VALUES
  ('nmap', TRUE),
  ('zap', TRUE),
  ('whatweb', TRUE),
  ('wafw00f', TRUE),
  ('ffuf', TRUE),
  ('header_checks', TRUE),
  ('nuclei', TRUE),
  ('nikto', TRUE),
  ('sqlmap', FALSE);
