import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolveTxt } from 'node:dns/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { one, query, run, transaction } from '../db/index.js';
import { audit, auditAuth } from '../db/audit.js';
import { plans } from '../seed/plans.js';
import { consumeEmailToken, invalidateEmailTokens, issueEmailToken, newEmailToken, persistEmailToken, sha256 } from '../auth/tokens.js';
import { hitRateLimit } from '../auth/rate-limit.js';
import { requireRole, requireVerified, type SessionUser } from '../auth/deps.js';
import { clearAuthCookies, createSession, listSessions, revokeAllSessions, revokeSession, rotateSession } from '../auth/sessions.js';
import { sendAccountExistsEmail, sendPasswordChangedEmail, sendPasswordResetEmail, sendVerificationEmail } from '../email/sender.js';

const router = express.Router();
const here = dirname(fileURLToPath(import.meta.url));
const uploadDir = resolve(here, '../data/roe-uploads');
const commonPasswords = new Set(['password1234', 'qwerty123456', 'letmein12345', 'welcome12345', 'adminadmin12']);
const dummyHash = bcrypt.hashSync('penflowai-dummy-password-value', 12);
const hash = sha256;
const newId = () => randomUUID();
const now = () => new Date().toISOString();
const ipOf = (req: Request) => req.ip ?? null;
const agentOf = (req: Request) => req.get('user-agent') ?? null;

function route(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res).catch(next);
  };
}

function safeUser(user: SessionUser) {
  return { id: user.id, email: user.email, displayName: user.display_name, role: user.role, emailVerified: Boolean(user.email_verified), planId: user.plan_id, accountType: user.account_type };
}

function safeRoe<T extends Record<string, unknown>>(roe: T): T {
  return { ...roe, scope_token: typeof roe.scope_token === 'string' ? hash(roe.scope_token) : null };
}

function validPassword(password: unknown): password is string {
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) return false;
  return !commonPasswords.has(password.toLowerCase());
}

async function requireOwnedRun(runId: string, ownerId: string): Promise<boolean> {
  return Boolean(await one('SELECT id FROM runs WHERE id = $1 AND owner_id = $2', [runId, ownerId]));
}

router.get('/plans', (_req, res) => res.json({ plans }));

