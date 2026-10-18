import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const databasePath = resolve(here, '../data/penflow.db');
mkdirSync(dirname(databasePath), { recursive: true });
export const db = new Database(databasePath);
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

export function migrate(database: Database.Database = db): void {
  database.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  const applied = new Set(database.prepare('SELECT version FROM schema_migrations').all().map((row) => (row as { version: number }).version));
  const migrations = [
    resolve(here, 'migrations/001_initial.sql'),
    resolve(here, 'migrations/002_verification.sql'),
  ];
  migrations.forEach((path, index) => {
    const version = index + 1;
    if (applied.has(version)) return;
    const sql = readFileSync(path, 'utf8');
    const transaction = database.transaction(() => {
      database.exec(sql);
      database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString());
    });
    transaction();
  });
}
