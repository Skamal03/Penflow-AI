import bcrypt from 'bcryptjs';
import { randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolveTxt } from 'node:dns/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { db } from '../db/index.js';
import { plans } from '../seed/plans.js';

const router = express.Router();
const here = dirname(fileURLToPath(import.meta.url));
const uploadDir = resolve(here, '../data/roe-uploads');
const commonPasswords = new Set(['password1234', 'qwerty123456', 'letmein12345', 'welcome12345', 'adminadmin12']);
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const newId = (prefix: string) => `${prefix}_${randomBytes(8).toString('hex')}`;
const now = () => new Date().toISOString();

type SessionUser = {
  id: string;
  email: string;
  display_name: string;
  role: 'requester' | 'reviewer' | 'admin';
  email_verified: number;
  plan_id: string;
  account_type: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionId?: string;
    }
  }
}

function audit(ownerId: string | null, actor: string, action: string, target: string, detail: string, blocked = false, runId: string | null = null): void {
  db.prepare('INSERT INTO audit_events (id, owner_id, run_id, actor, action, target, blocked, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(newId('aud'), ownerId, runId, actor, action, target, blocked ? 1 : 0, detail, now());
}

function safeUser(user: SessionUser) {
  return { id: user.id, email: user.email, displayName: user.display_name, role: user.role, emailVerified: Boolean(user.email_verified), planId: user.plan_id, accountType: user.account_type };
}

function safeRoe<T extends Record<string, unknown>>(roe: T): T {
  return { ...roe, scope_token: typeof roe.scope_token === 'string' ? hash(roe.scope_token) : null };
}

function issueSession(userId: string, res: Response): void {
  const token = randomBytes(32).toString('base64url');
  const issuedAt = now();
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(newId('ses'), userId, hash(token), expiresAt, issuedAt);
  res.cookie('pf_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 60 * 60 * 1000, path: '/' });
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const rawToken = req.cookies?.pf_session;
  if (typeof rawToken !== 'string') {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  const row = db.prepare(`SELECT s.id AS session_id, s.user_id, u.id, u.email, u.display_name, u.role, u.email_verified, u.plan_id, u.account_type
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`).get(hash(rawToken), now()) as (SessionUser & { session_id: string; user_id: string }) | undefined;
  if (!row) {
    res.clearCookie('pf_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
    res.status(401).json({ error: 'Your session has expired. Sign in again.' });
    return;
  }
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(expiresAt, row.session_id);
  res.cookie('pf_session', rawToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 60 * 60 * 1000, path: '/' });
  req.user = row;
  req.sessionId = row.session_id;
  next();
}

function requireRole(...roles: SessionUser['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Sign in to continue.' });
      return;
    }
    const allowed = roles.includes(req.user.role);
    audit(req.user.id, req.user.role, 'role_decision', req.originalUrl, allowed ? `Allowed for ${req.user.role}.` : `Denied for ${req.user.role}; required ${roles.join(' or ')}.`);
    if (!allowed) {
      res.status(403).json({ error: 'Your role cannot access this resource.' });
      return;
    }
    next();
  };
}

function csrfMatches(req: Request): boolean {
  const cookieToken = req.cookies?.pf_csrf;
  const headerToken = req.get('x-csrf-token');
  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string') return false;
  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  return cookieBuffer.length === headerBuffer.length && timingSafeEqual(cookieBuffer, headerBuffer);
}

function validPassword(password: unknown): password is string {
  if (typeof password !== 'string' || password.length < 12 || password.length > 200) return false;
  return !commonPasswords.has(password.toLowerCase());
}

function requireOwnedRun(runId: string, ownerId: string): boolean {
  return Boolean(db.prepare('SELECT id FROM runs WHERE id = ? AND owner_id = ?').get(runId, ownerId));
}

router.get('/csrf', (_req, res) => {
  const token = randomBytes(32).toString('hex');
  res.cookie('pf_csrf', token, { httpOnly: false, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 60 * 60 * 1000, path: '/' });
  res.json({ csrfToken: token });
});

router.get('/plans', (_req, res) => res.json({ plans }));

