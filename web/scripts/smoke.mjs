const base = process.env.API_URL ?? 'http://127.0.0.1:4000';
const demoPassword = process.env.DEMO_PASSWORD;
if (!demoPassword) throw new Error('Set DEMO_PASSWORD using the value documented in web/README.md.');

class ApiClient {
  cookies = new Map();
  csrfToken = null;

  cookieHeader() {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }

  capture(response) {
    for (const entry of response.headers.getSetCookie()) {
      const pair = entry.split(';', 1)[0];
      const separator = pair.indexOf('=');
      if (separator < 0) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (entry.includes('Max-Age=0')) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async raw(path, options = {}) {
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { ...(options.headers ?? {}), ...(this.cookieHeader() ? { cookie: this.cookieHeader() } : {}) },
    });
    this.capture(response);
    return response;
  }

  async csrf() {
    const response = await this.raw('/api/csrf');
    const body = await response.json();
    this.csrfToken = body.csrfToken;
  }

  async request(path, method = 'GET', body, options = {}) {
    if (method !== 'GET' && !options.omitCsrf && !this.csrfToken) await this.csrf();
    const headers = { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(options.omitCsrf ? {} : this.csrfToken ? { 'x-csrf-token': this.csrfToken } : {}) };
    return this.raw(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  }

  async login(email, password) {
    return this.request('/api/auth/login', 'POST', { email, password });
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
  process.stdout.write(`PASS ${message}\n`);
}

const anonymous = new ApiClient();
const anonymousRuns = await anonymous.request('/api/runs');
assert(anonymousRuns.status === 401, 'GET /api/runs unauthenticated returns 401');

const requester = new ApiClient();
const login = await requester.login('requester@penflow.test', demoPassword);
assert(login.status === 200 && requester.cookies.has('pf_session'), 'requester login returns 200 and sets pf_session');
const ownRunsResponse = await requester.request('/api/runs');
const ownRuns = await ownRunsResponse.json();
assert(ownRunsResponse.status === 200 && ownRuns.runs.length === 2 && ownRuns.runs.every((run) => run.owner_id === 'usr_ayesha'), 'requester only sees their own runs');
const requesterAdmin = await requester.request('/api/admin/users');
assert(requesterAdmin.status === 403, 'requester is denied admin users with 403');
const requesterReview = await requester.request('/api/review');
assert(requesterReview.status === 403, 'requester is denied the reviewer queue with 403');
const missingCsrf = await requester.request('/api/roe', 'POST', {}, { omitCsrf: true });
assert(missingCsrf.status === 403, 'POST /api/roe without x-csrf-token returns 403');
const blockedAuditResponse = await requester.request('/api/audit?blocked=true');
const blockedAudit = await blockedAuditResponse.json();
assert(blockedAudit.events.length === 1 && blockedAudit.events[0].target === 'http://example.com/admin' && blockedAudit.events[0].detail === 'Target is not in the approved scope. Request not sent.', 'exactly one blocked scope-guard event is present');

const secondRequester = new ApiClient();
const secondLogin = await secondRequester.login('requester2@penflow.test', demoPassword);
assert(secondLogin.status === 200, 'second requester login returns 200');
const crossTenant = await secondRequester.request('/api/runs/run_02');
assert(crossTenant.status === 404, 'requester2 cannot read requester run_02 and receives 404');

const admin = new ApiClient();
const adminLogin = await admin.login('admin@penflow.test', demoPassword);
const adminUsers = await admin.request('/api/admin/users');
const adminData = await adminUsers.json();
assert(adminLogin.status === 200 && adminUsers.status === 200 && adminData.waitlist.length === 4, 'admin login succeeds and admin users view includes all four waitlist entries');

const reviewer = new ApiClient();
const reviewerLogin = await reviewer.login('reviewer@penflow.test', demoPassword);
const reviewQueue = await reviewer.request('/api/review');
const reviewData = await reviewQueue.json();
assert(reviewerLogin.status === 200 && reviewQueue.status === 200 && reviewData.queue.length === 1, 'reviewer can read the seeded ROE review queue');

const brute = new ApiClient();
const attempts = [];
const bruteEmail = `brute-force-${Date.now()}@penflow.test`;
for (let index = 0; index < 6; index += 1) attempts.push((await brute.login(bruteEmail, 'incorrect-password')).status);
assert(attempts.slice(0, 5).every((status) => status === 401) && attempts[5] === 429, 'six rapid failed logins are rate limited with 429');

process.stdout.write('All API smoke checks passed.\n');
