import { readFileSync } from 'node:fs';
try { process.loadEnvFile('.env'); } catch {}
const BASE = process.env.API_URL ?? 'http://127.0.0.1:4000';
const res = JSON.parse(readFileSync('scripts/scope_test_results.json', 'utf8'));
const o = res['ROE-02_Different_UserA.docx'];

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
  body: JSON.stringify({ email: process.env.EMAIL_SUNNAN, password: process.env.PW_SUNNAN }),
});
const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const r = await fetch(`${BASE}/api/roe/${o.roeId}/policy?policyId=${o.policyId}`, { headers: { cookie, 'x-requested-with': 'fetch' } });
console.log(JSON.stringify(await r.json(), null, 2));