router.post('/auth/signup', (req, res) => {
  const { email, password, displayName, accountType, acceptedTerms } = req.body ?? {};
  const fields: Record<string, string> = {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) fields.email = 'Enter a valid email address.';
  if (!validPassword(password)) fields.password = 'Use at least 12 characters and avoid a common password.';
  if (acceptedTerms !== true) fields.acceptedTerms = 'Confirm that you are 18 or older and accept the linked policies.';
  if (Object.keys(fields).length) {
    res.status(400).json({ error: 'Check the fields below.', fields });
    return;
  }
  if (db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email)) {
    res.status(400).json({ error: 'An account with that email cannot be created.', fields: { email: 'An account with that email cannot be created.' } });
    return;
  }
  const id = newId('usr');
  db.prepare('INSERT INTO users (id, email, password_hash, display_name, account_type, role, email_verified, plan_id, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)')
    .run(id, email.trim().toLowerCase(), bcrypt.hashSync(password, 12), typeof displayName === 'string' && displayName.trim() ? displayName.trim().slice(0, 100) : 'PenflowAI user', typeof accountType === 'string' ? accountType.slice(0, 80) : 'business', 'requester', 'free', now());
  audit(id, 'requester', 'signup', '/signup', 'Account created. Email verification is pending.');
  issueSession(id, res);
  res.status(201).json({ user: safeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id) as SessionUser) });
});

router.post('/auth/login', (req, res) => {
  const { email, password } = req.body ?? {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const ip = req.ip || 'unknown';
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  db.prepare('DELETE FROM login_attempts WHERE attempted_at < ?').run(cutoff);
  db.prepare('INSERT INTO login_attempts (email_key, ip_address, attempted_at, succeeded) VALUES (?, ?, ?, 0)').run(normalizedEmail, ip, now());
  const attempts = db.prepare('SELECT COUNT(*) AS count FROM login_attempts WHERE email_key = ? AND ip_address = ? AND attempted_at >= ?').get(normalizedEmail, ip, cutoff) as { count: number };
  if (attempts.count > 5) {
    audit(null, 'requester', 'failed_login_rate_limited', '/api/auth/login', 'Login temporarily locked after repeated attempts.');
    res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
    return;
  }
  const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(normalizedEmail) as (SessionUser & { password_hash: string }) | undefined;
  if (!user || typeof password !== 'string' || !bcrypt.compareSync(password, user.password_hash)) {
    audit(user?.id ?? null, 'requester', 'failed_login', '/api/auth/login', 'Email or password did not match.');
    res.status(401).json({ error: 'Email or password is incorrect.' });
    return;
  }
  db.prepare('UPDATE login_attempts SET succeeded = 1 WHERE id = last_insert_rowid()').run();
  issueSession(user.id, res);
  audit(user.id, user.role, 'login', '/api/auth/login', 'User signed in.');
  res.json({ user: safeUser(user) });
});

router.post('/auth/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId);
  audit(req.user!.id, req.user!.role, 'logout', '/api/auth/logout', 'User signed out.');
  res.clearCookie('pf_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  res.status(204).end();
});

router.post('/auth/password-reset', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const user = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(email) as { id: string } | undefined;
  if (user) {
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(newId('prt'), user.id, hash(token), new Date(Date.now() + 30 * 60 * 1000).toISOString(), now());
    console.info(`[dev only] Password reset link: http://127.0.0.1:5173/reset-password?token=${token}`);
  }
  res.json({ message: 'If an account can receive a reset link, it will be shown in the development server log.' });
});

router.post('/auth/complete-reset', (req, res) => {
  const { token, password } = req.body ?? {};
  if (typeof token !== 'string' || !validPassword(password)) {
    res.status(400).json({ error: 'Enter a valid reset link and a password with at least 12 characters.' });
    return;
  }
  const row = db.prepare('SELECT id, user_id FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(hash(token), now()) as { id: string; user_id: string } | undefined;
  if (!row) {
    res.status(400).json({ error: 'This reset link is invalid or expired. Request a new one.' });
    return;
  }
  const transaction = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(password, 12), row.user_id);
    db.prepare('UPDATE password_reset_tokens SET used_at = ? WHERE id = ?').run(now(), row.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(row.user_id);
  });
  transaction();
  res.json({ message: 'Password updated. Sign in with your new password.' });
});

