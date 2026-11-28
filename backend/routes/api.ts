import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolveTxt } from 'node:dns/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import type { PoolClient } from 'pg';
import { one, query, run, transaction } from '../db/index.js';
import { audit, auditAuth } from '../db/audit.js';
import { plans } from '../seed/plans.js';
import { consumeEmailToken, invalidateEmailTokens, issueEmailToken, newEmailToken, persistEmailToken, sha256 } from '../auth/tokens.js';
import { hitRateLimit } from '../auth/rate-limit.js';
import { requireRole, requireVerified, type SessionUser } from '../auth/deps.js';
import { clearAuthCookies, createSession, listSessions, revokeAllSessions, revokeSession, rotateSession } from '../auth/sessions.js';
import { sendAccountExistsEmail, sendPasswordChangedEmail, sendPasswordResetEmail, sendVerificationEmail } from '../email/sender.js';
import { checkOwnership, listEngineTools, validateRoe } from '../roe/validator-client.js';

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

type StoredRoeScope = {
  targets: string[];
  allowed_tools: string[];
  start_time: string;
  end_time: string;
};

class RoeInputError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}

const roeTransitions: Record<string, string[]> = {
  draft: ['submitted', 'revoked'],
  submitted: ['ownership_pending', 'rejected', 'revoked'],
  rejected: ['submitted', 'revoked'],
  ownership_pending: ['ownership_verified', 'review_pending', 'rejected', 'expired', 'revoked'],
  ownership_verified: ['review_pending', 'rejected', 'expired', 'revoked'],
  review_pending: ['approved', 'rejected', 'ownership_pending', 'expired', 'revoked'],
  approved: ['expired', 'revoked'],
  expired: ['revoked'],
  revoked: [],
};

async function changeRoeStatus(client: PoolClient, roeId: string, nextStatus: string, actor: string, detail: string): Promise<void> {
  const roe = await client.query<{ owner_id: string; status: string }>(
    'SELECT owner_id, status FROM roe_documents WHERE id = $1 FOR UPDATE',
    [roeId],
  );
  const current = roe.rows[0];
  if (!current) throw new Error('ROE not found while changing status.');
  if (!roeTransitions[current.status]?.includes(nextStatus)) {
    throw new Error(`Invalid ROE status transition: ${current.status} -> ${nextStatus}.`);
  }
  await client.query('UPDATE roe_documents SET status = $1 WHERE id = $2', [nextStatus, roeId]);
  await audit(current.owner_id, actor, 'roe_status_changed', roeId, `${current.status} -> ${nextStatus}: ${detail}`, false, null, client);
}

function parseStringList(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.every((item) => typeof item === 'string') ? value.map((item) => item.trim()).filter(Boolean) : null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) return parsed.map((item) => item.trim()).filter(Boolean);
  } catch {
    return trimmed.split(',').map((item) => item.trim()).filter(Boolean);
  }
  return null;
}

function parseRoeTargetIds(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) throw new Error('Stored ROE targets are invalid.');
  return parsed;
}

