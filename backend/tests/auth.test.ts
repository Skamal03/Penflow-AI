import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { setValidatorRunner, type ValidatorRunner } from '../roe/validator-client.js';
import { setPolicyBuilderRunner } from '../scope-guard/policy-client.js';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database before running the auth tests.');
process.env.DATABASE_URL = connectionString;
process.env.JWT_SECRET = 'test-only-jwt-secret-at-least-32-bytes-long';
process.env.CORS_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173';
process.env.COOKIE_SECURE = 'false';
process.env.APP_BASE_URL = 'http://127.0.0.1:5173';

type Database = typeof import('../db/index.js');

const tables = ['schema_migrations', 'users', 'sessions', 'login_attempts', 'targets', 'roe_verifications', 'roe_documents', 'scope_audit_log', 'runs', 'scope_tool_settings', 'scope_policies', 'findings', 'reports', 'audit_events', 'waitlist', 'plan_change_requests', 'email_tokens', 'rate_events'];
const demoPassword = 'Penflow!2026';

let base = '';
let db: Database;
let stopServer: () => Promise<void>;
let validationResponse: { status: 'valid' | 'invalid'; reasons: string[]; targets: string[] } = { status: 'valid', reasons: [], targets: [] };
let ownershipResponse = { verified: false, method: null as 'dns' | 'file' | 'meta' | null, detail: 'Ownership token was not found.' };
let lastValidationInput: Record<string, unknown> | null = null;

const mockedValidatorRunner: ValidatorRunner = async (_command, args, options) => {
  assert.equal(options.timeout, 15_000);
  assert.ok(options.cwd.endsWith('core'));
  if (args[2] === 'validate') {
    const fileIndex = args.indexOf('--file');
    assert.ok(fileIndex >= 0);
    lastValidationInput = JSON.parse(await readFile(args[fileIndex + 1]!, 'utf8')) as Record<string, unknown>;
    return { stdout: JSON.stringify(validationResponse) };
  }
  if (args[2] === 'ownership') return { stdout: JSON.stringify(ownershipResponse) };
  throw new Error(`Unexpected validator command: ${args.join(' ')}`);
};

class Client {
  cookies = new Map<string, string>();

  private capture(response: Response): void {
    for (const entry of response.headers.getSetCookie()) {
      const pair = entry.split(';', 1)[0] ?? '';
      const separator = pair.indexOf('=');
      if (separator < 0) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (entry.includes('Max-Age=0') || entry.includes('Thu, 01 Jan 1970')) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  private header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  async request(path: string, method = 'GET', body?: unknown, options: { omitHeader?: boolean; cookie?: string } = {}): Promise<Response> {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (!options.omitHeader) headers['x-requested-with'] = 'fetch';
    const cookie = options.cookie ?? this.header();
    if (cookie) headers.cookie = cookie;
    const response = await fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    this.capture(response);
    return response;
  }

  async requestForm(path: string, body: FormData): Promise<Response> {
    const headers: Record<string, string> = { 'x-requested-with': 'fetch' };
    const cookie = this.header();
    if (cookie) headers.cookie = cookie;
    const response = await fetch(`${base}${path}`, { method: 'POST', headers, body });
    this.capture(response);
    return response;
  }

  async login(email: string, password: string): Promise<Response> {
    return this.request('/api/auth/login', 'POST', { email, password });
  }
}

function expiredAccessToken(): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const seconds = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: '11111111-1111-4111-8111-111111111111', role: 'requester', sid: 'expired-session', iat: seconds - 3600, exp: seconds - 60, jti: 'expired' });
  const signature = createHmac('sha256', process.env.JWT_SECRET as string).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

function roeForm(targetId: string, extra: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.set('document', new Blob(['%PDF-1.7 test'], { type: 'application/pdf' }), 'workflow.pdf');
  form.set('targetIds', targetId);
  form.set('attestation', 'true');
  form.set('allowed_tools', JSON.stringify(['header_checks']));
  form.set('start_time', new Date(Date.now() - 60 * 1000).toISOString());
  form.set('end_time', new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString());
  for (const [key, value] of Object.entries(extra)) form.set(key, value);
  return form;
}

async function uploadRoe(client: Client, targetId: string) {
  const response = await client.requestForm('/api/roe', roeForm(targetId));
  const body = await response.json() as { roe?: { id: string; status: string; reasons_json: string; file_path: string; lab_mode: boolean } };
  assert.equal(response.status, 201);
  assert.ok(body.roe);
  return body.roe;
}

