import { readFileSync } from 'node:fs';
try { process.loadEnvFile('.env'); } catch {}
const BASE = process.env.API_URL ?? 'http://127.0.0.1:4000';
const o = JSON.parse(readFileSync('scripts/scope_test_results.json', 'utf8'))[process.argv[2] ?? 'ROE-02_Different_UserA.docx'];

const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch' },
  body: JSON.stringify({ email: process.env.EMAIL_SUNNAN, password: process.env.PW_SUNNAN }),
});
const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
const r = await fetch(BASE + '/api/runs', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-requested-with': 'fetch', cookie },
  body: JSON.stringify({ roeId: o.roeId, targetId: o.targetId, policyId: o.policyId }),
});
const body = await r.json();
console.log(r.status, body);
console.log(`python main.py --run-id ${body.id ?? body.run?.id} --target ${o.targetId ? 'http://127.0.0.1:3001' : ''} --no-ai`);