router.post('/auth/verify-email', (req, res) => {
  const { email } = req.body ?? {};
  if (typeof email === 'string') {
    const user = db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE AND email_verified = 0').get(email.trim()) as { id: string } | undefined;
    if (user) {
      const token = randomBytes(32).toString('hex');
      db.prepare('INSERT INTO email_verification_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(newId('evt'), user.id, hash(token), new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), now());
      console.info(`[dev only] Email verification link: http://127.0.0.1:5173/verify-email?token=${token}`);
    }
  }
  res.json({ message: 'If verification is needed, a link is available in the development server log.' });
});

router.post('/auth/complete-verification', (req, res) => {
  const token = req.body?.token;
  const row = typeof token === 'string' ? db.prepare('SELECT id, user_id FROM email_verification_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?').get(hash(token), now()) as { id: string; user_id: string } | undefined : undefined;
  if (!row) {
    res.status(400).json({ error: 'This verification link is invalid or expired.' });
    return;
  }
  const transaction = db.transaction(() => {
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(row.user_id);
    db.prepare('UPDATE email_verification_tokens SET used_at = ? WHERE id = ?').run(now(), row.id);
  });
  transaction();
  res.json({ message: 'Email verified. You can return to your account.' });
});

router.get('/session', (req, res) => {
  const rawToken = req.cookies?.pf_session;
  if (typeof rawToken !== 'string') { res.json({ user: null }); return; }
  const row = db.prepare(`SELECT s.id AS session_id, u.id, u.email, u.display_name, u.role, u.email_verified, u.plan_id, u.account_type
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`).get(hash(rawToken), now()) as (SessionUser & { session_id: string }) | undefined;
  if (!row) {
    res.clearCookie('pf_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
    res.json({ user: null });
    return;
  }
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').run(expiresAt, row.session_id);
  res.cookie('pf_session', rawToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 12 * 60 * 60 * 1000, path: '/' });
  res.json({ user: safeUser(row) });
});
router.get('/me', requireAuth, (req, res) => res.json({ user: safeUser(req.user!) }));
router.get('/dashboard', requireAuth, requireRole('requester'), (req, res) => {
  const runs = db.prepare('SELECT * FROM runs WHERE owner_id = ? ORDER BY started_at DESC').all(req.user!.id);
  const reports = db.prepare('SELECT id, run_id, generated_at FROM reports WHERE owner_id = ? ORDER BY generated_at DESC LIMIT 5').all(req.user!.id);
  const targets = db.prepare('SELECT COUNT(*) AS count FROM targets WHERE owner_id = ?').get(req.user!.id) as { count: number };
  const plan = plans.find((item) => item.id === req.user!.plan_id) ?? plans[0];
  const used = db.prepare('SELECT COUNT(*) AS count FROM runs WHERE owner_id = ?').get(req.user!.id) as { count: number };
  res.json({ runs, reports, targetCount: targets.count, plan, scansUsed: used.count });
});

router.get('/targets', requireAuth, requireRole('requester'), (req, res) => {
  res.json({ targets: db.prepare('SELECT * FROM targets WHERE owner_id = ? ORDER BY created_at DESC').all(req.user!.id) });
});
router.post('/targets', requireAuth, requireRole('requester'), (req, res) => {
  const { url, label, verificationMethod } = req.body ?? {};
  if (typeof url !== 'string' || typeof label !== 'string' || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: 'Enter a complete http or https target URL and a label.' });
    return;
  }
  let parsed: URL;
  try { parsed = new URL(url); } catch { res.status(400).json({ error: 'Enter a valid target URL.' }); return; }
  const blockedHost = /(^|\.)(gov|mil|health|bank)\./i.test(parsed.hostname) || /government|military|hospital|banking/i.test(parsed.hostname);
  const id = newId('tgt');
  const status = blockedHost ? 'blocked' : 'pending';
  const verificationToken = status === 'pending' ? `penflowai-verification=${randomBytes(16).toString('hex')}` : null;
  db.prepare('INSERT INTO targets (id, owner_id, url, label, verification_method, verification_token, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, req.user!.id, parsed.origin, label.slice(0, 120), 'DNS TXT', verificationToken, status, now());
  res.status(201).json({ target: db.prepare('SELECT * FROM targets WHERE id = ? AND owner_id = ?').get(id, req.user!.id), verificationRecord: verificationToken ? { name: `_penflowai-challenge.${parsed.hostname}`, value: verificationToken } : null, message: status === 'blocked' ? 'This target is blocked by the early-access safety policy.' : 'Add the DNS TXT record, then return to verify control.' });
});
router.post('/targets/:id/verify', requireAuth, requireRole('requester'), async (req, res) => {
  const target = db.prepare('SELECT * FROM targets WHERE id = ? AND owner_id = ?').get(req.params.id, req.user!.id) as { id: string; url: string; status: string; verification_token: string | null } | undefined;
  if (!target) { res.sendStatus(404); return; }
  if (target.status === 'blocked') { res.status(409).json({ error: 'This target cannot be verified.' }); return; }
  if (target.status === 'verified') { res.json({ message: 'Target ownership is already verified.', status: target.status }); return; }
  try {
    const hostname = new URL(target.url).hostname;
    const records = await resolveTxt(`_penflowai-challenge.${hostname}`);
    const verified = records.some((record) => record.join('') === target.verification_token);
    if (!verified) { res.status(409).json({ error: `DNS TXT proof was not found at _penflowai-challenge.${hostname}.` }); return; }
    db.prepare('UPDATE targets SET status = ? WHERE id = ? AND owner_id = ?').run('verified', target.id, req.user!.id);
    res.json({ message: 'Target ownership verified.', status: 'verified' });
  } catch {
    res.status(409).json({ error: 'DNS proof could not be verified. Add the required TXT record and try again.' });
  }
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
router.get('/roe', requireAuth, requireRole('requester'), (req, res) => {
  const roes = db.prepare('SELECT * FROM roe_documents WHERE owner_id = ? ORDER BY uploaded_at DESC').all(req.user!.id) as Array<Record<string, unknown>>;
  res.json({ roes: roes.map(safeRoe) });
});
router.post('/roe', requireAuth, requireRole('requester'), upload.single('document'), (req, res) => {
  const file = req.file;
  const targetIds = typeof req.body?.targetIds === 'string' ? req.body.targetIds.split(',').filter(Boolean) : [];
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
  const placeholders = targetIds.map(() => '?').join(',');
  const targets = db.prepare(`SELECT id, url, status FROM targets WHERE owner_id = ? AND id IN (${placeholders})`).all(req.user!.id, ...targetIds) as Array<{ id: string; url: string; status: string }>;
  if (targets.length !== targetIds.length || targets.some((target) => target.status !== 'verified')) {
    res.status(400).json({ error: 'Every selected target must be verified and belong to your account.' });
    return;
  }
  mkdirSync(uploadDir, { recursive: true });
  const filePath = resolve(uploadDir, `${newId('roe')}${isPdf ? '.pdf' : '.docx'}`);
  writeFileSync(filePath, file.buffer, { flag: 'wx' });
  const id = newId('roe');
  const scope = targets.map((target) => target.url);
  db.prepare(`INSERT INTO roe_documents (id, owner_id, file_name, target_ids_json, scope_json, attestation, status, automated_decision, confidence, reasons_json, file_path, uploaded_at)
    VALUES (?, ?, ?, ?, ?, 1, 'needs_review', 'not_connected', NULL, ?, ?, ?)`) 
    .run(id, req.user!.id, file.originalname.replace(/[\\/]/g, '_').slice(0, 160), JSON.stringify(targetIds), JSON.stringify(scope), JSON.stringify(['Automated document analysis is not connected; reviewer verification is required before a scope token can be issued.']), filePath, now());
  audit(req.user!.id, 'requester', 'roe_submitted', id, 'ROE queued for manual review because automated document analysis is not connected.');
  res.status(201).json({ roe: db.prepare('SELECT * FROM roe_documents WHERE id = ? AND owner_id = ?').get(id, req.user!.id) });
});
router.get('/roe/:id', requireAuth, requireRole('requester'), (req, res) => {
  const roe = db.prepare('SELECT * FROM roe_documents WHERE id = ? AND owner_id = ?').get(req.params.id, req.user!.id) as Record<string, unknown> | undefined;
  if (!roe) { res.sendStatus(404); return; }
  res.json({ roe: safeRoe(roe) });
});

router.get('/review', requireAuth, requireRole('reviewer', 'admin'), (_req, res) => {
  const queue = db.prepare(`SELECT r.*, u.display_name AS owner_name, u.email AS owner_email FROM roe_documents r JOIN users u ON u.id = r.owner_id WHERE r.status = 'needs_review' ORDER BY r.uploaded_at`).all();
  res.json({ queue });
});
router.post('/review/:id', requireAuth, requireRole('reviewer', 'admin'), (req, res) => {
  const { decision, note } = req.body ?? {};
  if (!['approve', 'reject', 'request_correction'].includes(decision) || typeof note !== 'string' || !note.trim()) {
    res.status(400).json({ error: 'Choose a decision and provide a review note.' });
    return;
  }
  if (decision === 'reject' && !note.trim()) { res.status(400).json({ error: 'A note is required when rejecting a document.' }); return; }
  const roe = db.prepare('SELECT * FROM roe_documents WHERE id = ? AND status = ?').get(req.params.id, 'needs_review') as { id: string; owner_id: string } | undefined;
  if (!roe) { res.sendStatus(404); return; }
  const nextStatus = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'needs_review';
  const scopeToken = decision === 'approve' ? randomBytes(32).toString('hex') : null;
  const transaction = db.transaction(() => {
    db.prepare(`UPDATE roe_documents SET status = ?, reviewer_id = ?, decision = ?, note = ?, decided_at = ?, scope_token = ?, scope_token_issued_at = ? WHERE id = ?`)
      .run(nextStatus, req.user!.id, decision, note.trim().slice(0, 2000), now(), scopeToken, scopeToken ? now() : null, roe.id);
    audit(roe.owner_id, req.user!.role, 'roe_decision', roe.id, `${decision}: ${note.trim()}`, false);
  });
  transaction();
  res.json({ roe: safeRoe(db.prepare('SELECT * FROM roe_documents WHERE id = ?').get(roe.id) as Record<string, unknown>) });
});

router.get('/runs', requireAuth, requireRole('requester'), (req, res) => {
  res.json({ runs: db.prepare('SELECT * FROM runs WHERE owner_id = ? ORDER BY started_at DESC').all(req.user!.id) });
});
router.post('/runs', requireAuth, requireRole('requester'), (req, res) => {
  const roeId = req.body?.roeId;
  const roe = typeof roeId === 'string' ? db.prepare('SELECT * FROM roe_documents WHERE id = ? AND owner_id = ? AND status = ? AND scope_token IS NOT NULL').get(roeId, req.user!.id, 'approved') as { id: string; scope_json: string } | undefined : undefined;
  if (!roe) { res.status(409).json({ error: 'An approved Rules of Engagement document with a scope token is required before a test can start.' }); return; }
  const id = newId('run');
  const timestamp = now();
  db.prepare('INSERT INTO runs (id, owner_id, roe_id, status, stage, started_at, scope_json) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, req.user!.id, roe.id, 'running', 'recon', timestamp, roe.scope_json);
  audit(req.user!.id, 'requester', 'run_started', id, 'Run started within the approved ROE scope.', false, id);
  res.status(201).json({ run: db.prepare('SELECT * FROM runs WHERE id = ? AND owner_id = ?').get(id, req.user!.id), simulated: true });
});
router.get('/runs/:id', requireAuth, requireRole('requester'), (req, res) => {
  const run = db.prepare('SELECT * FROM runs WHERE id = ? AND owner_id = ?').get(req.params.id, req.user!.id);
  if (!run) { res.sendStatus(404); return; }
  const roe = db.prepare('SELECT * FROM roe_documents WHERE id = ? AND owner_id = ?').get((run as { roe_id: string }).roe_id, req.user!.id);
  const events = db.prepare('SELECT * FROM audit_events WHERE run_id = ? AND owner_id = ? ORDER BY created_at').all(req.params.id, req.user!.id);
  res.json({ run, roe: safeRoe(roe as Record<string, unknown>), events, simulated: true });
});
router.post('/runs/:id/stop', requireAuth, requireRole('requester'), (req, res) => {
  const runId = typeof req.params.id === 'string' ? req.params.id : '';
  const run = db.prepare('SELECT id FROM runs WHERE id = ? AND owner_id = ? AND status = ?').get(runId, req.user!.id, 'running');
  if (!run) { res.sendStatus(404); return; }
  db.prepare('UPDATE runs SET status = ?, finished_at = ? WHERE id = ? AND owner_id = ?').run('stopped', now(), runId, req.user!.id);
  audit(req.user!.id, 'requester', 'run_stopped', runId, 'Run stop requested.', false, runId);
  res.json({ message: 'The simulated run has been stopped.' });
});
router.get('/runs/:id/log', requireAuth, requireRole('requester'), (req, res) => {
  const runId = typeof req.params.id === 'string' ? req.params.id : '';
  if (!requireOwnedRun(runId, req.user!.id)) { res.sendStatus(404); return; }
  res.json({ events: db.prepare('SELECT * FROM audit_events WHERE run_id = ? AND owner_id = ? ORDER BY created_at').all(runId, req.user!.id) });
});
router.get('/runs/:id/findings', requireAuth, requireRole('requester'), (req, res) => {
  const runId = typeof req.params.id === 'string' ? req.params.id : '';
  if (!requireOwnedRun(runId, req.user!.id)) { res.sendStatus(404); return; }
  res.json({ findings: db.prepare(`SELECT * FROM findings WHERE run_id = ? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, type, component`).all(runId) });
});
router.get('/findings', requireAuth, requireRole('requester'), (req, res) => {
  const runId = typeof req.query.runId === 'string' ? req.query.runId : '';
  if (!requireOwnedRun(runId, req.user!.id)) { res.sendStatus(404); return; }
  res.json({ findings: db.prepare(`SELECT * FROM findings WHERE run_id = ? ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, type, component`).all(runId) });
});
router.get('/reports', requireAuth, requireRole('requester'), (req, res) => {
  res.json({ reports: db.prepare('SELECT id, run_id, generated_at FROM reports WHERE owner_id = ? ORDER BY generated_at DESC').all(req.user!.id) });
});
router.get('/reports/:id', requireAuth, requireRole('requester'), (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ? AND owner_id = ?').get(req.params.id, req.user!.id);
  if (!report) { res.sendStatus(404); return; }
  res.json({ report });
});
router.get('/audit', requireAuth, requireRole('requester'), (req, res) => {
  const actor = typeof req.query.actor === 'string' ? req.query.actor : '';
  const blockedOnly = req.query.blocked === 'true';
  const clauses = ['owner_id = ?'];
  const params: (string | number)[] = [req.user!.id];
  if (actor) { clauses.push('actor = ?'); params.push(actor); }
  if (blockedOnly) clauses.push('blocked = 1');
  res.json({ events: db.prepare(`SELECT * FROM audit_events WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC`).all(...params) });
});

router.get('/billing', requireAuth, requireRole('requester'), (req, res) => {
  const plan = plans.find((item) => item.id === req.user!.plan_id) ?? plans[0];
  const used = db.prepare('SELECT COUNT(*) AS count FROM runs WHERE owner_id = ?').get(req.user!.id) as { count: number };
  const requests = db.prepare('SELECT * FROM plan_change_requests WHERE user_id = ? ORDER BY created_at DESC').all(req.user!.id);
  res.json({ plan, scansUsed: used.count, invoices: [], planRequests: requests });
});
router.post('/billing/plan-requests', requireAuth, requireRole('requester'), (req, res) => {
  const planId = req.body?.planId;
  if (typeof planId !== 'string' || !plans.some((plan) => plan.id === planId)) { res.status(400).json({ error: 'Choose a listed plan.' }); return; }
  const id = newId('pcr');
  db.prepare('INSERT INTO plan_change_requests (id, user_id, plan_id, status, created_at) VALUES (?, ?, ?, ?, ?)').run(id, req.user!.id, planId, 'pending_activation', now());
  audit(req.user!.id, req.user!.role, 'plan_change_requested', planId, 'Billing is not live; plan request recorded as pending activation.');
  res.status(201).json({ request: db.prepare('SELECT * FROM plan_change_requests WHERE id = ?').get(id), message: 'Billing is not live during early access. Your plan request is recorded and we will email you at launch.' });
});
router.post('/billing/plan-requests/:id/cancel', requireAuth, requireRole('requester'), (req, res) => {
  const requestId = typeof req.params.id === 'string' ? req.params.id : '';
  const changed = db.prepare(`UPDATE plan_change_requests SET status = 'cancelled', cancelled_at = ? WHERE id = ? AND user_id = ? AND status = 'pending_activation'`).run(now(), requestId, req.user!.id);
  if (changed.changes === 0) { res.sendStatus(404); return; }
  audit(req.user!.id, req.user!.role, 'plan_change_cancelled', requestId, 'Pending plan request cancelled.');
  res.json({ message: 'Plan request cancelled.' });
});

router.get('/me/export', requireAuth, (req, res) => {
  const ownerId = req.user!.id;
  res.json({ user: safeUser(req.user!), targets: db.prepare('SELECT * FROM targets WHERE owner_id = ?').all(ownerId), roes: db.prepare('SELECT id, file_name, status, uploaded_at FROM roe_documents WHERE owner_id = ?').all(ownerId), runs: db.prepare('SELECT * FROM runs WHERE owner_id = ?').all(ownerId), reports: db.prepare('SELECT * FROM reports WHERE owner_id = ?').all(ownerId) });
});
router.delete('/me', requireAuth, (req, res) => {
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user!.id);
  res.clearCookie('pf_session', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  res.status(204).end();
});
router.put('/me', requireAuth, (req, res) => {
  const displayName = typeof req.body?.displayName === 'string' ? req.body.displayName.trim().slice(0, 100) : '';
  if (!displayName) { res.status(400).json({ error: 'Enter a display name.' }); return; }
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName, req.user!.id);
  res.json({ user: safeUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as SessionUser) });
});

router.post('/waitlist', (req, res) => {
  const { email, name, role, updatesOptIn } = req.body ?? {};
  if (typeof email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { res.status(400).json({ error: 'Enter a valid email address.', fields: { email: 'Enter a valid email address.' } }); return; }
  try {
    db.prepare('INSERT INTO waitlist (id, email, name, role_description, updates_opt_in, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(newId('wl'), email.trim().toLowerCase(), typeof name === 'string' ? name.trim().slice(0, 100) || null : null, typeof role === 'string' ? role.slice(0, 100) : null, updatesOptIn === true ? 1 : 0, now());
  } catch {
    res.status(400).json({ error: 'This email cannot be added to the waitlist.' });
    return;
  }
  res.status(201).json({ message: 'You are on the early access waitlist.' });
});

router.post('/dev/role-switch', requireAuth, (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.VITE_DEV_ROLE_SWITCH !== 'true') { res.sendStatus(404); return; }
  const role = req.body?.role;
  const userIds: Record<string, string> = { requester: 'usr_ayesha', reviewer: 'usr_sana', admin: 'usr_admin' };
  if (typeof role !== 'string' || !userIds[role]) { res.status(400).json({ error: 'Choose a seeded role.' }); return; }
  const nextUser = db.prepare('SELECT * FROM users WHERE id = ?').get(userIds[role]) as SessionUser;
  const transaction = db.transaction(() => {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(req.sessionId);
    issueSession(nextUser.id, res);
    audit(req.user!.id, req.user!.role, 'development_role_switch', role, 'Development control re-issued the session for a seeded account.');
  });
  transaction();
  res.json({ user: safeUser(nextUser) });
});

router.get('/admin/users', requireAuth, requireRole('admin'), (_req, res) => {
  res.json({
    users: db.prepare('SELECT id, email, display_name, role, email_verified, plan_id, created_at FROM users ORDER BY created_at').all(),
    waitlist: db.prepare('SELECT id, email, name, role_description, updates_opt_in, created_at FROM waitlist ORDER BY created_at').all(),
  });
});
router.get('/admin/tools', requireAuth, requireRole('admin'), (_req, res) => res.json({ tools: [{ name: 'Scope Guard', status: 'in progress' }, { name: 'Recon adapter', status: 'planned' }, { name: 'Scan engine', status: 'not connected' }] }));
router.get('/admin/models', requireAuth, requireRole('admin'), (_req, res) => res.json({ models: [{ name: 'GPT-OSS', status: 'not connected' }, { name: 'Risk scorer', status: 'simulated data only' }] }));
router.get('/admin/audit-log', requireAuth, requireRole('admin'), (_req, res) => res.json({ events: db.prepare('SELECT * FROM audit_events ORDER BY created_at DESC').all() }));

export default router;