async function insertWorkflowRoe(ownerId: string, targetId: string, options: {
  status?: string;
  labMode?: boolean;
  startTime?: string;
  endTime?: string;
  scopeToken?: string | null;
} = {}): Promise<string> {
  const target = await db.one<{ url: string }>('SELECT url FROM targets WHERE id = $1', [targetId]);
  assert.ok(target);
  const id = randomUUID();
  const scope = {
    targets: [target.url],
    allowed_tools: ['nmap'],
    start_time: options.startTime ?? new Date(Date.now() - 60 * 1000).toISOString(),
    end_time: options.endTime ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
  await db.run(`INSERT INTO roe_documents
    (id, owner_id, file_name, target_ids_json, scope_json, attestation, status, automated_decision, reasons_json, scope_token, lab_mode, uploaded_at)
    VALUES ($1, $2, 'workflow.pdf', $3, $4, TRUE, $5, 'passed', '[]', $6, $7, NOW())`, [
    id,
    ownerId,
    JSON.stringify([targetId]),
    JSON.stringify(scope),
    options.status ?? 'approved',
    options.scopeToken === undefined ? 'scope-test-token' : options.scopeToken,
    options.labMode ?? false,
  ]);
  return id;
}

async function insertWorkflowPolicy(ownerId: string, roeId: string, targetId: string): Promise<string> {
  const [target, roe] = await Promise.all([
    db.one<{ url: string }>('SELECT url FROM targets WHERE id = $1 AND owner_id = $2', [targetId, ownerId]),
    db.one<{ scope_json: string; lab_mode: boolean }>('SELECT scope_json, lab_mode FROM roe_documents WHERE id = $1 AND owner_id = $2', [roeId, ownerId]),
  ]);
  assert.ok(target && roe);
  const scope = JSON.parse(roe.scope_json) as { start_time: string; end_time: string };
  const parsedTarget = new URL(target.url);
  const policyId = randomUUID();
  const policy = {
    selected_tools: ['nmap'],
    tool_limits: { nmap: { allowed_flags: ['-sV'], max_rate: 10, max_duration: 120, max_requests: 100 } },
    blocked_actions: [
      'shell_execution',
      'credential_bruteforce',
      'denial_of_service',
      'out_of_scope_redirect',
      'raw_command_arguments',
    ],
    time_window: { start: scope.start_time, end: scope.end_time },
    max_intrusion_level: 'low',
    notes: [],
    target: {
      url: target.url,
      host: parsedTarget.hostname,
      port: parsedTarget.port ? Number(parsedTarget.port) : parsedTarget.protocol === 'https:' ? 443 : 80,
      resolved_ips: ['127.0.0.1'],
      lab_mode: roe.lab_mode,
    },
    policy_hash: 'a'.repeat(64),
  };
  await db.run(
    `INSERT INTO scope_policies (id, roe_id, user_id, target_id, version, status, policy_json, policy_hash, created_by, expires_at)
     VALUES ($1, $2, $3, $4, 1, 'active', $5::jsonb, $6, $3, $7)`,
    [policyId, roeId, ownerId, targetId, JSON.stringify(policy), policy.policy_hash, scope.end_time],
  );
  return policyId;
}

async function insertPolicyRoe(ownerId: string, targetId: string, filePath: string): Promise<string> {
  const target = await db.one<{ url: string }>('SELECT url FROM targets WHERE id = $1 AND owner_id = $2', [targetId, ownerId]);
  assert.ok(target);
  const id = randomUUID();
  const startTime = new Date(Date.now() - 60 * 1000).toISOString();
  const endTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  await db.run(`INSERT INTO roe_documents
    (id, owner_id, file_name, target_ids_json, scope_json, attestation, status, automated_decision, reasons_json, scope_token, lab_mode, file_path, uploaded_at)
    VALUES ($1, $2, 'policy.docx', $3, $4, TRUE, 'approved', 'valid', '[]', 'approved-test-token', FALSE, $5, NOW())`, [
    id,
    ownerId,
    JSON.stringify([targetId]),
    JSON.stringify({ targets: [target.url], allowed_tools: ['nmap'], start_time: startTime, end_time: endTime }),
    filePath,
  ]);
  await db.run(
    'INSERT INTO roe_verifications (id, roe_id, target, token, method, expires_at, verified_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [randomUUID(), id, target.url, randomUUID(), 'dns', new Date(Date.now() + 60 * 60 * 1000), new Date()],
  );
  return id;
}

function policyBuildOutput(input: { target: Record<string, unknown>; time_window: Record<string, string> }): string {
  return JSON.stringify({
    selected_tools: ['nmap'],
    tool_limits: { nmap: { allowed_flags: ['-sV'], max_rate: 10, max_duration: 120, max_requests: 100 } },
    blocked_actions: [
      'shell_execution',
      'credential_bruteforce',
      'denial_of_service',
      'out_of_scope_redirect',
      'raw_command_arguments',
    ],
    time_window: input.time_window,
    max_intrusion_level: 'low',
    notes: [],
    target: input.target,
    policy_hash: 'a'.repeat(64),
  });
}

before(async () => {
  const database = await import('../db/index.js');
  const { seed } = await import('../db/seed.js');
  const { default: app } = await import('../app.js');
  db = database;
  for (const table of tables) await db.pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  await db.pool.query('DROP FUNCTION IF EXISTS runs_require_approved_roe() CASCADE');
  await db.migrate();
  await db.transaction((client) => seed(client));
  const server: Server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  stopServer = () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

after(async () => {
  await stopServer();
  await db.pool.end();
});

test('register, login, me and logout flow', async () => {
  const client = new Client();
  const register = await client.request('/api/auth/register', 'POST', { email: 'flow@penflow.test', password: 'FlowTest!2026', displayName: 'Flow User', accountType: 'freelance', acceptedTerms: true });
  assert.equal(register.status, 201);
  const login = await client.login('flow@penflow.test', 'FlowTest!2026');
  assert.equal(login.status, 200);
  assert.ok(client.cookies.has('pf_access'));
  assert.ok(client.cookies.has('pf_refresh'));
  const me = await client.request('/api/auth/me');
  assert.equal(me.status, 200);
  const body = await me.json() as { user: { email: string } };
  assert.equal(body.user.email, 'flow@penflow.test');
  assert.equal((await client.request('/api/auth/logout', 'POST')).status, 204);
  assert.equal((await client.request('/api/auth/me')).status, 401);
});

test('wrong password and unknown email return the same generic error', async () => {
  const client = new Client();
  const wrong = await client.login('requester@penflow.test', 'wrong-password');
  const unknown = await client.login('missing-account@penflow.test', 'wrong-password');
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(await wrong.json(), await unknown.json());
});

test('five failed logins lock the account for 15 minutes', async () => {
  const client = new Client();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await client.login('reviewer@penflow.test', 'wrong-password')).status, 401);
  }
  const locked = await db.one<{ failed_attempts: number; locked_until: Date | null }>('SELECT failed_attempts, locked_until FROM users WHERE email = $1', ['reviewer@penflow.test']);
  assert.equal(locked?.failed_attempts, 5);
  assert.ok(locked?.locked_until && locked.locked_until.getTime() > Date.now());
  await db.run('DELETE FROM rate_events');
  assert.notEqual((await client.login('reviewer@penflow.test', demoPassword)).status, 200);
});

