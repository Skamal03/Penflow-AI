/**
 * Typed mirror of core/reporting/report.schema.json (schema_version "1.0").
 * Keep in sync with that file: one interface, no `any`.
 */

export type SeverityKey = 'critical' | 'high' | 'medium' | 'low' | 'informational';
export type OverallKey = SeverityKey | 'none';
export type TextSource = 'ai' | 'cache' | 'fallback';

export type SeverityLevel = {
  key: SeverityKey;
  label: string;
  rank: number;
  colour: string;
  icon: string;
  meaning: string;
  fix: string;
};

export type ReportOverall = {
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational' | 'none';
  label: string;
  key: OverallKey;
  rank: number | null;
  colour: string;
  icon: string;
  meaning?: string;
  fix?: string;
};

export type ReportCounts = {
  critical: number;
  high: number;
  medium: number;
  low: number;
  informational: number;
  total: number;
};

export type ReportFinding = {
  id: string;
  name: string;
  tool: string;
  url: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational';
  severity_key: SeverityKey;
  severity_rank: number;
  evidence: string;
  summary: string;
  mitigation: string;
  technical_note: string;
  text_source: TextSource;
  /** Reserved for the RandomForest Risk Scorer: never invented by the report writer. */
  risk_score: number | null;
  cve: string[];
  kev: boolean | null;
  owasp: string | null;
};

export type ReportTool = {
  name: string;
  status: string;
  count: number;
  detail: string;
};

export type ScanReport = {
  schema_version: '1.0';
  run_id: string;
  generated_at: string;
  target: string;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  owner: { user_id: string | number | null; roe_id: string | number | null };
  ai: { used: boolean; model: string | null; calls: number; fallback_used: boolean };
  overall: ReportOverall;
  severity_scale: SeverityLevel[];
  counts: ReportCounts;
  executive_summary: string;
  tools: ReportTool[];
  coverage_note: string;
  findings: ReportFinding[];
};
