import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

const here = dirname(fileURLToPath(import.meta.url));

export const connectionString = process.env.DATABASE_URL ?? 'postgres://penflow:penflow@127.0.0.1:5432/penflow';
export const pool = new Pool({ connectionString, max: 10 });

export async function query<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function one<T extends QueryResultRow>(text: string, params: unknown[] = []): Promise<T | undefined> {
  const result = await pool.query<T>(text, params);
  return result.rows[0];
}

export async function run(text: string, params: unknown[] = []): Promise<number> {
  const result = await pool.query(text, params);
  return result.rowCount ?? 0;
}

export async function transaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function migrate(): Promise<void> {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL)');
  const applied = new Set((await query<{ version: number }>('SELECT version FROM schema_migrations')).map((row) => row.version));
  const migrations = [
    resolve(here, 'migrations/001_initial.sql'),
    resolve(here, 'migrations/002_verification.sql'),
    resolve(here, 'migrations/003_email_tokens.sql'),
    resolve(here, 'migrations/004_auth_hardening.sql'),
    resolve(here, 'migrations/005_report_json.sql'),
    resolve(here, 'migrations/006_roe_validation.sql'),
  ];
  for (const [index, path] of migrations.entries()) {
    const version = index + 1;
    if (applied.has(version)) continue;
    const sql = readFileSync(path, 'utf8');
    await transaction(async (client) => {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version, applied_at) VALUES ($1, $2)', [version, new Date()]);
    });
  }
}