test('an expired access token is rejected', async () => {
  const client = new Client();
  const response = await client.request('/api/auth/me', 'GET', undefined, { cookie: `pf_access=${expiredAccessToken()}` });
  assert.equal(response.status, 401);
});

test('a revoked session is rejected immediately', async () => {
  const client = new Client();
  assert.equal((await client.login('admin@penflow.test', demoPassword)).status, 200);
  assert.equal((await client.request('/api/auth/logout-all', 'POST')).status, 204);
  assert.equal((await client.request('/api/auth/me')).status, 401);
});

test('refresh rotates the token and reusing the old one revokes the family', async () => {
  const client = new Client();
  assert.equal((await client.login('requester@penflow.test', demoPassword)).status, 200);
  const rotatedFrom = client.cookies.get('pf_refresh') as string;
  assert.equal((await client.request('/api/auth/refresh', 'POST')).status, 200);
  const current = client.cookies.get('pf_refresh') as string;
  assert.notEqual(current, rotatedFrom);
  const replay = await client.request('/api/auth/refresh', 'POST', undefined, { cookie: `pf_refresh=${rotatedFrom}` });
  assert.equal(replay.status, 401);
  const familyRevoked = await client.request('/api/auth/refresh', 'POST', undefined, { cookie: `pf_refresh=${current}` });
  assert.equal(familyRevoked.status, 401);
});

test('a protected route requires authentication', async () => {
  const response = await new Client().request('/api/runs');
  assert.equal(response.status, 401);
});

test('a requester is denied an admin route', async () => {
  const client = new Client();
  assert.equal((await client.login('requester@penflow.test', demoPassword)).status, 200);
  assert.equal((await client.request('/api/admin/users')).status, 403);
});

