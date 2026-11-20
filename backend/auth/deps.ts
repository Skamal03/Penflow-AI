import type { NextFunction, Request, Response } from 'express';
import { one } from '../db/index.js';
import { audit } from '../db/audit.js';
import { verifyAccessToken } from './jwt.js';

export type SessionUser = {
  id: string;
  email: string;
  display_name: string;
  role: 'requester' | 'reviewer' | 'admin';
  email_verified: boolean;
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

const idleMs = 30 * 60 * 1000;

export async function authenticate(req: Request): Promise<boolean> {
  const token = req.cookies?.pf_access;
  if (typeof token !== 'string') return false;
  const claims = verifyAccessToken(token);
  if (!claims) return false;
  const row = await one<SessionUser & { session_id: string; revoked_at: Date | null; expires_at: Date; last_used_at: Date; is_active: boolean }>(
    `SELECT s.id AS session_id, s.revoked_at, s.expires_at, s.last_used_at, u.id, u.email, u.display_name, u.role, u.email_verified, u.plan_id, u.account_type, u.is_active
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = $1 AND s.user_id = $2`,
    [claims.sid, claims.sub],
  );
  if (!row) return false;
  const now = Date.now();
  if (row.revoked_at || row.expires_at.getTime() <= now || now - row.last_used_at.getTime() > idleMs || !row.is_active) return false;
  req.user = row;
  req.sessionId = row.session_id;
  return true;
}

export function requireVerified(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in to continue.' });
    return;
  }
  if (!req.user.email_verified) {
    res.status(403).json({ error: 'Verify your email address before starting a test.' });
    return;
  }
  next();
}

export function requireRole(...roles: SessionUser['role'][]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;
    if (!user) {
      res.status(401).json({ error: 'Sign in to continue.' });
      return;
    }
    const allowed = roles.includes(user.role);
    audit(user.id, user.role, 'role_decision', req.originalUrl, allowed ? `Allowed for ${user.role}.` : `Denied for ${user.role}; required ${roles.join(' or ')}.`)
      .then(() => {
        if (!allowed) {
          res.status(403).json({ error: 'Your role cannot access this resource.' });
          return;
        }
        next();
      })
      .catch(next);
  };
}