router.post('/auth/register', route(async (req, res) => {
  if (!await hitRateLimit(`register:${ipOf(req) ?? 'unknown'}`, 3, 60 * 1000)) {
    res.status(429).json({ error: 'Too many requests. Try again later.' });
    return;
  }
  const { email, password, displayName, accountType, acceptedTerms } = req.body ?? {};
  const fields: Record<string, string> = {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fields.email = 'Enter a valid email address.';
  if (!validPassword(password)) fields.password = 'Use at least 12 characters and avoid a common password.';
  if (acceptedTerms !== true) fields.acceptedTerms = 'Confirm that you are 18 or older and accept the linked policies.';
  if (Object.keys(fields).length) {
    res.status(400).json({ error: 'Check the fields below.', fields });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const existing = await one<{ id: string; email: string }>('SELECT id, email FROM users WHERE LOWER(email) = $1', [normalizedEmail]);
  if (existing) {
    sendAccountExistsEmail(existing.email);
  } else {
    const id = newId();
    await run('INSERT INTO users (id, email, password_hash, display_name, account_type, role, email_verified, plan_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7, $8)', [
      id,
      normalizedEmail,
      bcrypt.hashSync(password, 12),
      typeof displayName === 'string' && displayName.trim() ? displayName.trim().slice(0, 100) : 'PenflowAI user',
      typeof accountType === 'string' ? accountType.slice(0, 80) : 'business',
      'requester',
      'free',
      now(),
    ]);
    sendVerificationEmail(normalizedEmail, await issueEmailToken(id, 'verify_email', ipOf(req)));
    await audit(id, 'requester', 'signup', '/api/auth/register', 'Account created. Email verification is pending.');
  }
  res.status(201).json({ message: 'Check your email to continue.' });
}));

router.post('/auth/login', route(async (req, res) => {
  const { email, password } = req.body ?? {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const generic = { error: 'Email or password is incorrect.' };
  if (!await hitRateLimit(`login:${ipOf(req) ?? 'unknown'}:${normalizedEmail}`, 5, 60 * 1000)) {
    res.status(429).json(generic);
    return;
  }
  const user = await one<SessionUser & { password_hash: string; failed_attempts: number; locked_until: Date | null; is_active: boolean }>(
    'SELECT * FROM users WHERE LOWER(email) = $1',
    [normalizedEmail],
  );
  const passwordMatches = bcrypt.compareSync(typeof password === 'string' ? password : '', user?.password_hash ?? dummyHash);
  const locked = Boolean(user?.locked_until && user.locked_until.getTime() > Date.now());
  if (!user || !user.is_active || !passwordMatches || locked) {
    if (user && user.is_active && !locked) {
      const failed = user.failed_attempts + 1;
      const lockedUntil = failed >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
      await run('UPDATE users SET failed_attempts = $1, locked_until = COALESCE($2, locked_until) WHERE id = $3', [failed, lockedUntil, user.id]);
      await auditAuth(user.id, lockedUntil ? 'account_locked' : 'login_failed', '/api/auth/login', 'Password did not match.', ipOf(req), agentOf(req));
    } else {
      await auditAuth(user?.id ?? null, 'login_failed', '/api/auth/login', 'Unknown, inactive or locked account.', ipOf(req), agentOf(req));
    }
    res.status(401).json(generic);
    return;
  }
  await run('UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [user.id]);
  await createSession(user, { ip: ipOf(req), userAgent: agentOf(req) }, res);
  await auditAuth(user.id, 'login_success', '/api/auth/login', 'Signed in.', ipOf(req), agentOf(req));
  res.json({ user: safeUser(user) });
}));

router.post('/auth/refresh', route(async (req, res) => {
  if (!await hitRateLimit(`refresh:${ipOf(req) ?? 'unknown'}`, 30, 60 * 1000)) {
    res.status(429).json({ error: 'Too many requests. Try again later.' });
    return;
  }
  const token = req.cookies?.pf_refresh;
  if (typeof token !== 'string') {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  const result = await rotateSession(token, { ip: ipOf(req), userAgent: agentOf(req) }, res);
  if (result.status === 'reuse') {
    await auditAuth(result.userId, 'refresh_reuse', '/api/auth/refresh', 'Rotated refresh token reused; all sessions revoked.', ipOf(req), agentOf(req));
    clearAuthCookies(res);
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  if (result.status !== 'rotated') {
    clearAuthCookies(res);
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  res.json({ ok: true });
}));

router.post('/auth/logout', route(async (req, res) => {
  await revokeSession(req.user!.id, req.sessionId!);
  await auditAuth(req.user!.id, 'logout', '/api/auth/logout', 'Signed out.', ipOf(req), agentOf(req));
  clearAuthCookies(res);
  res.status(204).end();
}));

router.post('/auth/logout-all', route(async (req, res) => {
  const revoked = await revokeAllSessions(req.user!.id);
  await auditAuth(req.user!.id, 'logout_all', '/api/auth/logout-all', `Revoked ${revoked} sessions.`, ipOf(req), agentOf(req));
  clearAuthCookies(res);
  res.status(204).end();
}));

router.get('/auth/me', (req, res) => res.json({ user: safeUser(req.user!) }));

router.get('/auth/sessions', route(async (req, res) => {
  res.json({ sessions: await listSessions(req.user!.id, req.sessionId!) });
}));

router.delete('/auth/sessions/:id', route(async (req, res) => {
  const revoked = await revokeSession(req.user!.id, String(req.params.id));
  if (!revoked) { res.sendStatus(404); return; }
  await auditAuth(req.user!.id, 'session_revoked', '/api/auth/sessions', 'Session revoked by its owner.', ipOf(req), agentOf(req));
  res.status(204).end();
}));

router.post('/auth/forgot-password', route(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const message = 'If an account uses that address, a password reset link has been sent.';
  if (!await hitRateLimit(`forgot_password:${ipOf(req) ?? 'unknown'}:${sha256(email)}`, 3, 60 * 60 * 1000)) {
    res.status(429).json({ error: 'Too many reset requests. Try again later.' });
    return;
  }
  const user = email ? await one<{ id: string; email: string }>('SELECT id, email FROM users WHERE LOWER(email) = $1', [email]) : undefined;
  const token = newEmailToken();
  await invalidateEmailTokens(user?.id ?? '', 'reset_password');
  if (user) {
    await persistEmailToken(user.id, 'reset_password', token, ipOf(req));
    sendPasswordResetEmail(user.email, token);
    await audit(user.id, 'requester', 'password_reset_requested', '/api/auth/forgot-password', 'Password reset email queued.');
  }
  res.status(202).json({ message });
}));

router.post('/auth/reset-password', route(async (req, res) => {
  if (!await hitRateLimit(`reset_password:${ipOf(req) ?? 'unknown'}`, 10, 60 * 60 * 1000)) {
    res.status(429).json({ error: 'Too many attempts. Try again later.' });
    return;
  }
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const password = req.body?.newPassword ?? req.body?.new_password;
  if (!validPassword(password)) {
    res.status(400).json({ error: 'Choose a password with at least 12 characters and at most 72 bytes.', fields: { password: 'Use at least 12 characters and avoid a common password.' } });
    return;
  }
  const consumed = token ? await consumeEmailToken(token, 'reset_password') : null;
  if (!consumed) {
    res.status(400).json({ error: 'This reset link is invalid, expired, or already used. Request a new one.' });
    return;
  }
  const user = await one<{ email: string; role: SessionUser['role'] }>('SELECT email, role FROM users WHERE id = $1', [consumed.userId]);
  if (!user) {
    res.status(400).json({ error: 'This reset link is invalid, expired, or already used. Request a new one.' });
    return;
  }
  await transaction(async (client) => {
    await client.query('UPDATE users SET password_hash = $1, failed_attempts = 0, locked_until = NULL WHERE id = $2', [bcrypt.hashSync(password, 12), consumed.userId]);
    await client.query('UPDATE sessions SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL', [new Date(), consumed.userId]);
    await client.query('DELETE FROM login_attempts WHERE email_key = $1', [user.email.toLowerCase()]);
    await audit(consumed.userId, user.role, 'password_reset_completed', '/api/auth/reset-password', 'Password reset completed; all sessions revoked.', false, null, client);
  });
  sendPasswordChangedEmail(user.email);
  res.json({ message: 'Password updated. Sign in with your new password.' });
}));

router.post('/auth/verify-email', route(async (req, res) => {
  if (!await hitRateLimit(`verify_email:${ipOf(req) ?? 'unknown'}`, 10, 60 * 60 * 1000)) {
    res.status(429).json({ error: 'Too many attempts. Try again later.' });
    return;
  }
  const token = req.body?.token;
  const consumed = typeof token === 'string' ? await consumeEmailToken(token, 'verify_email') : null;
  if (!consumed) {
    res.status(400).json({ error: 'This verification link is invalid, expired, or already used.' });
    return;
  }
  const user = await one<{ role: SessionUser['role'] }>('SELECT role FROM users WHERE id = $1', [consumed.userId]);
  await run('UPDATE users SET email_verified = TRUE, email_verified_at = COALESCE(email_verified_at, $1) WHERE id = $2', [now(), consumed.userId]);
  await audit(consumed.userId, user?.role ?? 'requester', 'email_verified', '/api/auth/verify-email', 'Email address verified.');
  res.json({ message: 'Email verified. You can return to your account.' });
}));

router.post('/auth/resend-verification', route(async (req, res) => {
  if (req.user!.email_verified) {
    res.json({ message: 'This email address is already verified.' });
    return;
  }
  if (!await hitRateLimit(`resend_verification:${req.user!.id}`, 3, 60 * 60 * 1000)) {
    res.status(429).json({ error: 'Too many verification emails. Try again later.' });
    return;
  }
  sendVerificationEmail(req.user!.email, await issueEmailToken(req.user!.id, 'verify_email', ipOf(req)));
  await audit(req.user!.id, req.user!.role, 'verification_email_sent', '/api/auth/resend-verification', 'Verification email queued.');
  res.status(202).json({ message: 'A new verification link has been sent.' });
}));

router.get('/dashboard', requireRole('requester'), route(async (req, res) => {
  const runs = await query('SELECT * FROM runs WHERE owner_id = $1 ORDER BY started_at DESC', [req.user!.id]);
  const reports = await query('SELECT id, run_id, generated_at FROM reports WHERE owner_id = $1 ORDER BY generated_at DESC LIMIT 5', [req.user!.id]);
  const targets = await one<{ count: number }>('SELECT COUNT(*)::int AS count FROM targets WHERE owner_id = $1', [req.user!.id]);
  const plan = plans.find((item) => item.id === req.user!.plan_id) ?? plans[0];
  const used = await one<{ count: number }>('SELECT COUNT(*)::int AS count FROM runs WHERE owner_id = $1', [req.user!.id]);
  res.json({ runs, reports, targetCount: targets?.count ?? 0, plan, scansUsed: used?.count ?? 0 });
}));

router.get('/targets', requireRole('requester'), route(async (req, res) => {
  res.json({ targets: await query('SELECT * FROM targets WHERE owner_id = $1 ORDER BY created_at DESC', [req.user!.id]) });
}));

router.post('/targets', requireVerified, requireRole('requester'), route(async (req, res) => {
  const { url, label } = req.body ?? {};
  if (typeof url !== 'string' || typeof label !== 'string' || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: 'Enter a complete http or https target URL and a label.' });
    return;
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { res.status(400).json({ error: 'Enter a valid target URL.' }); return; }
  const blockedHost = /(^|\.)(gov|mil|health|bank)\./i.test(parsed.hostname) || /government|military|hospital|banking/i.test(parsed.hostname);
  const id = newId();
  const status = blockedHost ? 'blocked' : 'pending';
  const verificationToken = status === 'pending' ? `penflowai-verification=${randomBytes(16).toString('hex')}` : null;
  await run('INSERT INTO targets (id, owner_id, url, label, verification_method, verification_token, status, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)', [
    id, req.user!.id, parsed.origin, label.slice(0, 120), 'DNS TXT', verificationToken, status, now(),
  ]);
  res.status(201).json({ target: await one('SELECT * FROM targets WHERE id = $1 AND owner_id = $2', [id, req.user!.id]), verificationRecord: verificationToken ? { name: `_penflowai-challenge.${parsed.hostname}`, value: verificationToken } : null, message: status === 'blocked' ? 'This target is blocked by the early-access safety policy.' : 'Add the DNS TXT record, then return to verify control.' });
}));

router.post('/targets/:id/verify', requireRole('requester'), route(async (req, res) => {
  const target = await one<{ id: string; url: string; status: string; verification_token: string | null }>('SELECT * FROM targets WHERE id = $1 AND owner_id = $2', [req.params.id, req.user!.id]);
  if (!target) { res.sendStatus(404); return; }
  if (target.status === 'blocked') { res.status(409).json({ error: 'This target cannot be verified.' }); return; }
  if (target.status === 'verified') { res.json({ message: 'Target ownership is already verified.', status: target.status }); return; }
  try {
    const hostname = new URL(target.url).hostname;
    const records = await resolveTxt(`_penflowai-challenge.${hostname}`);
    const verified = records.some((record) => record.join('') === target.verification_token);
    if (!verified) { res.status(409).json({ error: `DNS TXT proof was not found at _penflowai-challenge.${hostname}.` }); return; }
    await run('UPDATE targets SET status = $1 WHERE id = $2 AND owner_id = $3', ['verified', target.id, req.user!.id]);
    res.json({ message: 'Target ownership verified.', status: 'verified' });
  } catch {
    res.status(409).json({ error: 'DNS proof could not be verified. Add the required TXT record and try again.' });
  }
}));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

router.get('/roe', requireRole('requester'), route(async (req, res) => {
  const roes = await query<Record<string, unknown>>('SELECT * FROM roe_documents WHERE owner_id = $1 ORDER BY uploaded_at DESC', [req.user!.id]);
  res.json({ roes: roes.map(safeRoe) });
}));

router.post('/roe', requireVerified, requireRole('requester'), upload.single('document'), route(async (req, res) => {
  const file = req.file;
  const targetIds: string[] = typeof req.body?.targetIds === 'string' ? req.body.targetIds.split(',').filter(Boolean) : [];
  if (!file || !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mimetype)) {
    res.status(400).json({ error: 'Choose a PDF or DOCX Rules of Engagement document under 5 MB.' });
    return;
  }
  const isPdf = file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-';
  const isDocx = file.mimetype.includes('wordprocessingml') && file.buffer.subarray(0, 2).toString() === 'PK';
  if (!isPdf && !isDocx) { res.status(400).json({ error: 'The document signature does not match its file type.' }); return; }
  if (req.body?.attestation !== 'true' || targetIds.length === 0) {
    res.status(400).json({ error: 'Select at least one target and confirm that you have written permission.' });
    return;
  }
  const placeholders = targetIds.map((_, index) => `$${index + 2}`).join(',');
  const targets = await query<{ id: string; url: string; status: string }>(`SELECT id, url, status FROM targets WHERE owner_id = $1 AND id IN (${placeholders})`, [req.user!.id, ...targetIds]);
  if (targets.length !== targetIds.length || targets.some((target) => target.status !== 'verified')) {
    res.status(400).json({ error: 'Every selected target must be verified and belong to your account.' });
    return;
  }
  mkdirSync(uploadDir, { recursive: true });
  const filePath = resolve(uploadDir, `${newId()}${isPdf ? '.pdf' : '.docx'}`);
  writeFileSync(filePath, file.buffer, { flag: 'wx' });
  const id = newId();
  const scope = targets.map((target) => target.url);
  await run(`INSERT INTO roe_documents (id, owner_id, file_name, target_ids_json, scope_json, attestation, status, automated_decision, confidence, reasons_json, file_path, uploaded_at)
    VALUES ($1, $2, $3, $4, $5, TRUE, 'needs_review', 'not_connected', NULL, $6, $7, $8)`, [
    id,
    req.user!.id,
    file.originalname.replace(/[\\/]/g, '_').slice(0, 160),
    JSON.stringify(targetIds),
    JSON.stringify(scope),
    JSON.stringify(['Automated document analysis is not connected; reviewer verification is required before a scope token can be issued.']),
    filePath,
    now(),
  ]);
  await audit(req.user!.id, 'requester', 'roe_submitted', id, 'ROE queued for manual review because automated document analysis is not connected.');
  res.status(201).json({ roe: await one('SELECT * FROM roe_documents WHERE id = $1 AND owner_id = $2', [id, req.user!.id]) });
}));

router.get('/roe/:id', requireRole('requester'), route(async (req, res) => {
  const roe = await one<Record<string, unknown>>('SELECT * FROM roe_documents WHERE id = $1 AND owner_id = $2', [req.params.id, req.user!.id]);
  if (!roe) { res.sendStatus(404); return; }
  res.json({ roe: safeRoe(roe) });
}));

router.get('/review', requireRole('reviewer', 'admin'), route(async (_req, res) => {
  res.json({ queue: await query(`SELECT r.*, u.display_name AS owner_name, u.email AS owner_email FROM roe_documents r JOIN users u ON u.id = r.owner_id WHERE r.status = 'needs_review' ORDER BY r.uploaded_at`) });
}));

router.post('/review/:id', requireRole('reviewer', 'admin'), route(async (req, res) => {
  const { decision, note } = req.body ?? {};
  if (!['approve', 'reject', 'request_correction'].includes(decision) || typeof note !== 'string' || !note.trim()) {
    res.status(400).json({ error: 'Choose a decision and provide a review note.' });
    return;
  }
  const roe = await one<{ id: string; owner_id: string }>('SELECT * FROM roe_documents WHERE id = $1 AND status = $2', [req.params.id, 'needs_review']);
  if (!roe) { res.sendStatus(404); return; }
  const nextStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'needs_review';
  const scopeToken = decision === 'approve' ? randomBytes(32).toString('hex') : null;
  await transaction(async (client) => {
    await client.query('UPDATE roe_documents SET status = $1, reviewer_id = $2, decision = $3, note = $4, decided_at = $5, scope_token = $6, scope_token_issued_at = $7 WHERE id = $8', [
      nextStatus, req.user!.id, decision, note.trim().slice(0, 2000), now(), scopeToken, scopeToken ? now() : null, roe.id,
    ]);
    await audit(roe.owner_id, req.user!.role, 'roe_decision', roe.id, `${decision}: ${note.trim()}`, false, null, client);
  });
  res.json({ roe: safeRoe(await one<Record<string, unknown>>('SELECT * FROM roe_documents WHERE id = $1', [roe.id]) as Record<string, unknown>) });
}));

router.get('/runs', requireRole('requester'), route(async (req, res) => {
  res.json({ runs: await query('SELECT * FROM runs WHERE owner_id = $1 ORDER BY started_at DESC', [req.user!.id]) });
}));

router.post('/runs', requireVerified, requireRole('requester'), route(async (req, res) => {
  const roeId = req.body?.roeId;
  const roe = typeof roeId === 'string' ? await one<{ id: string; scope_json: string }>('SELECT * FROM roe_documents WHERE id = $1 AND owner_id = $2 AND status = $3 AND scope_token IS NOT NULL', [roeId, req.user!.id, 'approved']) : undefined;
  if (!roe) { res.status(409).json({ error: 'An approved Rules of Engagement document with a scope token is required before a test can start.' }); return; }
  const id = newId();
  await run('INSERT INTO runs (id, owner_id, roe_id, status, stage, started_at, scope_json) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, req.user!.id, roe.id, 'running', 'recon', now(), roe.scope_json]);
  await audit(req.user!.id, 'requester', 'run_started', id, 'Run started within the approved ROE scope.', false, id);
  res.status(201).json({ run: await one('SELECT * FROM runs WHERE id = $1 AND owner_id = $2', [id, req.user!.id]), simulated: true });
}));

router.get('/runs/:id', requireRole('requester'), route(async (req, res) => {
  const run = await one<{ roe_id: string }>('SELECT * FROM runs WHERE id = $1 AND owner_id = $2', [req.params.id, req.user!.id]);
  if (!run) { res.sendStatus(404); return; }
  const roe = await one<Record<string, unknown>>('SELECT * FROM roe_documents WHERE id = $1 AND owner_id = $2', [run.roe_id, req.user!.id]);
  const events = await query('SELECT * FROM audit_events WHERE run_id = $1 AND owner_id = $2 ORDER BY created_at', [req.params.id, req.user!.id]);
  res.json({ run, roe: safeRoe(roe as Record<string, unknown>), events, simulated: true });
}));

router.post('/runs/:id/stop', requireRole('requester'), route(async (req, res) => {
  const runId = typeof req.params.id === 'string' ? req.params.id : '';
  const activeRun = await one('SELECT id FROM runs WHERE id = $1 AND owner_id = $2 AND status = $3', [runId, req.user!.id, 'running']);
  if (!activeRun) { res.sendStatus(404); return; }
  await run('UPDATE runs SET status = $1, finished_at = $2 WHERE id = $3 AND owner_id = $4', ['stopped', now(), runId, req.user!.id]);
  await audit(req.user!.id, 'requester', 'run_stopped', runId, 'Run stop requested.', false, runId);
  res.json({ message: 'The simulated run has been stopped.' });
}));

router.get('/runs/:id/log', requireRole('requester'), route(async (req, res) => {
  const runId = typeof req.params.id === 'string' ? req.params.id : '';
  if (!await requireOwnedRun(runId, req.user!.id)) { res.sendStatus(404); return; }
  res.json({ events: await query('SELECT * FROM audit_events WHERE run_id = $1 AND owner_id = $2 ORDER BY created_at', [runId, req.user!.id]) });
}));

const findingsOrder = `ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, type, component`;

router.get('/runs/:id/findings', requireRole('requester'), route(async (req, res) => {
  const runId = typeof req.params.id === 'string' ? req.params.id : '';
  if (!await requireOwnedRun(runId, req.user!.id)) { res.sendStatus(404); return; }
  res.json({ findings: await query(`SELECT * FROM findings WHERE run_id = $1 ${findingsOrder}`, [runId]) });
}));

router.get('/findings', requireRole('requester'), route(async (req, res) => {
  const runId = typeof req.query.runId === 'string' ? req.query.runId : '';
  if (!await requireOwnedRun(runId, req.user!.id)) { res.sendStatus(404); return; }
  res.json({ findings: await query(`SELECT * FROM findings WHERE run_id = $1 ${findingsOrder}`, [runId]) });
}));

router.get('/reports', requireRole('requester'), route(async (req, res) => {
  res.json({ reports: await query('SELECT id, run_id, generated_at FROM reports WHERE owner_id = $1 ORDER BY generated_at DESC', [req.user!.id]) });
}));

router.get('/reports/:id', requireRole('requester'), route(async (req, res) => {
  const report = await one('SELECT * FROM reports WHERE id = $1 AND owner_id = $2', [req.params.id, req.user!.id]);
  if (!report) { res.sendStatus(404); return; }
  res.json({ report });
}));

router.get('/audit', requireRole('requester'), route(async (req, res) => {
  const actor = typeof req.query.actor === 'string' ? req.query.actor : '';
  const blockedOnly = req.query.blocked === 'true';
  const clauses = ['owner_id = $1'];
  const params: (string | number)[] = [req.user!.id];
  if (actor) { params.push(actor); clauses.push(`actor = $${params.length}`); }
  if (blockedOnly) clauses.push('blocked = TRUE');
  res.json({ events: await query(`SELECT * FROM audit_events WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`, params) });
}));

router.get('/billing', requireRole('requester'), route(async (req, res) => {
  const plan = plans.find((item) => item.id === req.user!.plan_id) ?? plans[0];
  const used = await one<{ count: number }>('SELECT COUNT(*)::int AS count FROM runs WHERE owner_id = $1', [req.user!.id]);
  const requests = await query('SELECT * FROM plan_change_requests WHERE user_id = $1 ORDER BY created_at DESC', [req.user!.id]);
  res.json({ plan, scansUsed: used?.count ?? 0, invoices: [], planRequests: requests });
}));

router.post('/billing/plan-requests', requireRole('requester'), route(async (req, res) => {
  const planId = req.body?.planId;
  if (typeof planId !== 'string' || !plans.some((plan) => plan.id === planId)) { res.status(400).json({ error: 'Choose a listed plan.' }); return; }
  const id = newId();
  await run('INSERT INTO plan_change_requests (id, user_id, plan_id, status, created_at) VALUES ($1, $2, $3, $4, $5)', [id, req.user!.id, planId, 'pending_activation', now()]);
  await audit(req.user!.id, req.user!.role, 'plan_change_requested', planId, 'Billing is not live; plan request recorded as pending activation.');
  res.status(201).json({ request: await one('SELECT * FROM plan_change_requests WHERE id = $1', [id]), message: 'Billing is not live during early access. Your plan request is recorded and we will email you at launch.' });
}));

router.post('/billing/plan-requests/:id/cancel', requireRole('requester'), route(async (req, res) => {
  const requestId = typeof req.params.id === 'string' ? req.params.id : '';
  const changed = await run(`UPDATE plan_change_requests SET status = 'cancelled', cancelled_at = $1 WHERE id = $2 AND user_id = $3 AND status = 'pending_activation'`, [now(), requestId, req.user!.id]);
  if (changed === 0) { res.sendStatus(404); return; }
  await audit(req.user!.id, req.user!.role, 'plan_change_cancelled', requestId, 'Pending plan request cancelled.');
  res.json({ message: 'Plan request cancelled.' });
}));

router.get('/me/export', route(async (req, res) => {
  const ownerId = req.user!.id;
  res.json({
    user: safeUser(req.user!),
    targets: await query('SELECT * FROM targets WHERE owner_id = $1', [ownerId]),
    roes: await query('SELECT id, file_name, status, uploaded_at FROM roe_documents WHERE owner_id = $1', [ownerId]),
    runs: await query('SELECT * FROM runs WHERE owner_id = $1', [ownerId]),
    reports: await query('SELECT * FROM reports WHERE owner_id = $1', [ownerId]),
  });
}));

router.delete('/me', route(async (req, res) => {
  await run('DELETE FROM users WHERE id = $1', [req.user!.id]);
  clearAuthCookies(res);
  res.status(204).end();
}));

router.put('/me', route(async (req, res) => {
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim().slice(0, 100) : '';
  if (!displayName) { res.status(400).json({ error: 'Enter a display name.' }); return; }
  await run('UPDATE users SET display_name = $1 WHERE id = $2', [displayName, req.user!.id]);
  const user = await one<SessionUser>('SELECT * FROM users WHERE id = $1', [req.user!.id]);
  res.json({ user: safeUser(user as SessionUser) });
}));

router.post('/waitlist', route(async (req, res) => {
  const { email, name, role, updatesOptIn } = req.body ?? {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: 'Enter a valid email address.', fields: { email: 'Enter a valid email address.' } }); return; }
  try {
    await run('INSERT INTO waitlist (id, email, name, role_description, updates_opt_in, created_at) VALUES ($1, $2, $3, $4, $5, $6)', [
      newId(), email.trim().toLowerCase(), typeof name === 'string' ? (name.trim().slice(0, 100) || null) : null, typeof role === 'string' ? role.slice(0, 100) : null, updatesOptIn === true, now(),
    ]);
  } catch {
    res.status(400).json({ error: 'This email cannot be added to the waitlist.' });
    return;
  }
  res.status(201).json({ message: 'You are on the early access waitlist.' });
}));

router.post('/dev/role-switch', route(async (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.VITE_DEV_ROLE_SWITCH !== 'true') { res.sendStatus(404); return; }
  const role = req.body?.role;
  const emails: Record<string, string> = { requester: 'requester@penflow.test', reviewer: 'reviewer@penflow.test', admin: 'admin@penflow.test' };
  if (typeof role !== 'string' || !emails[role]) { res.status(400).json({ error: 'Choose a seeded role.' }); return; }
  const nextUser = await one<SessionUser>('SELECT * FROM users WHERE LOWER(email) = $1', [emails[role]]);
  if (!nextUser) { res.sendStatus(404); return; }
  await revokeSession(req.user!.id, req.sessionId!);
  await createSession(nextUser, { ip: ipOf(req), userAgent: agentOf(req) }, res);
  await audit(req.user!.id, req.user!.role, 'development_role_switch', role, 'Development control re-issued the session for a seeded account.');
  res.json({ user: safeUser(nextUser) });
}));

router.get('/admin/users', requireRole('admin'), route(async (_req, res) => {
  res.json({
    users: await query('SELECT id, email, display_name, role, email_verified, is_active, plan_id, created_at FROM users ORDER BY created_at'),
    waitlist: await query('SELECT id, email, name, role_description, updates_opt_in, created_at FROM waitlist ORDER BY created_at'),
  });
}));

router.get('/admin/tools', requireRole('admin'), (_req, res) => res.json({ tools: [{ name: 'Scope Guard', status: 'in progress' }, { name: 'Recon adapter', status: 'planned' }, { name: 'Scan engine', status: 'not connected' }] }));
router.get('/admin/models', requireRole('admin'), (_req, res) => res.json({ models: [{ name: 'GPT-OSS', status: 'not connected' }, { name: 'Risk scorer', status: 'simulated data only' }] }));
router.get('/admin/audit-log', requireRole('admin'), route(async (_req, res) => { res.json({ events: await query('SELECT * FROM audit_events ORDER BY created_at DESC') }); }));

export default router;