test('scope policies are isolated by ROE and owner and runs require the exact matching policy', async () => {
  const owner = await db.one<{ id: string }>("SELECT id FROM users WHERE email = 'requester@penflow.test'");
  const otherOwner = await db.one<{ id: string }>("SELECT id FROM users WHERE email = 'requester2@penflow.test'");
  const adminUser = await db.one<{ id: string }>("SELECT id FROM users WHERE email = 'admin@penflow.test'");
  const target = await db.one<{ id: string }>(
    "SELECT id FROM targets WHERE owner_id = (SELECT id FROM users WHERE email = 'requester@penflow.test') AND status = 'verified' ORDER BY id LIMIT 1",
  );
  assert.ok(owner && otherOwner && adminUser && target);
  const secondTargetId = randomUUID();
  const uploadPath = join(process.cwd(), 'data', 'roe-uploads');
  await mkdir(uploadPath, { recursive: true });
  const filePath = join(uploadPath, `${randomUUID()}.docx`);
  await writeFile(filePath, 'mock approved ROE');
  const roeA = await insertPolicyRoe(owner.id, target.id, filePath);
  const roeB = await insertPolicyRoe(owner.id, target.id, filePath);
  const secondTargetUrl = 'http://localhost:3001';
  await db.run(
    'INSERT INTO targets (id, owner_id, url, label, verification_method, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())',
    [secondTargetId, owner.id, secondTargetUrl, 'Second test target', 'DNS TXT', 'verified'],
  );
  const roeAScope = await db.one<{ scope_json: string }>('SELECT scope_json FROM roe_documents WHERE id = $1 AND owner_id = $2', [roeA, owner.id]);
  assert.ok(roeAScope);
  const scope = JSON.parse(roeAScope.scope_json) as { targets: string[]; allowed_tools: string[]; start_time: string; end_time: string };
  await db.run('UPDATE roe_documents SET target_ids_json = $1, scope_json = $2 WHERE id = $3 AND owner_id = $4', [
    JSON.stringify([target.id, secondTargetId]),
    JSON.stringify({ ...scope, targets: [...scope.targets, secondTargetUrl] }),
    roeA,
    owner.id,
  ]);
  await db.run(
    'INSERT INTO roe_verifications (id, roe_id, target, token, method, expires_at, verified_at) VALUES ($1, $2, $3, $4, $5, $6, $7)',
    [randomUUID(), roeA, secondTargetUrl, randomUUID(), 'dns', new Date(Date.now() + 60 * 60 * 1000), new Date()],
  );
  const restorePolicyRunner = setPolicyBuilderRunner(async (inputPath) => {
    const input = JSON.parse(await readFile(inputPath, 'utf8')) as {
      target: Record<string, unknown>;
      time_window: Record<string, string>;
    };
    return policyBuildOutput(input);
  });
  const requester = new Client();
  const otherRequester = new Client();
  const admin = new Client();
  let createdPolicyId = '';
  try {
    assert.equal((await requester.login('requester@penflow.test', demoPassword)).status, 200);
    const create = await requester.request(`/api/roe/${roeA}/policy`, 'POST', { targetId: target.id });
    assert.equal(create.status, 201);
    const created = await create.json() as { policyId: string; policy: { target: { host: string } } };
    createdPolicyId = created.policyId;
    assert.ok(createdPolicyId);
    assert.equal(created.policy.target.host, 'localhost');
    assert.equal((await requester.request(`/api/roe/${roeA}/policy?policyId=${createdPolicyId}`)).status, 200);
    assert.equal((await requester.request(`/api/roe/${roeB}/policy?policyId=${createdPolicyId}`)).status, 404);
    assert.equal((await requester.request(`/api/runs`, 'POST', { roeId: roeA, targetId: target.id })).status, 409);

    const start = await requester.request('/api/runs', 'POST', { roeId: roeA, targetId: target.id, policyId: createdPolicyId });
    assert.equal(start.status, 201, await start.clone().text());
    const runBody = await start.json() as { run: { policy_id: string; target_id: string } };
    assert.equal(runBody.run.policy_id, createdPolicyId);
    assert.equal(runBody.run.target_id, target.id);
    assert.equal((await requester.request('/api/runs', 'POST', { roeId: roeA, targetId: secondTargetId, policyId: createdPolicyId })).status, 409);
    assert.equal((await requester.request('/api/runs', 'POST', { roeId: roeB, targetId: target.id, policyId: createdPolicyId })).status, 404);
    await db.run("UPDATE scope_policies SET status = 'revoked' WHERE id = $1 AND roe_id = $2 AND user_id = $3", [createdPolicyId, roeA, owner.id]);
    assert.equal((await requester.request('/api/runs', 'POST', { roeId: roeA, targetId: target.id, policyId: createdPolicyId })).status, 409);
    await db.run("UPDATE scope_policies SET status = 'active', expires_at = NOW() - INTERVAL '1 second' WHERE id = $1 AND roe_id = $2 AND user_id = $3", [createdPolicyId, roeA, owner.id]);
    assert.equal((await requester.request('/api/runs', 'POST', { roeId: roeA, targetId: target.id, policyId: createdPolicyId })).status, 409);

    assert.equal((await otherRequester.login('requester2@penflow.test', demoPassword)).status, 200);
    assert.equal((await otherRequester.request(`/api/roe/${roeA}/policy?policyId=${createdPolicyId}`)).status, 404);
    assert.equal((await otherRequester.request(`/api/roe/${roeA}/policy`, 'POST', { targetId: target.id })).status, 404);
    assert.equal((await requester.request('/api/admin/tools/nmap', 'PUT', { enabled: false })).status, 403);

    assert.equal((await admin.login('admin@penflow.test', demoPassword)).status, 200);
    assert.equal((await admin.request('/api/admin/tools/nmap', 'PUT', { enabled: false })).status, 200);
    assert.equal((await admin.request('/api/admin/scope-policies')).status, 200);
    assert.equal((await admin.request(`/api/roe/${roeA}/policy?policyId=${createdPolicyId}`)).status, 200);
  } finally {
    restorePolicyRunner();
    await db.run('UPDATE scope_tool_settings SET enabled = TRUE, updated_by = $1 WHERE tool = $2', [adminUser.id, 'nmap']);
    await db.run('DELETE FROM runs WHERE roe_id = ANY($1::uuid[])', [[roeA, roeB]]);
    await db.run('DELETE FROM roe_documents WHERE id = ANY($1::uuid[])', [[roeA, roeB]]);
    await db.run('DELETE FROM targets WHERE id = $1 AND owner_id = $2', [secondTargetId, owner.id]);
    await rm(filePath, { force: true });
  }
});

