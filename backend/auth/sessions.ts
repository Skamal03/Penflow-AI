import { randomBytes, randomUUID } from 'node:crypto';
import type { Response } from 'express';
import { one, query, run, transaction } from '../db/index.js';
import { sha256 } from './tokens.js';
import { accessTtlSeconds, signAccessToken, type Role } from './jwt.js';

const idleMs = 30 * 60 * 1000;
const absoluteMs = Number(process.env.REFRESH_TTL_DAYS ?? 7) * 24 * 60 * 60 * 1000;
const refreshPath = '/api/auth/refresh';

export type SessionMeta = { ip: string | null; userAgent: string | null };

const cookieOptions = (maxAge: number, path: string) => ({ httpOnly: true, sameSite: 'lax' as const, secure: process.env.COOKIE_SECURE === 'true', maxAge, path });

export function setAuthCookies(res: Response, user: { id: string; role: Role }, sessionId: string, refreshToken: string): void {
  res.cookie('pf_access', signAccessToken(user, sessionId), cookieOptions(accessTtlSeconds() * 1000, '/'));
  res.cookie('pf_refresh', refreshToken, cookieOptions(absoluteMs, refreshPath));
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie('pf_access', { path: '/' });
  res.clearCookie('pf_refresh', { path: refreshPath });
}

export async function createSession(user: { id: string; role: Role }, meta: SessionMeta, res: Response): Promise<void> {
  const refreshToken = randomBytes(32).toString('base64url');
  const sessionId = randomUUID();
  const createdAt = new Date();
  await run('INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip, created_at, expires_at, last_used_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $6)', [
    sessionId,
    user.id,
    sha256(refreshToken),
    meta.userAgent,
    meta.ip,
    createdAt,
    new Date(createdAt.getTime() + absoluteMs),
  ]);
  setAuthCookies(res, user, sessionId, refreshToken);
}

export type RotationResult =
  | { status: 'rotated'; userId: string; role: Role; sessionId: string }
  | { status: 'reuse'; userId: string }
  | { status: 'invalid' };

export async function rotateSession(refreshToken: string, meta: SessionMeta, res: Response): Promise<RotationResult> {
  const session = await one<{ id: string; user_id: string; role: Role; is_active: boolean; replaced_by: string | null; revoked_at: Date | null; expires_at: Date; last_used_at: Date }>(
    `SELECT s.id, s.user_id, s.replaced_by, s.revoked_at, s.expires_at, s.last_used_at, u.role, u.is_active
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.refresh_token_hash = $1`,
    [sha256(refreshToken)],
  );
  if (!session) return { status: 'invalid' };
  const now = new Date();
  if (session.replaced_by) {
    await run('UPDATE sessions SET revoked_at = COALESCE(revoked_at, $1) WHERE user_id = $2', [now, session.user_id]);
    return { status: 'reuse', userId: session.user_id };
  }
  if (!session.is_active || session.revoked_at || session.expires_at.getTime() <= now.getTime() || now.getTime() - session.last_used_at.getTime() > idleMs) {
    await run('UPDATE sessions SET revoked_at = COALESCE(revoked_at, $1) WHERE id = $2', [now, session.id]);
    return { status: 'invalid' };
  }
  const nextToken = randomBytes(32).toString('base64url');
  const nextId = randomUUID();
  try {
    await transaction(async (client) => {
      await client.query('INSERT INTO sessions (id, user_id, refresh_token_hash, user_agent, ip, created_at, expires_at, last_used_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $6)', [
        nextId,
        session.user_id,
        sha256(nextToken),
        meta.userAgent,
        meta.ip,
        now,
        session.expires_at,
      ]);
      const rotated = await client.query('UPDATE sessions SET revoked_at = $1, replaced_by = $2 WHERE id = $3 AND replaced_by IS NULL AND revoked_at IS NULL', [now, nextId, session.id]);
      if (rotated.rowCount !== 1) throw new Error('rotation_conflict');
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== 'rotation_conflict') throw error;
    await run('UPDATE sessions SET revoked_at = COALESCE(revoked_at, $1) WHERE user_id = $2', [now, session.user_id]);
    return { status: 'reuse', userId: session.user_id };
  }
  setAuthCookies(res, { id: session.user_id, role: session.role }, nextId, nextToken);
  return { status: 'rotated', userId: session.user_id, role: session.role, sessionId: nextId };
}

export async function revokeSession(userId: string, sessionId: string): Promise<boolean> {
  const changed = await run('UPDATE sessions SET revoked_at = $1 WHERE id = $2 AND user_id = $3 AND revoked_at IS NULL', [new Date(), sessionId, userId]);
  return changed === 1;
}

export async function revokeAllSessions(userId: string): Promise<number> {
  return run('UPDATE sessions SET revoked_at = $1 WHERE user_id = $2 AND revoked_at IS NULL', [new Date(), userId]);
}

export async function listSessions(userId: string, currentSessionId: string) {
  const rows = await query<{ id: string; ip: string | null; user_agent: string | null; created_at: Date; last_used_at: Date; expires_at: Date }>(
    'SELECT id, ip, user_agent, created_at, last_used_at, expires_at FROM sessions WHERE user_id = $1 AND revoked_at IS NULL AND expires_at > $2 ORDER BY created_at DESC',
    [userId, new Date()],
  );
  return rows.map((row) => ({ ...row, current: row.id === currentSessionId }));
}
