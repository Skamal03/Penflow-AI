export type Role = 'requester' | 'reviewer' | 'admin';

export type User = {
  id: string;
  email: string;
  displayName: string;
  role: Role;
  emailVerified: boolean;
  planId: string;
  accountType: string;
};

export type Target = {
  id: string;
  url: string;
  label: string;
  verification_method: string;
  verification_token?: string | null;
  status: 'verified' | 'pending' | 'blocked';
};

export type Roe = {
  id: string;
  file_name: string;
  target_ids_json: string;
  scope_json: string;
  status: 'checking' | 'needs_review' | 'approved' | 'rejected';
  automated_decision: string;
  confidence: number | null;
  reasons_json: string;
  reviewer_id: string | null;
  decision: string | null;
  note: string | null;
  decided_at: string | null;
  scope_token: string | null;
  scope_token_issued_at: string | null;
};

export type Run = {
  id: string;
  roe_id: string;
  status: 'queued' | 'running' | 'stopped' | 'complete' | 'failed';
  stage: 'recon' | 'scan' | 'identify' | 'verify';
  started_at: string;
  finished_at: string | null;
  scope_json: string;
};

export type Finding = {
  id: string;
  type: string;
  title: string;
  component: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  risk_score: number;
  score_rationale: string;
  cve_id: string | null;
  actively_exploited: number;
  evidence: string;
  plain_language: string;
};

export type AuditEvent = {
  id: string;
  actor: string;
  action: string;
  target: string;
  blocked: number;
  detail: string;
  created_at: string;
};

export type Plan = {
  id: 'free' | 'starter' | 'pro' | 'team';
  name: string;
  monthlyUsd: number;
  monthlyPkr: number;
  yearlyUsd: number | null;
  yearlyPkr: number | null;
  segment: string;
  seats: string;
  scans: number;
  guardrails: string;
  report: string;
  retention: string;
  recommended?: boolean;
};