test('another user\'s run returns 404 instead of 403', async () => {
  const client = new Client();
  assert.equal((await client.login('requester2@penflow.test', demoPassword)).status, 200);
  const run = await db.one<{ id: string }>('SELECT r.id FROM runs r JOIN users u ON u.id = r.owner_id WHERE u.email = $1 ORDER BY r.started_at', ['requester@penflow.test']);
  assert.ok(run);
  assert.equal((await client.request(`/api/runs/${run.id}`)).status, 404);
});

test('invalid validator results reject the ROE and ignore requester lab_mode fields', async () => {
  const previousValidation = validationResponse;
  const restoreRunner = setValidatorRunner(mockedValidatorRunner);
  validationResponse = { status: 'invalid', reasons: ['Authorization window is expired.'], targets: [] };
  const client = new Client();
  let roeId = '';
  let filePath = '';
  try {
    assert.equal((await client.login('requester@penflow.test', demoPassword)).status, 200);
    const target = await db.one<{ id: string }>("SELECT id FROM targets WHERE owner_id = (SELECT id FROM users WHERE email = 'requester@penflow.test') AND status = 'verified' ORDER BY id LIMIT 1");
    assert.ok(target);
    const form = roeForm(target.id, { lab_mode: 'true', owner_name: 'Untrusted Name', owner_contact: 'untrusted@example.test' });
    const response = await client.requestForm('/api/roe', form);
    assert.equal(response.status, 201);
    const body = await response.json() as { roe: { id: string; status: string; reasons_json: string; file_path: string; lab_mode: boolean } };
    roeId = body.roe.id;
    filePath = body.roe.file_path;
    assert.equal(body.roe.status, 'rejected');
    assert.deepEqual(JSON.parse(body.roe.reasons_json), ['Authorization window is expired.']);
    assert.equal(body.roe.lab_mode, false);
    assert.equal(lastValidationInput?.owner_name, 'Ayesha Khan');
    assert.equal(lastValidationInput?.owner_contact, 'requester@penflow.test');
    assert.equal(Object.prototype.hasOwnProperty.call(lastValidationInput, 'lab_mode'), false);
  } finally {
    validationResponse = previousValidation;
    restoreRunner();
    if (roeId) await db.run('DELETE FROM roe_documents WHERE id = $1', [roeId]);
    if (filePath) await rm(filePath, { force: true });
  }
});

test('wrong and expired ownership tokens do not verify a ROE', async () => {
  const previousValidation = validationResponse;
  const previousOwnership = ownershipResponse;
  const restoreRunner = setValidatorRunner(mockedValidatorRunner);
  validationResponse = { status: 'valid', reasons: [], targets: [] };
  ownershipResponse = { verified: false, method: null, detail: 'Ownership token was not found.' };
  const client = new Client();
  let roeId = '';
  let filePath = '';
  try {
    assert.equal((await client.login('requester@penflow.test', demoPassword)).status, 200);
    const target = await db.one<{ id: string }>("SELECT id FROM targets WHERE owner_id = (SELECT id FROM users WHERE email = 'requester@penflow.test') AND status = 'verified' ORDER BY id LIMIT 1");
    assert.ok(target);
    const roe = await uploadRoe(client, target.id);
    roeId = roe.id;
    filePath = roe.file_path;
    assert.equal(roe.status, 'ownership_pending');
    const issued = await client.request(`/api/roe/${roeId}/verification`, 'POST', {});
    assert.equal(issued.status, 201);
    assert.equal((await client.request(`/api/roe/${roeId}/verify`, 'POST', {})).status, 409);
    assert.equal((await db.one<{ status: string }>('SELECT status FROM roe_documents WHERE id = $1', [roeId]))?.status, 'ownership_pending');
    await db.run('UPDATE roe_verifications SET expires_at = NOW() - INTERVAL \'1 second\' WHERE roe_id = $1', [roeId]);
    assert.equal((await client.request(`/api/roe/${roeId}/verify`, 'POST', {})).status, 409);
    assert.equal((await db.one<{ verified_at: Date | null }>('SELECT verified_at FROM roe_verifications WHERE roe_id = $1', [roeId]))?.verified_at, null);
  } finally {
    validationResponse = previousValidation;
    ownershipResponse = previousOwnership;
    restoreRunner();
    if (roeId) await db.run('DELETE FROM roe_documents WHERE id = $1', [roeId]);
    if (filePath) await rm(filePath, { force: true });
  }
});

