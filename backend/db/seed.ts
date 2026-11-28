import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';

const created = '2026-10-18T09:00:00.000Z';
const passwordHash = '$2b$10$AZ9WJeKY2Y59geeK90ScLuo08bO3DTXjIhoU0w0VgWZwGt7JfAkvG';
const ayesha = '11111111-1111-4111-8111-111111111111';
const bilal = '22222222-2222-4222-8222-222222222222';
const sana = '33333333-3333-4333-8333-333333333333';
const admin = '44444444-4444-4444-8444-444444444444';
const pending = '55555555-5555-4555-8555-555555555555';
const juice = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const dvwa = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const staging = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const blocked = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4';
const bilalTarget = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5';
const roeApproved = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const roeReview = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const roeRejected = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
const roeChecking = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4';
const roeBilal = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb5';
const runFirst = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';
const runSecond = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc2';
const report = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1';

export async function seed(client: PoolClient): Promise<void> {
  const runWindowStart = new Date(Date.now() - 60 * 1000).toISOString();
  const runWindowEnd = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const roeScope = (targets: string[]) => JSON.stringify({
    targets,
    allowed_tools: ['header_checks'],
    start_time: runWindowStart,
    end_time: runWindowEnd,
  });
  const addUser = 'INSERT INTO users (id, email, password_hash, display_name, account_type, role, email_verified, plan_id, created_at, email_verified_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)';
  const users: Array<[string, string, string, string, string, number, string]> = [
    [ayesha, 'requester@penflow.test', 'Ayesha Khan', 'freelance', 'requester', 1, 'starter'],
    [bilal, 'requester2@penflow.test', 'Bilal Ahmed', 'freelance', 'requester', 1, 'free'],
    [sana, 'reviewer@penflow.test', 'Sana Malik', 'reviewer', 'reviewer', 1, 'free'],
    [admin, 'admin@penflow.test', 'Penflow Administrator', 'staff', 'admin', 1, 'free'],
    [pending, 'pending@penflow.test', 'Pending Account', 'freelance', 'requester', 0, 'free'],
  ];
  for (const [id, email, name, type, role, verified, plan] of users) {
    await client.query(addUser, [id, email, passwordHash, name, type, role, verified === 1, plan, created, verified === 1 ? created : null]);
  }

  const addTarget = 'INSERT INTO targets (id, owner_id, url, label, verification_method, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)';
  await client.query(addTarget, [juice, ayesha, 'http://localhost:3000', 'OWASP Juice Shop', 'DNS TXT', 'verified', created]);
  await client.query(addTarget, [dvwa, ayesha, 'http://localhost:8080', 'DVWA', 'File upload', 'verified', created]);
  await client.query(addTarget, [staging, ayesha, 'https://staging.example-client.test', 'Client staging environment', 'DNS TXT', 'pending', created]);
  await client.query(addTarget, [blocked, ayesha, 'https://government.example.test', 'Restricted infrastructure', 'Not eligible', 'blocked', created]);
  await client.query(addTarget, [bilalTarget, bilal, 'http://localhost:3000', 'Bilal lab target', 'DNS TXT', 'verified', created]);

  const addRoe = `INSERT INTO roe_documents
    (id, owner_id, file_name, target_ids_json, scope_json, attestation, status, automated_decision, confidence, reasons_json, reviewer_id, decision, note, decided_at, scope_token, scope_token_issued_at, uploaded_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`;
  await client.query(addRoe, [roeApproved, ayesha, 'juice-shop-roe.pdf', JSON.stringify([juice, dvwa]), roeScope(['http://localhost:3000', 'http://localhost:8080']), true, 'approved', 'passed', 0.12, '[]', sana, 'approved', 'Automated checks passed. Scope token issued for the verified lab targets.', '2026-10-18T09:10:00.000Z', 'scope_demo_run_01_02', '2026-10-18T09:10:00.000Z', created]);
  await client.query(addRoe, [roeReview, ayesha, 'client-scope-review.pdf', JSON.stringify([staging]), roeScope(['https://staging.example-client.test']), true, 'review_pending', 'passed', 0.91, JSON.stringify(['Signature field empty', 'Scope dates outside the requested window']), null, null, null, null, null, null, '2026-10-18T09:15:00.000Z']);
  await client.query(addRoe, [roeRejected, ayesha, 'edited-scope-roe.pdf', JSON.stringify([staging]), roeScope(['https://staging.example-client.test']), true, 'rejected', 'flagged', 0.97, JSON.stringify(['Scope list edited after signing']), sana, 'rejected', 'The scope list appears to have changed after the document was signed. Submit an unchanged, newly authorised document.', '2026-10-18T09:30:00.000Z', null, null, '2026-10-18T09:25:00.000Z']);
  await client.query(addRoe, [roeChecking, ayesha, 'pending-review.pdf', JSON.stringify([staging]), roeScope(['https://staging.example-client.test']), true, 'submitted', 'checking', null, '[]', null, null, null, null, null, null, '2026-10-18T09:35:00.000Z']);
  await client.query(addRoe, [roeBilal, bilal, 'bilal-roe.pdf', JSON.stringify([bilalTarget]), roeScope(['http://localhost:3000']), true, 'approved', 'passed', 0.08, '[]', null, 'approved', 'Lab ownership attested and scope checks passed.', '2026-10-18T09:40:00.000Z', 'scope_demo_bilal', '2026-10-18T09:40:00.000Z', '2026-10-18T09:38:00.000Z']);
  const proofExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000);
  for (const [roeId, target] of [
    [roeApproved, 'http://localhost:3000'],
    [roeApproved, 'http://localhost:8080'],
    [roeBilal, 'http://localhost:3000'],
  ]) {
    await client.query('INSERT INTO roe_verifications (id, roe_id, target, token, method, expires_at, verified_at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      randomUUID(), roeId, target, randomUUID(), 'dns', proofExpiry, new Date(),
    ]);
  }

  const addRun = 'INSERT INTO runs (id, owner_id, roe_id, status, stage, started_at, finished_at, scope_json) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)';
  await client.query(addRun, [runFirst, ayesha, roeApproved, 'complete', 'verify', '2026-10-18T10:00:00.000Z', '2026-10-18T10:14:00.000Z', '["http://localhost:3000"]']);
  await client.query(addRun, [runSecond, ayesha, roeApproved, 'running', 'identify', '2026-10-18T16:40:00.000Z', null, '["http://localhost:8080"]']);

  const findings: Array<[string, string, string, string, number, string, string | null, number, string, string]> = [
    ['sql_injection', 'SQL injection in product search', '/rest/products/search', 'critical', 94, 'Internet-facing endpoint, customer data exposed, and this class is in the CISA KEV catalog.', null, 1, 'A search value changed the database query and returned records beyond the requested product.', 'A visitor could read data from the database that they should not be able to see.'],
    ['broken_authentication', 'Authentication bypass through SQL injection', '/rest/user/login', 'critical', 93, 'Authentication boundary exposed, administrative access confirmed, and the demonstrated injection pattern is actively exploited.', null, 1, 'A crafted login value bypassed the normal credential check and returned an administrator session.', 'An attacker could access an administrator account without knowing its password.'],
    ['cross_site_scripting', 'Reflected script in search field', '/#/search?q=', 'high', 81, 'User-controlled input reaches a browser execution context; authenticated session data may be exposed.', null, 0, 'A controlled test string was interpreted as markup in the search results view.', 'A malicious link could run script in another user’s browser when opened.'],
    ['sensitive_data_exposure', 'Sensitive files exposed through FTP area', '/ftp/', 'high', 78, 'Publicly reachable file listing exposes application artifacts that may contain operational information.', null, 0, 'Unauthenticated requests listed downloadable files under the exposed directory.', 'Visitors can access files that should not be public.'],
    ['security_misconfiguration', 'Security response headers are missing', 'HTTP response headers', 'medium', 61, 'Internet-facing responses omit browser protections; this increases the impact of other web weaknesses.', null, 0, 'Responses did not include Content-Security-Policy and X-Content-Type-Options.', 'Browsers receive fewer instructions to reduce the impact of injected content.'],
    ['vulnerable_component', 'Outdated client-side dependency', 'package manifest / served assets', 'medium', 58, 'A known vulnerable component can lower the effort required to exploit an exposed application feature.', null, 0, 'The observed dependency version falls within a published vulnerable range.', 'An older software component may contain a publicly documented weakness.'],
    ['cross_site_request_forgery', 'State change lacks request-origin protection', '/profile', 'low', 34, 'A low-complexity cross-site request could affect a signed-in user, though no sensitive data exposure was demonstrated.', null, 0, 'A state-changing request did not require a per-request anti-forgery token in the lab configuration.', 'A user could be tricked into making a change while signed in.'],
    ['broken_access_control', 'Restricted endpoint accepts an unauthorised request', '/api/Users/1', 'high', 76, 'Object-level access checks are absent on a customer-data route; access-control failures are a common attacker path.', null, 0, 'A request without the expected user context returned another account record.', 'One account may be able to view another account’s information.'],
  ];
  const addFinding = `INSERT INTO findings (id, run_id, type, title, component, severity, risk_score, score_rationale, cve_id, actively_exploited, evidence, plain_language)
    VALUES ($1, '${runFirst}', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;
  for (const [type, title, component, severity, riskScore, scoreRationale, cveId, activelyExploited, evidence, plainLanguage] of findings) {
    await client.query(addFinding, [randomUUID(), type, title, component, severity, riskScore, scoreRationale, cveId, activelyExploited === 1, evidence, plainLanguage]);
  }

  const reportBody = `# Security test report\n\n## Summary\nThis simulated early-access view represents a completed lab run against OWASP Juice Shop. Eight findings were recorded. No live engine is connected, and this report is not evidence of a test against a production system.\n\n## What was tested\n- Target: http://localhost:3000 (OWASP Juice Shop)\n- Workflow: Recon, Scan, Identify, Verify\n- Scope: the verified target listed in the approved Rules of Engagement\n\n## Findings by severity\n- Critical: 2\n- High: 3\n- Medium: 2\n- Low: 1\n\n## What to fix first\n1. Correct the product search SQL query using parameterized statements and review authentication paths.\n2. Enforce object-level authorization on every user-data endpoint.\n3. Encode search output and review exposed files, dependencies, and response headers.\n\n## AI disclaimer\nFindings, risk scores, and report text can be incomplete or incorrect. Review evidence and validate results before taking action. This seeded report is illustrative and scan execution is simulated.\n`;
  await client.query('INSERT INTO reports (id, run_id, owner_id, markdown, generated_at) VALUES ($1, $2, $3, $4, $5)', [report, runFirst, ayesha, reportBody, '2026-10-18T10:15:00.000Z']);

  const events: Array<[string, string, string, number, string, string]> = [
    ['requester', 'roe_submitted', roeApproved, 0, 'Requester submitted the signed lab scope document.', '2026-10-18T09:00:00.000Z'],
    ['system', 'automated_roe_check', roeApproved, 0, 'Automated check passed with confidence 0.12.', '2026-10-18T09:05:00.000Z'],
    ['reviewer', 'roe_approved', roeApproved, 0, 'Sana Malik confirmed lab scope and issued a scope token.', '2026-10-18T09:10:00.000Z'],
    ['requester', 'run_started', 'http://localhost:3000', 0, 'Run started within approved scope.', '2026-10-18T10:00:00.000Z'],
    ['agent', 'recon_request', 'http://localhost:3000/', 0, 'GET via recon tool.', '2026-10-18T10:00:02.000Z'],
    ['agent', 'endpoint_discovered', 'http://localhost:3000/rest/products/search', 0, 'Search endpoint added to the test queue.', '2026-10-18T10:01:10.000Z'],
    ['agent', 'header_check', 'http://localhost:3000/', 0, 'Response headers recorded for review.', '2026-10-18T10:02:30.000Z'],
    ['agent', 'scope_check', 'http://localhost:3000/rest/products/search', 0, 'Exact host matched approved scope.', '2026-10-18T10:03:00.000Z'],
    ['agent', 'controlled_probe', 'http://localhost:3000/rest/products/search', 0, 'Non-destructive input variation returned an unexpected result.', '2026-10-18T10:04:12.000Z'],
    ['scope_guard', 'http_request', 'http://example.com/admin', 1, 'Target is not in the approved scope. Request not sent.', '2026-10-18T10:04:16.000Z'],
    ['agent', 'evidence_saved', 'http://localhost:3000/rest/products/search', 0, 'Response excerpt attached to finding f_01.', '2026-10-18T10:05:00.000Z'],
    ['agent', 'auth_check', 'http://localhost:3000/rest/user/login', 0, 'Authentication response compared with expected behavior.', '2026-10-18T10:06:20.000Z'],
    ['agent', 'browser_input_check', 'http://localhost:3000/#/search', 0, 'Search rendering checked with a harmless marker.', '2026-10-18T10:07:14.000Z'],
    ['agent', 'file_exposure_check', 'http://localhost:3000/ftp/', 0, 'Directory response recorded without downloading unknown files.', '2026-10-18T10:08:02.000Z'],
    ['agent', 'access_control_check', 'http://localhost:3000/api/Users/1', 0, 'Response reviewed for user-context enforcement.', '2026-10-18T10:09:40.000Z'],
    ['agent', 'risk_scoring', 'http://localhost:3000', 0, 'Scores include business context and threat-intelligence rationale.', '2026-10-18T10:11:10.000Z'],
    ['system', 'report_generated', report, 0, 'Seeded report record created for the simulated run.', '2026-10-18T10:13:20.000Z'],
    ['reviewer', 'review_note', roeReview, 0, 'Correction requested: signature field is empty and dates are outside the window.', '2026-10-18T09:20:00.000Z'],
    ['reviewer', 'roe_rejected', roeRejected, 0, 'Scope list changed after signing; no token was issued.', '2026-10-18T09:30:00.000Z'],
    ['requester', 'run_started', 'http://localhost:8080', 0, 'Run started under the approved lab ROE.', '2026-10-18T16:40:00.000Z'],
    ['agent', 'partial_log', 'http://localhost:8080', 0, 'Identification stage is in progress in the simulated view.', '2026-10-18T16:41:00.000Z'],
  ];
  const addEvent = 'INSERT INTO audit_events (id, owner_id, run_id, actor, action, target, blocked, detail, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)';
  for (const [index, [actor, action, target, blocked, detail, timestamp]] of events.entries()) {
    await client.query(addEvent, [randomUUID(), ayesha, index >= 19 ? runSecond : runFirst, actor, action, target, blocked === 1, detail, timestamp]);
  }

  const addWaitlist = 'INSERT INTO waitlist (id, email, name, role_description, updates_opt_in, created_at) VALUES ($1, $2, $3, $4, $5, $6)';
  const waitlist: Array<[string, string, string, number]> = [
    ['security-team@penflow.test', 'Mina Qureshi', 'Independent security consultant', 0],
    ['builder@penflow.test', 'Raza Iqbal', 'Small software team', 1],
    ['researcher@penflow.test', 'Hiba Noor', 'Security student', 0],
    ['studio@penflow.test', 'Omar Shah', 'Web development studio', 1],
  ];
  for (const [index, [email, name, role, updates]] of waitlist.entries()) {
    await client.query(addWaitlist, [randomUUID(), email, name, role, updates === 1, `2026-10-1${index + 1}T10:00:00.000Z`]);
  }

  await client.query('INSERT INTO plan_change_requests (id, user_id, plan_id, status, created_at) VALUES ($1, $2, $3, $4, $5)', [randomUUID(), ayesha, 'starter', 'pending_activation', '2026-10-18T08:00:00.000Z']);
}
