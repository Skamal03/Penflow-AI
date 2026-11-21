import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { Server } from 'node:http';
import { after, before, test } from 'node:test';

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) throw new Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database before running the auth tests.');
process.env.DATABASE_URL = connectionString;
process.env.JWT_SECRET = 'test-only-jwt-secret-at-least-32-bytes-long';
process.env.CORS_ORIGINS = 'http://127.0.0.1:5173,http://localhost:5173';
process.env.COOKIE_SECURE = 'false';
process.env.APP_BASE_URL = 'http://127.0.0.1:5173';

type Database = typeof import('../db/index.js');

const tables = ['schema_migrations', 'users', 'sessions', 'login_attempts', 'targets', 'roe_documents', 'runs', 'findings', 'reports', 'audit_events', 'waitlist', 'plan_change_requests', 'email_tokens', 'rate_events'];
const demoPassword = 'Penflow!2026';

let base = '';
let db: Database;
let stopServer: () => Promise<void>;

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

test('another user\'s run returns 404 instead of 403', async () => {
  const client = new Client();
  assert.equal((await client.login('requester2@penflow.test', demoPassword)).status, 200);
  const run = await db.one<{ id: string }>('SELECT r.id FROM runs r JOIN users u ON u.id = r.owner_id WHERE u.email = $1 ORDER BY r.started_at', ['requester@penflow.test']);
  assert.ok(run);
  assert.equal((await client.request(`/api/runs/${run.id}`)).status, 404);
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