test('all successful target proofs move a ROE into the review queue', async () => {
  const previousValidation = validationResponse;
  const previousOwnership = ownershipResponse;
  const restoreRunner = setValidatorRunner(mockedValidatorRunner);
  validationResponse = { status: 'valid', reasons: [], targets: [] };
  ownershipResponse = { verified: true, method: 'dns', detail: 'Ownership token matched.' };
  const client = new Client();
  let roeId = '';
  let filePath = '';
  try {
    assert.equal((await client.login('requester@penflow.test', demoPassword)).status, 200);
    const target = await db.one<{ id: string }>("SELECT id FROM targets WHERE owner_id = (SELECT id FROM users WHERE email = 'requester@penflow.test') AND status = 'verified' ORDER BY id LIMIT 1");
    assert.ok(target);
    const roe = await uploadRoe(client, target.id);
    roeId = roe.id;
    filePath = roe.file_path;
    assert.equal((await client.request(`/api/roe/${roeId}/verification`, 'POST', {})).status, 201);
    const verified = await client.request(`/api/roe/${roeId}/verify`, 'POST', {});
    assert.equal(verified.status, 200);
    assert.equal((await db.one<{ status: string }>('SELECT status FROM roe_documents WHERE id = $1', [roeId]))?.status, 'review_pending');
    assert.equal((await db.one<{ method: string; verified_at: Date | null }>('SELECT method, verified_at FROM roe_verifications WHERE roe_id = $1', [roeId]))?.method, 'dns');
    assert.ok((await db.one<{ verified_at: Date | null }>('SELECT verified_at FROM roe_verifications WHERE roe_id = $1', [roeId]))?.verified_at);
  } finally {
    validationResponse = previousValidation;
    ownershipResponse = previousOwnership;
    restoreRunner();
    if (roeId) await db.run('DELETE FROM roe_documents WHERE id = $1', [roeId]);
    if (filePath) await rm(filePath, { force: true });
  }
});

test('another requester gets 404 for an owned ROE and its verification routes', async () => {
  const previousValidation = validationResponse;
  const restoreRunner = setValidatorRunner(mockedValidatorRunner);
  validationResponse = { status: 'valid', reasons: [], targets: [] };
  const owner = new Client();
  const other = new Client();
  let roeId = '';
  let filePath = '';
  try {
    assert.equal((await owner.login('requester@penflow.test', demoPassword)).status, 200);
    assert.equal((await other.login('requester2@penflow.test', demoPassword)).status, 200);
    const target = await db.one<{ id: string }>("SELECT id FROM targets WHERE owner_id = (SELECT id FROM users WHERE email = 'requester@penflow.test') AND status = 'verified' ORDER BY id LIMIT 1");
    assert.ok(target);
    const roe = await uploadRoe(owner, target.id);
    roeId = roe.id;
    filePath = roe.file_path;
    assert.equal((await other.request(`/api/roe/${roeId}`)).status, 404);
    assert.equal((await other.request(`/api/roe/${roeId}/verification`, 'POST', {})).status, 404);
    assert.equal((await other.request(`/api/roe/${roeId}/verify`, 'POST', {})).status, 404);
  } finally {
    validationResponse = previousValidation;
    restoreRunner();
    if (roeId) await db.run('DELETE FROM roe_documents WHERE id = $1', [roeId]);
    if (filePath) await rm(filePath, { force: true });
  }
});

test('requesters cannot approve and reviewers cannot decide their own ROE', async () => {
  const requester = new Client();
  assert.equal((await requester.login('requester@penflow.test', demoPassword)).status, 200);
  const reviewRoe = await db.one<{ id: string }>("SELECT id FROM roe_documents WHERE status = 'review_pending' ORDER BY uploaded_at LIMIT 1");
  assert.ok(reviewRoe);
  assert.equal((await requester.request(`/api/review/${reviewRoe.id}`, 'POST', { decision: 'approve', reason: 'Approved.' })).status, 403);

  await db.run("UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE email = 'reviewer@penflow.test'");
  const reviewer = new Client();
  assert.equal((await reviewer.login('reviewer@penflow.test', demoPassword)).status, 200);
  const reviewerUser = await db.one<{ id: string }>("SELECT id FROM users WHERE email = 'reviewer@penflow.test'");
  assert.ok(reviewerUser);
  const roeId = randomUUID();
  await db.run(`INSERT INTO roe_documents
    (id, owner_id, file_name, target_ids_json, scope_json, attestation, status, automated_decision, reasons_json, uploaded_at)
    VALUES ($1, $2, 'reviewer-owned.pdf', '[]', '[]', TRUE, 'review_pending', 'passed', '[]', NOW())`, [roeId, reviewerUser.id]);
  try {
    assert.equal((await reviewer.request(`/api/review/${roeId}`, 'POST', { decision: 'approve', reason: 'Approved.' })).status, 403);
  } finally {
    await db.run('DELETE FROM roe_documents WHERE id = $1', [roeId]);
  }
});

