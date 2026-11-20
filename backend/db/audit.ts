import { randomUUID } from 'node:crypto';
import { run } from './index.js';

export async function audit(ownerId: string | null, actor: string, action: string, target: string, detail: string, blocked = false, runId: string | null = null, client?: { query: (text: string, params: unknown[]) => Promise<unknown> }): Promise<void> {
  const sql = 'INSERT INTO audit_events (id, owner_id, run_id, actor, action, target, blocked, detail, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)';
  const params = [randomUUID(), ownerId, runId, actor, action, target, blocked, detail, new Date()];
  if (client) await client.query(sql, params);
  else await run(sql, params);
}

export async function auditAuth(userId: string | null, event: string, target: string, detail: string, ip: string | null, userAgent: string | null, client?: { query: (text: string, params: unknown[]) => Promise<unknown> }): Promise<void> {
  const sql = 'INSERT INTO audit_events (id, owner_id, run_id, actor, action, target, blocked, detail, created_at, ip, user_agent) VALUES ($1, $2, NULL, $3, $4, $5, FALSE, $6, $7, $8, $9)';
  const params = [randomUUID(), userId, 'auth', event, target, detail, new Date(), ip, userAgent];
  if (client) await client.query(sql, params);
  else await run(sql, params);
}
