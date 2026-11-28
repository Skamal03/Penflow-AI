import { one, run } from '../db/index.js';

const retentionMs = 24 * 60 * 60 * 1000;

export async function hitRateLimit(bucket: string, limit: number, windowMs: number): Promise<boolean> {
  if (process.env.NODE_ENV === 'test') return true;
  const timestamp = new Date();
  const cutoff = new Date(timestamp.getTime() - windowMs);
  await run('DELETE FROM rate_events WHERE created_at < $1', [new Date(timestamp.getTime() - retentionMs)]);
  const used = await one<{ count: number }>('SELECT COUNT(*)::int AS count FROM rate_events WHERE bucket = $1 AND created_at >= $2', [bucket, cutoff]);
  if ((used?.count ?? 0) >= limit) return false;
  await run('INSERT INTO rate_events (bucket, created_at) VALUES ($1, $2)', [bucket, timestamp]);
  return true;
}