test('run creation requires approval, verified targets and an active scope window', async () => {
  const client = new Client();
  assert.equal((await client.login('requester@penflow.test', demoPassword)).status, 200);
  const owner = await db.one<{ id: string }>("SELECT id FROM users WHERE email = 'requester@penflow.test'");
  const targets = await db.query<{ id: string; url: string }>("SELECT id, url FROM targets WHERE owner_id = $1 AND status = 'verified' ORDER BY url", [owner?.id]);
  assert.ok(owner);
  assert.ok(targets.length >= 2);
  const [target, outsideTarget] = targets;
  assert.ok(target && outsideTarget);
  const createdRoes: string[] = [];
  const createdRuns: string[] = [];
  try {
    const pendingRoe = await insertWorkflowRoe(owner.id, target.id, { status: 'ownership_pending' });
    createdRoes.push(pendingRoe);
    assert.equal((await client.request('/api/runs', 'POST', { roeId: pendingRoe, targetId: target.id })).status, 409);

    const unverifiedRoe = await insertWorkflowRoe(owner.id, target.id);
    createdRoes.push(unverifiedRoe);
    const unverifiedPolicy = await insertWorkflowPolicy(owner.id, unverifiedRoe, target.id);
    assert.equal((await client.request('/api/runs', 'POST', {
      roeId: unverifiedRoe, targetId: target.id, policyId: unverifiedPolicy,
    })).status, 409);
    assert.equal((await client.request('/api/runs', 'POST', {
      roeId: unverifiedRoe, targetId: outsideTarget.id, policyId: unverifiedPolicy,
    })).status, 404);

    await db.run(`INSERT INTO roe_verifications (id, roe_id, target, token, method, expires_at, verified_at)
      VALUES ($1, $2, $3, 'verified-token', 'dns', NOW() + INTERVAL '1 day', NOW())`, [randomUUID(), unverifiedRoe, target.url]);
    const allowed = await client.request('/api/runs', 'POST', {
      roeId: unverifiedRoe, targetId: target.id, policyId: unverifiedPolicy,
    });
    assert.equal(allowed.status, 201);
    const allowedBody = await allowed.json() as { run: { id: string } };
    createdRuns.push(allowedBody.run.id);

    const labRoe = await insertWorkflowRoe(owner.id, target.id, { labMode: true });
    createdRoes.push(labRoe);
    const labPolicy = await insertWorkflowPolicy(owner.id, labRoe, target.id);
    const labRun = await client.request('/api/runs', 'POST', {
      roeId: labRoe, targetId: target.id, policyId: labPolicy,
    });
    assert.equal(labRun.status, 201);
    createdRuns.push((await labRun.json() as { run: { id: string } }).run.id);

    const expiredRoe = await insertWorkflowRoe(owner.id, target.id, {
      startTime: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      endTime: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    });
    createdRoes.push(expiredRoe);
    const expiredPolicy = await insertWorkflowPolicy(owner.id, expiredRoe, target.id);
    assert.equal((await client.request('/api/runs', 'POST', {
      roeId: expiredRoe, targetId: target.id, policyId: expiredPolicy,
    })).status, 409);
    assert.equal((await db.one<{ status: string }>('SELECT status FROM roe_documents WHERE id = $1', [expiredRoe]))?.status, 'expired');
  } finally {
    if (createdRuns.length) await db.run('DELETE FROM runs WHERE id = ANY($1::uuid[])', [createdRuns]);
    if (createdRoes.length) await db.run('DELETE FROM roe_documents WHERE id = ANY($1::uuid[])', [createdRoes]);
  }
});

test('admins can set lab mode but requesters cannot', async () => {
  const owner = await db.one<{ id: string }>("SELECT id FROM users WHERE email = 'requester@penflow.test'");
  const target = await db.one<{ id: string }>("SELECT id FROM targets WHERE owner_id = $1 AND status = 'verified' ORDER BY id LIMIT 1", [owner?.id]);
  assert.ok(owner);
  assert.ok(target);
  const roeId = await insertWorkflowRoe(owner.id, target.id, { status: 'ownership_pending' });
  try {
    const requester = new Client();
    assert.equal((await requester.login('requester@penflow.test', demoPassword)).status, 200);
    assert.equal((await requester.request(`/api/admin/roe/${roeId}/lab-mode`, 'POST', { lab_mode: true })).status, 403);

    const admin = new Client();
    assert.equal((await admin.login('admin@penflow.test', demoPassword)).status, 200);
    const changed = await admin.request(`/api/admin/roe/${roeId}/lab-mode`, 'POST', { lab_mode: true });
    assert.equal(changed.status, 200);
    const updated = await db.one<{ lab_mode: boolean; status: string }>('SELECT lab_mode, status FROM roe_documents WHERE id = $1', [roeId]);
    assert.equal(updated?.lab_mode, true);
    assert.equal(updated?.status, 'review_pending');
    assert.equal((await admin.request(`/api/admin/roe/${roeId}/revoke`, 'POST', { reason: 'Test revocation.' })).status, 200);
    assert.equal((await db.one<{ status: string }>('SELECT status FROM roe_documents WHERE id = $1', [roeId]))?.status, 'revoked');
  } finally {
    await db.run('DELETE FROM roe_documents WHERE id = $1', [roeId]);
  }
});

