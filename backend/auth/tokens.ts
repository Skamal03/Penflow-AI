import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { one, run } from '../db/index.js';

export type EmailTokenPurpose = 'verify_email' | 'reset_password';

const ttlMs: Record<EmailTokenPurpose, number> = {
  verify_email: 24 * 60 * 60 * 1000,
  reset_password: 30 * 60 * 1000,
};

export const sha256 = (value: string): string => createHash('sha256').update(value).digest('hex');

export function newEmailToken(): string {
  return randomBytes(32).toString('base64url');
}

export async function invalidateEmailTokens(userId: string, purpose: EmailTokenPurpose): Promise<void> {
  await run('UPDATE email_tokens SET used_at = $1 WHERE user_id = $2 AND purpose = $3 AND used_at IS NULL', [new Date(), userId, purpose]);
}

export async function persistEmailToken(userId: string, purpose: EmailTokenPurpose, token: string, ip: string | null): Promise<void> {
  const createdAt = new Date();
  await run('INSERT INTO email_tokens (id, user_id, purpose, token_hash, expires_at, used_at, created_at, ip) VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)', [
    randomUUID(),
    userId,
    purpose,
    sha256(token),
    new Date(createdAt.getTime() + ttlMs[purpose]),
    createdAt,
    ip,
  ]);
}

export async function issueEmailToken(userId: string, purpose: EmailTokenPurpose, ip: string | null): Promise<string> {
  const token = newEmailToken();
  await invalidateEmailTokens(userId, purpose);
  await persistEmailToken(userId, purpose, token, ip);
  return token;
}

export async function consumeEmailToken(token: string, purpose: EmailTokenPurpose): Promise<{ id: string; userId: string } | null> {
  const tokenHash = sha256(token);
  const row = await one<{ id: string; user_id: string; token_hash: string }>('SELECT id, user_id, token_hash FROM email_tokens WHERE token_hash = $1 AND purpose = $2', [tokenHash, purpose]);
  if (!row) return null;
  if (!timingSafeEqual(Buffer.from(row.token_hash), Buffer.from(tokenHash))) return null;
  const consumed = await run('UPDATE email_tokens SET used_at = $1 WHERE id = $2 AND used_at IS NULL AND expires_at > $1', [new Date(), row.id]);
  return consumed === 1 ? { id: row.id, userId: row.user_id } : null;
}
