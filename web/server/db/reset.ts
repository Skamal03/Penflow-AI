import Database from 'better-sqlite3';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { databasePath, db, migrate } from './index.js';
import { seed } from './seed.ts';

db.close();
mkdirSync(dirname(databasePath), { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  if (existsSync(databasePath + suffix)) rmSync(databasePath + suffix);
}
const fresh = new Database(databasePath);
fresh.pragma('foreign_keys = ON');
migrate(fresh);
seed(fresh);
const tables = ['schema_migrations', 'users', 'sessions', 'login_attempts', 'targets', 'roe_documents', 'runs', 'findings', 'reports', 'audit_events', 'waitlist', 'plan_change_requests', 'password_reset_tokens', 'email_verification_tokens'];
tables.forEach((table) => {
  const count = fresh.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
  process.stdout.write(`${table}: ${count.count}\n`);
});
fresh.close();