test('engine reports are ingested for their run owner only', async () => {
  const userA = randomUUID();
  const userB = randomUUID();
  const roeId = randomUUID();
  const runId = randomUUID();
  const reportsDir = await mkdtemp(join(tmpdir(), 'penflow-report-ingest-'));
  const reportFolderName = '20261128T025000Z';
  const reportFolder = join(reportsDir, reportFolderName);
  const previousReportsDir = process.env.PENFLOW_REPORTS_DIR;
  const reportJson = {
    schema_version: '1.0',
    run_id: reportFolderName,
    generated_at: '2026-11-28T02:50:00Z',
    target: 'http://127.0.0.1:3000',
    owner: { user_id: 'untrusted-user', roe_id: 'untrusted-roe' },
    findings: [{
      id: 'abc123def456',
      name: 'Missing security header',
      tool: 'header_checks',
      url: 'http://127.0.0.1:3000',
      severity: 'Medium',
      severity_key: 'medium',
      evidence: 'The header was absent.',
      summary: 'The response is missing a browser security header.',
      technical_note: 'Configure the response header.',
      risk_score: null,
      cve: [],
      kev: null,
    }],
  };

  try {
    process.env.PENFLOW_REPORTS_DIR = reportsDir;
    await mkdir(reportFolder);
    await writeFile(join(reportFolder, 'report.json'), JSON.stringify(reportJson));
    await writeFile(join(reportFolder, 'report.md'), '# Test report\n');

    const passwordHash = bcrypt.hashSync(demoPassword, 4);
    const insertUser = `INSERT INTO users
      (id, email, password_hash, display_name, account_type, role, email_verified, plan_id, created_at, email_verified_at)
      VALUES ($1, $2, $3, $4, 'test', 'requester', TRUE, 'free', NOW(), NOW())`;
    await db.run(insertUser, [userA, `${userA}@penflow.test`, passwordHash, 'Report Owner A']);
    await db.run(insertUser, [userB, `${userB}@penflow.test`, passwordHash, 'Report Owner B']);
    await db.run(`INSERT INTO roe_documents
      (id, owner_id, file_name, target_ids_json, scope_json, attestation, status, automated_decision, reasons_json, uploaded_at)
      VALUES ($1, $2, 'test.pdf', '[]', '[]', TRUE, 'approved', 'passed', '[]', NOW())`, [roeId, userA]);
    await db.run(`INSERT INTO runs
      (id, owner_id, roe_id, status, stage, started_at, scope_json)
      VALUES ($1, $2, $3, 'complete', 'verify', NOW(), '[]')`, [runId, userA, roeId]);

    const { ingestReport } = await import('../reporting/ingest-report.js');
    await assert.rejects(() => ingestReport('not-a-uuid', reportFolderName), /runId must be a UUID/);
    await assert.rejects(() => ingestReport(runId, '../outside'), /reportFolderName contains invalid characters/);
    const ingested = await ingestReport(runId, reportFolderName);
    const repeatedIngestion = await ingestReport(runId, reportFolderName);
    assert.equal(repeatedIngestion.id, ingested.id);
    const stored = await db.one<{ owner_id: string; report_json: typeof reportJson }>(
      'SELECT owner_id, report_json FROM reports WHERE id = $1',
      [ingested.id],
    );
    assert.equal(stored?.owner_id, userA);
    assert.equal(stored?.report_json.owner.user_id, userA);
    assert.equal(stored?.report_json.owner.roe_id, roeId);
    assert.equal(await db.one<{ count: number }>('SELECT COUNT(*)::int AS count FROM findings WHERE run_id = $1', [runId]).then((row) => row?.count), 1);
    assert.equal(await db.one<{ risk_score: number | null }>('SELECT risk_score FROM findings WHERE run_id = $1', [runId]).then((row) => row?.risk_score), null);

    const clientA = new Client();
    const clientB = new Client();
    assert.equal((await clientA.login(`${userA}@penflow.test`, demoPassword)).status, 200);
    assert.equal((await clientB.login(`${userB}@penflow.test`, demoPassword)).status, 200);

    const ownerReport = await clientA.request(`/api/reports/${ingested.id}`);
    assert.equal(ownerReport.status, 200);
    assert.equal((await ownerReport.json() as { report: { report_json: typeof reportJson } }).report.report_json.run_id, reportFolderName);
    assert.equal((await clientB.request(`/api/reports/${ingested.id}`)).status, 404);
    assert.equal((await clientB.request(`/api/runs/${runId}`)).status, 404);
    assert.equal((await clientB.request(`/api/runs/${runId}/findings`)).status, 404);

    const ownerReports = await clientA.request('/api/reports');
    const otherReports = await clientB.request('/api/reports');
    const ownerReportList = await ownerReports.json() as { reports: Array<{ id: string; generated_at: string }> };
    assert.ok(ownerReportList.reports.some((report) => report.id === ingested.id && report.generated_at === new Date(reportJson.generated_at).toISOString()));
    assert.ok(!(await otherReports.json() as { reports: Array<{ id: string }> }).reports.some((report) => report.id === ingested.id));
    const dashboard = await clientA.request('/api/dashboard');
    assert.equal(dashboard.status, 200);
    assert.ok((await dashboard.json() as { reports: Array<{ id: string }> }).reports.some((report) => report.id === ingested.id));
  } finally {
    if (previousReportsDir === undefined) delete process.env.PENFLOW_REPORTS_DIR;
    else process.env.PENFLOW_REPORTS_DIR = previousReportsDir;
    await db.run('DELETE FROM users WHERE id = ANY($1::uuid[])', [[userA, userB]]);
    await rm(reportsDir, { recursive: true, force: true });
  }
});

test('a password longer than 72 bytes is rejected', async () => {
  const response = await new Client().request('/api/auth/register', 'POST', {
    email: 'long-password@penflow.test',
    password: 'a'.repeat(73),
    displayName: 'Long Password',
    accountType: 'freelance',
    acceptedTerms: true,
  });
  assert.equal(response.status, 400);
});
