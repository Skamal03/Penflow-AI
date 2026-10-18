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

export const plans: Plan[] = [
  { id: 'free', name: 'Free', monthlyUsd: 0, monthlyPkr: 0, yearlyUsd: null, yearlyPkr: null, segment: 'Trial users', seats: '1 user / 1 app', scans: 2, guardrails: 'ROE + Scope Guard', report: 'Basic text', retention: '7 days' },
  { id: 'starter', name: 'Starter', monthlyUsd: 19, monthlyPkr: 5263, yearlyUsd: 190, yearlyPkr: 52630, segment: 'Solo freelancer', seats: '1 user / 1 app', scans: 5, guardrails: 'ROE + Scope Guard', report: 'Standard PDF', retention: '30 days' },
  { id: 'pro', name: 'Pro', monthlyUsd: 39, monthlyPkr: 10803, yearlyUsd: 390, yearlyPkr: 108030, segment: 'Small software house', seats: '3 users / 5 apps', scans: 15, guardrails: 'ROE + Scope Guard', report: 'Standard PDF', retention: '90 days + export', recommended: true },
  { id: 'team', name: 'Team', monthlyUsd: 89, monthlyPkr: 24653, yearlyUsd: 890, yearlyPkr: 246530, segment: 'Agencies / teams', seats: '10 users / 20 apps', scans: 40, guardrails: 'ROE + Scope Guard', report: 'Custom-logo PDF', retention: '1 year + export' },
];
