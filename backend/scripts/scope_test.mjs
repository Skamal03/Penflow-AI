// PenflowAI Scope Guard end-to-end test (API only, no GUI).
// Run from the backend folder:  node scripts/scope_test.mjs
// Needs env vars: EMAIL_SUNNAN PW_SUNNAN EMAIL_SCRUGGS PW_SCRUGGS EMAIL_ADMIN PW_ADMIN
// Backend must be running (npm run dev). Uses DATABASE_URL from backend/.env.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';
try { process.loadEnvFile('.env'); } catch {}

const BASE = process.env.API_URL ?? 'http://127.0.0.1:4000';
const FIX = resolve(process.env.FIXTURES ?? '../core/tests/fixtures/roes');
const need = (k) => { if (!process.env[k]) throw new Error(`Set ${k} first`); return process.env[k]; };
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const START = new Date(Date.now() - 3600_000).toISOString();
const END = new Date(Date.now() + 25 * 86400_000).toISOString(); // validator: window must not exceed 30 days

class Api {
  cookies = new Map();
  header() { return [...this.cookies].map(([n, v]) => `${n}=${v}`).join('; '); }
  capture(r) {
    for (const e of r.headers.getSetCookie()) {
      const pair = e.split(';', 1)[0]; const i = pair.indexOf('='); if (i < 0) continue;
      if (e.includes('Max-Age=0')) this.cookies.delete(pair.slice(0, i)); else this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
  }
  async raw(path, opt = {}) {
    const r = await fetch(BASE + path, { ...opt, headers: { 'x-requested-with': 'fetch', ...(opt.headers ?? {}), ...(this.header() ? { cookie: this.header() } : {}) } });
    this.capture(r);
    return { status: r.status, body: await r.json().catch(() => null) };
  }
  call(path, method = 'GET', body) {
    return this.raw('/api' + path, { method, headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  }
}
const dig = (o, keys) => { for (const k of keys) { const v = k.split('.').reduce((a, p) => a?.[p], o); if (v !== undefined) return v; } };
const findKey = (o, key) => { if (!o || typeof o !== 'object') return undefined; if (key in o) return o[key]; for (const v of Object.values(o)) { const f = findKey(v, key); if (f !== undefined) return f; } };
const norm = (list) => [...new Set((list ?? []).map((t) => (/nmap/i.test(t) ? 'nmap' : /zap/i.test(t) ? 'zap' : t)))].sort().join(',');
const checks = [];
const check = (name, ok, extra = '') => { checks.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  -> ' + extra : ''}`); };

// ---------- login ----------
const sunnan = new Api(), scruggs = new Api(), admin = new Api();
for (const [c, tag] of [[sunnan, 'SUNNAN'], [scruggs, 'SCRUGGS'], [admin, 'ADMIN']]) {
  const r = await c.call('/auth/login', 'POST', { email: need('EMAIL_' + tag), password: need('PW_' + tag) });
  check(`login ${tag}`, r.status === 200, r.status === 200 ? '' : JSON.stringify(r.body));
  if (r.status !== 200) process.exit(1);
}

// ---------- tools (admin) ----------
const toolList = (await admin.call('/admin/tools')).body?.tools ?? [];
console.log('Engine tools:', toolList.map((t) => t.name).join(', '));
const TOOLS = toolList.map((t) => t.name).filter((n) => /nmap|zap/i.test(n));
for (const t of TOOLS) {
  const r = await admin.call('/admin/tools/' + t, 'PUT', { enabled: true });
  check(`admin enables tool ${t}`, r.status === 200);
}

// ---------- targets ----------
const targetUrls = { 3000: 'http://127.0.0.1:3000', 3001: 'http://127.0.0.1:3001', 3002: 'http://127.0.0.1:3002' };
async function ensureTarget(c, url, label) {
  const l = (await c.call('/targets')).body; const arr = Array.isArray(l) ? l : l?.targets ?? [];
  const found = arr.find((t) => t.url === url); if (found) return found.id;
  const r = await c.call('/targets', 'POST', { url, label });
  if (r.status >= 300) { console.log('target create failed', r.status, JSON.stringify(r.body)); return undefined; }
  return dig(r.body, ['id', 'target.id']);
}
const T = {
  3000: await ensureTarget(sunnan, targetUrls[3000], 'Juice 3000'),
  3001: await ensureTarget(sunnan, targetUrls[3001], 'Juice 3001'),
  3002: await ensureTarget(scruggs, targetUrls[3002], 'Juice 3002'),
};
check('targets created', Object.values(T).every(Boolean), JSON.stringify(T));

// Lab targets cannot pass DNS TXT proof, so mark them verified in the DB (lab/test only).
if (!process.env.DATABASE_URL) { console.log('Set DATABASE_URL (backend/.env) or run this SQL yourself:\nUPDATE targets SET status=\'verified\' WHERE url LIKE \'http://127.0.0.1:300%\';'); process.exit(1); }
const db = new pg.Client({ connectionString: process.env.DATABASE_URL }); await db.connect();
console.log('Database:', new URL(process.env.DATABASE_URL).pathname.slice(1));
await db.query("UPDATE targets SET status='verified' WHERE url = ANY($1) AND status='pending'", [Object.values(targetUrls)]);

// ---------- ROE flow ----------
async function upload(c, file, targetId, json, win) {
  const fd = new FormData();
  fd.append('document', new Blob([readFileSync(resolve(FIX, file))], { type: DOCX }), file);
  fd.append('targetIds', targetId);
  fd.append('allowed_tools', json ? JSON.stringify(TOOLS) : TOOLS.join(','));
  fd.append('start_time', win?.[0] ?? START); fd.append('end_time', win?.[1] ?? END); fd.append('attestation', 'true');
  return c.raw('/api/roe', { method: 'POST', body: fd });
}
async function flow(c, file, port, win) {
  const o = { file, stage: 'start', roeId: null, policyId: null, runId: null, targetId: T[port] };
  try {
    let r = await upload(c, file, T[port], false, win);
    if (r.status === 400 && /tool/i.test(JSON.stringify(r.body))) r = await upload(c, file, T[port], true, win);
    if (r.status >= 300) { o.stage = 'upload-failed'; o.detail = r.body; return o; }
    o.roeId = dig(r.body, ['id', 'roe.id', 'roeId']);
    await admin.call(`/admin/roe/${o.roeId}/lab-mode`, 'POST', { lab_mode: true });
    const s = await c.call(`/roe/${o.roeId}/submit`, 'POST');
    let st = dig((await c.call(`/roe/${o.roeId}`)).body, ['status', 'roe.status']);
    if (st === 'ownership_pending') { await c.call(`/roe/${o.roeId}/verification`, 'POST'); st = dig((await c.call(`/roe/${o.roeId}`)).body, ['status', 'roe.status']); }
    if (st !== 'review_pending') { o.stage = 'rejected'; o.detail = `status=${st} ${JSON.stringify(s.body)}`; return o; }
    const rv = await admin.call(`/review/${o.roeId}`, 'POST', { decision: 'approve', reason: 'Scope Guard test approval' });
    if (rv.status >= 300) { o.stage = 'review-failed'; o.detail = rv.body; return o; }
    const p = await c.call(`/roe/${o.roeId}/policy`, 'POST', { targetId: T[port] });
    if (p.status >= 300) { o.stage = 'policy-failed'; o.detail = p.body; return o; }
    o.policyId = dig(p.body, ['id', 'policy.id', 'policyId']);
    const g = await c.call(`/roe/${o.roeId}/policy?policyId=${o.policyId}`);
    const findKeyLike = (o, re) => { if (!o || typeof o !== 'object') return; for (const [k, v] of Object.entries(o)) { if (re.test(k)) return v; const f = findKeyLike(v, re); if (f !== undefined) return f; } };
    const toList = (v) => { if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = v.split(','); } } return Array.isArray(v) ? v : []; };

    o.tools = norm(toList(findKeyLike(g.body, /^selected_tools/)));
    o.blocked = findKeyLike(g.body, /^blocked_actions/);
    if (process.env.DEBUG) console.log(file, JSON.stringify(g.body, null, 2));
    const ru = await c.call('/runs', 'POST', { roeId: o.roeId, targetId: T[port], policyId: o.policyId });
    if (ru.status >= 300) { o.stage = 'run-failed'; o.detail = ru.body; return o; }
    o.runId = dig(ru.body, ['id', 'run.id', 'runId']); o.stage = 'run-created';
  } catch (e) { o.stage = 'error'; o.detail = String(e); }
  return o;
}
const plan = [
  ['ROE-01_Normal_UserA.docx', sunnan, 3000, 'run-created', 'nmap,zap'],
  ['ROE-02_Different_UserA.docx', sunnan, 3001, 'run-created', 'nmap'],
  ['ROE-03_UserB.docx', scruggs, 3002, 'run-created', 'zap'],
  ['ROE-04_PromptInjection.docx', sunnan, 3000, 'run-created', 'nmap,zap'],
  ['ROE-05_NoRulesSection.docx', sunnan, 3000, 'policy-failed', null],
  ['ROE-06_BroadAsk_StrictRules.docx', sunnan, 3000, 'run-created', 'zap'],
  ['ROE-07_Forged_Fraud.docx', sunnan, 3000, 'rejected', null, ['2024-01-01T00:00:00.000Z', '2024-01-31T00:00:00.000Z']], // expired window
];
const res = {};
for (const [file, c, port, stage, tools, win] of plan) {
  if (process.env.ONLY && !file.includes(process.env.ONLY)) continue;
  const o = await flow(c, file, port, win); res[file] = o;
  check(`${file}: ends at "${stage}"`, o.stage === stage, `got ${o.stage}${o.detail ? ' ' + JSON.stringify(o.detail).slice(0, 200) : ''}`);
  if (tools) check(`${file}: policy tools = ${tools}`, o.tools === tools, `got ${o.tools}`);
}

// ---------- isolation ----------
const r1 = res['ROE-01_Normal_UserA.docx'], r3 = res['ROE-03_UserB.docx'];
if (process.env.ONLY) { await db.end(); process.exit(0); }
  const code = async (c, path, m = 'GET', b) => (await c.call(path, m, b)).status;
  check('Scruggs cannot read Sunnan ROE (404)', (await code(scruggs, `/roe/${r1.roeId}`)) === 404);
  check('Scruggs cannot read Sunnan policy (404)', (await code(scruggs, `/roe/${r1.roeId}/policy?policyId=${r1.policyId}`)) === 404);
  check('Scruggs cannot read Sunnan run (404)', (await code(scruggs, `/runs/${r1.runId}`)) === 404);
  check('Sunnan cannot read Scruggs ROE (404)', (await code(sunnan, `/roe/${r3.roeId}`)) === 404);
  check('Scruggs cannot run with Sunnan ROE+policy (404)', (await code(scruggs, '/runs', 'POST', { roeId: r1.roeId, targetId: T[3002], policyId: r1.policyId })) === 404);
  check('Sunnan: ROE-01 policy with another target is refused', [404, 409].includes(await code(sunnan, '/runs', 'POST', { roeId: r1.roeId, targetId: T[3001], policyId: r1.policyId })));
  check('Sunnan cannot run with Scruggs ROE (404)', (await code(sunnan, '/runs', 'POST', { roeId: r3.roeId, targetId: T[3002], policyId: r3.policyId })) === 404);
  check('Requester cannot use admin routes', (await code(sunnan, '/admin/tools')) === 403);

// ---------- summary ----------
await db.end();
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
writeFileSync('scripts/scope_test_results.json', JSON.stringify(res, null, 2));
console.log('Saved scripts/scope_test_results.json (run IDs for the engine)');
for (const o of Object.values(res)) if (o.runId) console.log(`python main.py --run-id ${o.runId}   # ${o.file}`);