function parseStoredRoeScope(value: string): StoredRoeScope | null {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { return null; }
  if (Array.isArray(parsed) && parsed.every((target) => typeof target === 'string')) {
    return { targets: parsed, allowed_tools: [], start_time: '', end_time: '' };
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const scope = parsed as Record<string, unknown>;
  if (!Array.isArray(scope.targets) || !scope.targets.every((target) => typeof target === 'string')
    || !Array.isArray(scope.allowed_tools) || !scope.allowed_tools.every((tool) => typeof tool === 'string')
    || typeof scope.start_time !== 'string' || typeof scope.end_time !== 'string') return null;
  return {
    targets: scope.targets,
    allowed_tools: scope.allowed_tools,
    start_time: scope.start_time,
    end_time: scope.end_time,
  };
}

async function runRoeValidation(roeId: string, ownerId: string, input: Record<string, unknown>, labMode: boolean) {
  let result: Awaited<ReturnType<typeof validateRoe>>;
  try {
    result = await validateRoe(input, labMode);
  } catch (error) {
    await audit(ownerId, 'system', 'roe_validator_call', roeId, 'ROE validation invocation failed.');
    throw error;
  }
  await audit(ownerId, 'system', 'roe_validator_call', roeId, `ROE validation returned ${result.status}.`);
  await transaction(async (client) => {
    await client.query('UPDATE roe_documents SET automated_decision = $1, reasons_json = $2, confidence = NULL WHERE id = $3', [
      result.status,
      JSON.stringify(result.reasons),
      roeId,
    ]);
    await changeRoeStatus(client, roeId, result.status === 'invalid' ? 'rejected' : 'ownership_pending', 'system', `Validator result: ${result.status}.`);
    if (result.status === 'valid' && labMode) {
      await changeRoeStatus(client, roeId, 'review_pending', 'system', 'Lab-mode ROE skips ownership verification.');
    }
  });
  return result;
}

async function getOwnerValidationInput(ownerId: string, targetIds: string[], allowedTools: string[], startTime: string, endTime: string) {
  const owner = await one<{ display_name: string; email: string }>('SELECT display_name, email FROM users WHERE id = $1', [ownerId]);
  if (!owner) throw new Error('ROE owner no longer exists.');
  const targets = await query<{ id: string; url: string; owner_id: string; status: string }>(
    'SELECT id, url, owner_id, status FROM targets WHERE id = ANY($1::uuid[])',
    [targetIds],
  );
  if (targets.length !== targetIds.length || targets.some((target) => target.owner_id !== ownerId)) {
    throw new RoeInputError(404, 'One or more targets were not found.');
  }
  if (targets.some((target) => target.status !== 'verified')) {
    throw new RoeInputError(409, 'Every selected target must already be verified.');
  }
  return {
    targets: targetIds.map((id) => targets.find((target) => target.id === id)!.url),
    allowed_tools: allowedTools,
    start_time: startTime,
    end_time: endTime,
    owner_name: owner.display_name,
    owner_contact: owner.email,
  };
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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

router.get('/roe/tools', requireRole('requester'), route(async (_req, res) => {
  res.json({ tools: await listEngineTools() });
}));

router.get('/roe', requireRole('requester'), route(async (req, res) => {
  const roes = await query<Record<string, unknown>>('SELECT * FROM roe_documents WHERE owner_id = $1 ORDER BY uploaded_at DESC', [req.user!.id]);
  res.json({ roes: roes.map(safeRoe) });
}));

router.post('/roe', requireVerified, requireRole('requester'), upload.single('document'), route(async (req, res) => {
  const file = req.file;
  const targetIds: string[] = typeof req.body?.targetIds === 'string' ? req.body.targetIds.split(',').filter(Boolean) : [];
  const allowedTools = parseStringList(req.body?.allowed_tools);
  const startTime = req.body?.start_time;
  const endTime = req.body?.end_time;
  if (!file || !['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'].includes(file.mimetype)) {
    res.status(400).json({ error: 'Choose a PDF or DOCX Rules of Engagement document under 5 MB.' });
    return;
  }
  const isPdf = file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString() === '%PDF-';
  const isDocx = file.mimetype.includes('wordprocessingml') && file.buffer.subarray(0, 2).toString() === 'PK';
  if (!isPdf && !isDocx) { res.status(400).json({ error: 'The document signature does not match its file type.' }); return; }
  if (req.body?.attestation !== 'true' || targetIds.length === 0 || targetIds.some((id) => !validUuid(id))) {
    res.status(400).json({ error: 'Select valid targets and confirm that you have written permission.' });
    return;
  }
  if (new Set(targetIds).size !== targetIds.length) {
    res.status(400).json({ error: 'Choose each target only once.' });
    return;
  }
  if (!allowedTools?.length || typeof startTime !== 'string' || typeof endTime !== 'string') {
    res.status(400).json({ error: 'Choose allowed tools and provide the authorization start and end times.' });
    return;
  }
  const registeredTools = new Set(await listEngineTools());
  const unknownTools = allowedTools.filter((tool) => !registeredTools.has(tool));
  if (unknownTools.length) {
    res.status(400).json({ error: `Unknown engine tools: ${unknownTools.join(', ')}.` });
    return;
  }
  const targets = await query<{ id: string; url: string; status: string; owner_id: string }>(
    'SELECT id, url, status, owner_id FROM targets WHERE id = ANY($1::uuid[])',
    [targetIds],
  );
  if (targets.length !== targetIds.length || targets.some((target) => target.owner_id !== req.user!.id)) {
    res.sendStatus(404);
    return;
  }
  if (targets.some((target) => target.status !== 'verified')) {
    res.status(409).json({ error: 'Every selected target must already be verified.' });
    return;
  }
  mkdirSync(uploadDir, { recursive: true });
  const filePath = resolve(uploadDir, `${newId()}${isPdf ? '.pdf' : '.docx'}`);
  writeFileSync(filePath, file.buffer, { flag: 'wx' });
  const id = newId();
  const scope: StoredRoeScope = {
    targets: targetIds.map((targetId) => targets.find((target) => target.id === targetId)!.url),
    allowed_tools: allowedTools,
    start_time: startTime,
    end_time: endTime,
  };
  await run(`INSERT INTO roe_documents (id, owner_id, file_name, target_ids_json, scope_json, attestation, status, automated_decision, confidence, reasons_json, file_path, uploaded_at)
    VALUES ($1, $2, $3, $4, $5, TRUE, 'draft', 'pending', NULL, '[]', $6, $7)`, [
    id,
    req.user!.id,
    file.originalname.replace(/[\\/]/g, '_').slice(0, 160),
    JSON.stringify(targetIds),
    JSON.stringify(scope),
    filePath,
    now(),
  ]);
  await transaction((client) => changeRoeStatus(client, id, 'submitted', 'requester', 'ROE submitted for automated validation.'));
  const input = await getOwnerValidationInput(req.user!.id, targetIds, allowedTools, startTime, endTime);
  await runRoeValidation(id, req.user!.id, input, false);
  res.status(201).json({ roe: safeRoe(await one<Record<string, unknown>>('SELECT * FROM roe_documents WHERE id = $1 AND owner_id = $2', [id, req.user!.id]) as Record<string, unknown>) });
}));

router.post('/roe/:id/submit', requireVerified, requireRole('requester'), route(async (req, res) => {
  const roe = await one<{ id: string; owner_id: string; status: string; target_ids_json: string; scope_json: string; lab_mode: boolean }>(
    'SELECT * FROM roe_documents WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.user!.id],
  );
  if (!roe) { res.sendStatus(404); return; }
  if (!['draft', 'rejected'].includes(roe.status)) {
    res.status(409).json({ error: 'Only draft or rejected ROEs can be submitted again.' });
    return;
  }
  const scope = parseStoredRoeScope(roe.scope_json);
  if (!scope) { res.status(409).json({ error: 'The saved ROE scope is invalid.' }); return; }
  const targetIds = parseRoeTargetIds(roe.target_ids_json);
  let input: Awaited<ReturnType<typeof getOwnerValidationInput>>;
  try {
    input = await getOwnerValidationInput(roe.owner_id, targetIds, scope.allowed_tools, scope.start_time, scope.end_time);
  } catch (error) {
    if (error instanceof RoeInputError) {
      res.status(error.statusCode).json({ error: error.message });
      return;
    }
    throw error;
  }
  await transaction((client) => changeRoeStatus(client, roe.id, 'submitted', 'requester', 'ROE resubmitted for automated validation.'));
  await runRoeValidation(roe.id, roe.owner_id, input, roe.lab_mode);
  res.json({ roe: safeRoe(await one<Record<string, unknown>>('SELECT * FROM roe_documents WHERE id = $1 AND owner_id = $2', [roe.id, req.user!.id]) as Record<string, unknown>) });
}));

router.get('/roe/:id', requireRole('requester'), route(async (req, res) => {
  const roe = await one<Record<string, unknown>>('SELECT * FROM roe_documents WHERE id = $1 AND owner_id = $2', [req.params.id, req.user!.id]);
  if (!roe) { res.sendStatus(404); return; }
  res.json({ roe: safeRoe(roe) });
}));

router.post('/roe/:id/verification', requireRole('requester'), route(async (req, res) => {
  const roe = await one<{ id: string; owner_id: string; status: string; target_ids_json: string; lab_mode: boolean }>(
    'SELECT * FROM roe_documents WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.user!.id],
  );
  if (!roe) { res.sendStatus(404); return; }
  if (roe.lab_mode) {
    if (roe.status === 'ownership_pending') {
      await transaction((client) => changeRoeStatus(client, roe.id, 'review_pending', 'system', 'Lab-mode ROE skips ownership verification.'));
    }
    res.json({ status: 'review_pending', message: 'Lab-mode ROE does not require ownership verification.' });
    return;
  }
  if (roe.status !== 'ownership_pending') {
    res.status(409).json({ error: 'This ROE is not waiting for ownership verification.' });
    return;
  }
  const targetIds = parseRoeTargetIds(roe.target_ids_json);
  const targets = await query<{ id: string; url: string; owner_id: string }>(
    'SELECT id, url, owner_id FROM targets WHERE id = ANY($1::uuid[])',
    [targetIds],
  );
  if (targets.length !== targetIds.length || targets.some((target) => target.owner_id !== req.user!.id)) {
    res.sendStatus(404);
    return;
  }
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const instructions = targets.map((target) => {
    const token = randomBytes(32).toString('hex');
    return { target: target.url, token };
  });
  await transaction(async (client) => {
    for (const instruction of instructions) {
      await client.query(`INSERT INTO roe_verifications (id, roe_id, target, token, expires_at)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (roe_id, target) DO UPDATE SET token = EXCLUDED.token, method = NULL, expires_at = EXCLUDED.expires_at, verified_at = NULL`, [
        newId(), roe.id, instruction.target, instruction.token, expiresAt,
      ]);
      await audit(roe.owner_id, 'requester', 'roe_verification_issued', roe.id, `Ownership verification instructions issued for ${instruction.target}.`, false, null, client);
    }
  });
  res.status(201).json({
    instructions: instructions.map(({ target, token }) => {
      const domain = new URL(target).hostname;
      return {
        target,
        token,
        dns: { name: `_penflow-verify.${domain}`, value: token },
        file: { path: '/.well-known/penflow-verify.txt', content: token },
        meta: { tag: `<meta name="penflow-verify" content="${token}">` },
      };
    }),
    expires_at: expiresAt.toISOString(),
  });
}));

router.post('/roe/:id/verify', requireRole('requester'), route(async (req, res) => {
  const roe = await one<{ id: string; owner_id: string; status: string; target_ids_json: string; lab_mode: boolean }>(
    'SELECT * FROM roe_documents WHERE id = $1 AND owner_id = $2',
    [req.params.id, req.user!.id],
  );
  if (!roe) { res.sendStatus(404); return; }
  if (roe.lab_mode) {
    if (roe.status === 'ownership_pending') {
      await transaction((client) => changeRoeStatus(client, roe.id, 'review_pending', 'system', 'Lab-mode ROE skips ownership verification.'));
    }
    res.json({ status: 'review_pending', message: 'Lab-mode ROE does not require ownership verification.' });
    return;
  }
  if (roe.status !== 'ownership_pending') {
    res.status(409).json({ error: 'This ROE is not waiting for ownership verification.' });
    return;
  }
  const targetIds = parseRoeTargetIds(roe.target_ids_json);
  const targets = await query<{ id: string; url: string; owner_id: string }>(
    'SELECT id, url, owner_id FROM targets WHERE id = ANY($1::uuid[])',
    [targetIds],
  );
  if (targets.length !== targetIds.length || targets.some((target) => target.owner_id !== req.user!.id)) {
    res.sendStatus(404);
    return;
  }
  const verifications = await query<{ target: string; token: string; expires_at: Date; verified_at: Date | null }>(
    'SELECT target, token, expires_at, verified_at FROM roe_verifications WHERE roe_id = $1',
    [roe.id],
  );
  if (verifications.length !== targets.length) {
    await audit(roe.owner_id, 'requester', 'roe_verification_attempt', roe.id, 'Ownership verification attempted before all proof tokens were issued.');
    res.status(409).json({ error: 'Issue verification instructions for every target first.' });
    return;
  }
  const failures: string[] = [];
  for (const verification of verifications) {
    if (verification.verified_at) continue;
    if (verification.expires_at.getTime() <= Date.now()) {
      failures.push(`The verification token for ${verification.target} has expired.`);
      await audit(roe.owner_id, 'requester', 'roe_verification_attempt', roe.id, `Expired ownership token rejected for ${verification.target}.`, true);
      continue;
    }
    let result: Awaited<ReturnType<typeof checkOwnership>>;
    try {
      result = await checkOwnership(verification.target, verification.token);
    } catch (error) {
      await audit(roe.owner_id, 'system', 'roe_validator_call', roe.id, `Ownership validator invocation failed for ${verification.target}.`, true);
      await audit(roe.owner_id, 'requester', 'roe_verification_attempt', roe.id, `Ownership verification failed for ${verification.target}.`, true);
      throw error;
    }
    await audit(roe.owner_id, 'system', 'roe_validator_call', roe.id, `Ownership validator returned ${result.verified ? 'verified' : 'not verified'} for ${verification.target}.`);
    await audit(roe.owner_id, 'requester', 'roe_verification_attempt', roe.id, `Ownership verification ${result.verified ? 'succeeded' : 'failed'} for ${verification.target}.`, !result.verified);
    if (!result.verified || !result.method) {
      failures.push(result.detail || `Ownership proof was not found for ${verification.target}.`);
      continue;
    }
    await run('UPDATE roe_verifications SET method = $1, verified_at = $2 WHERE roe_id = $3 AND target = $4 AND verified_at IS NULL', [
      result.method, now(), roe.id, verification.target,
    ]);
  }
  if (failures.length) {
    res.status(409).json({ error: 'Ownership verification is incomplete.', reasons: failures });
    return;
  }
  await transaction(async (client) => {
    await changeRoeStatus(client, roe.id, 'ownership_verified', 'system', 'All target ownership proofs were verified.');
    await changeRoeStatus(client, roe.id, 'review_pending', 'system', 'Ownership verification completed.');
  });
  res.json({ status: 'review_pending', message: 'All targets were verified. The ROE is waiting for review.' });
}));

router.get('/review', requireRole('reviewer', 'admin'), route(async (_req, res) => {
  res.json({ queue: await query(`SELECT r.*, u.display_name AS owner_name, u.email AS owner_email FROM roe_documents r JOIN users u ON u.id = r.owner_id WHERE r.status = 'review_pending' ORDER BY r.uploaded_at`) });
}));

router.post('/review/:id', requireRole('reviewer'), route(async (req, res) => {
  const { decision, reason } = req.body ?? {};
  if (!['approve', 'reject'].includes(decision) || typeof reason !== 'string' || !reason.trim()) {
    res.status(400).json({ error: 'Choose approve or reject and provide a reason.' });
    return;
  }
  const roe = await one<{ id: string; owner_id: string; status: string }>('SELECT id, owner_id, status FROM roe_documents WHERE id = $1 AND status = $2', [req.params.id, 'review_pending']);
  if (!roe) { res.sendStatus(404); return; }
  if (roe.owner_id === req.user!.id) { res.status(403).json({ error: 'Reviewers cannot decide their own ROE.' }); return; }
  const nextStatus = decision === 'approve' ? 'approved' : 'rejected';
  const scopeToken = decision === 'approve' ? randomBytes(32).toString('hex') : null;
  await transaction(async (client) => {
    await changeRoeStatus(client, roe.id, nextStatus, 'reviewer', `${decision}: ${reason.trim().slice(0, 2000)}`);
    await client.query('UPDATE roe_documents SET reviewer_id = $1, decision = $2, note = $3, reasons_json = $4, decided_at = $5, scope_token = $6, scope_token_issued_at = $7 WHERE id = $8', [
      req.user!.id, decision, reason.trim().slice(0, 2000), decision === 'reject' ? JSON.stringify([reason.trim().slice(0, 2000)]) : '[]', now(), scopeToken, scopeToken ? now() : null, roe.id,
    ]);
  });
  res.json({ roe: safeRoe(await one<Record<string, unknown>>('SELECT * FROM roe_documents WHERE id = $1', [roe.id]) as Record<string, unknown>) });
}));

router.get('/runs', requireRole('requester'), route(async (req, res) => {
  res.json({ runs: await query('SELECT * FROM runs WHERE owner_id = $1 ORDER BY started_at DESC', [req.user!.id]) });
}));

router.post('/runs', requireVerified, requireRole('requester'), route(async (req, res) => {
  const roeId = req.body?.roeId;
  const target = req.body?.target;
  const roe = typeof roeId === 'string' ? await one<{ id: string; owner_id: string; scope_json: string; status: string; scope_token: string | null; target_ids_json: string; lab_mode: boolean }>(
    'SELECT * FROM roe_documents WHERE id = $1 AND owner_id = $2',
    [roeId, req.user!.id],
  ) : undefined;
  if (!roe) { res.sendStatus(404); return; }
  if (roe.status !== 'approved' || !roe.scope_token) {
    res.status(409).json({ error: 'An approved Rules of Engagement document is required before a test can start.' });
    return;
  }
  const scope = parseStoredRoeScope(roe.scope_json);
  if (!scope || !scope.start_time || !scope.end_time) {
    res.status(409).json({ error: 'The approved ROE does not contain a valid authorization window.' });
    return;
  }
  const startTime = Date.parse(scope.start_time);
  const endTime = Date.parse(scope.end_time);
  const currentTime = Date.now();
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || currentTime < startTime) {
    res.status(409).json({ error: 'The ROE authorization window has not started or is invalid.' });
    return;
  }
  if (currentTime >= endTime) {
    await transaction((client) => changeRoeStatus(client, roe.id, 'expired', 'system', 'Authorization window ended before the run started.'));
    res.status(409).json({ error: 'The ROE authorization window has ended; the ROE was marked expired.' });
    return;
  }
  if (typeof target !== 'string' || !scope.targets.includes(target)) {
    res.status(409).json({ error: 'Choose a target included in this ROE.' });
    return;
  }
  const targetIds = parseRoeTargetIds(roe.target_ids_json);
  const roeTargets = await query<{ id: string; url: string; owner_id: string; status: string }>(
    'SELECT id, url, owner_id, status FROM targets WHERE id = ANY($1::uuid[])',
    [targetIds],
  );
  if (roeTargets.length !== targetIds.length || roeTargets.some((item) => item.owner_id !== req.user!.id)) {
    res.status(409).json({ error: 'One or more ROE targets are no longer available to this account.' });
    return;
  }
  if (!roeTargets.some((item) => item.url === target) || roeTargets.some((item) => item.status !== 'verified')) {
    res.status(409).json({ error: 'The selected target is not a verified target in this ROE.' });
    return;
  }
  if (!roe.lab_mode) {
    const verified = await query<{ target: string }>(
      'SELECT target FROM roe_verifications WHERE roe_id = $1 AND verified_at IS NOT NULL AND method IS NOT NULL',
      [roe.id],
    );
    if (scope.targets.some((item) => !verified.some((proof) => proof.target === item))) {
      res.status(409).json({ error: 'Every target in the ROE must pass ownership verification before a run can start.' });
      return;
    }
  }
  const id = newId();
  await run('INSERT INTO runs (id, owner_id, roe_id, status, stage, started_at, scope_json) VALUES ($1, $2, $3, $4, $5, $6, $7)', [id, req.user!.id, roe.id, 'running', 'recon', now(), JSON.stringify([target])]);
  await audit(req.user!.id, 'requester', 'run_started', id, `Run started against ${target} within the approved ROE scope.`, false, id);
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
  const report = await one('SELECT id, run_id, owner_id, markdown, generated_at, report_json FROM reports WHERE id = $1 AND owner_id = $2', [req.params.id, req.user!.id]);
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

router.post('/admin/roe/:id/lab-mode', requireRole('admin'), route(async (req, res) => {
  const labMode = req.body?.lab_mode;
  if (typeof labMode !== 'boolean') {
    res.status(400).json({ error: 'lab_mode must be a boolean.' });
    return;
  }
  const roe = await one<{ id: string; owner_id: string; status: string; lab_mode: boolean }>(
    'SELECT id, owner_id, status, lab_mode FROM roe_documents WHERE id = $1',
    [req.params.id],
  );
  if (!roe) { res.sendStatus(404); return; }
  if (['approved', 'expired', 'revoked'].includes(roe.status)) {
    res.status(409).json({ error: 'Lab mode cannot be changed after review is complete.' });
    return;
  }
  await transaction(async (client) => {
    await client.query('UPDATE roe_documents SET lab_mode = $1 WHERE id = $2', [labMode, roe.id]);
    await audit(roe.owner_id, 'admin', 'roe_lab_mode_changed', roe.id, `Lab mode set to ${labMode}.`, false, null, client);
    if (labMode && roe.status === 'ownership_pending') {
      await changeRoeStatus(client, roe.id, 'review_pending', 'admin', 'Lab-mode ROE skips ownership verification.');
    } else if (!labMode && roe.status === 'review_pending') {
      await changeRoeStatus(client, roe.id, 'ownership_pending', 'admin', 'Lab mode disabled; ownership verification is required.');
    }
  });
  res.json({ roe: safeRoe(await one<Record<string, unknown>>('SELECT * FROM roe_documents WHERE id = $1', [roe.id]) as Record<string, unknown>) });
}));

router.post('/admin/roe/:id/revoke', requireRole('admin'), route(async (req, res) => {
  const roe = await one<{ id: string; status: string }>('SELECT id, status FROM roe_documents WHERE id = $1', [req.params.id]);
  if (!roe) { res.sendStatus(404); return; }
  if (roe.status === 'revoked') { res.status(409).json({ error: 'This ROE is already revoked.' }); return; }
  const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 2000) : '';
  await transaction((client) => changeRoeStatus(client, roe.id, 'revoked', 'admin', reason || 'Revoked by admin.'));
  res.json({ roe: safeRoe(await one<Record<string, unknown>>('SELECT * FROM roe_documents WHERE id = $1', [roe.id]) as Record<string, unknown>) });
}));

export default router;
