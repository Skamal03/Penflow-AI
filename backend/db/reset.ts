import { migrate, one, pool, transaction } from './index.js';
import { seed } from './seed.js';

const tables = ['schema_migrations', 'users', 'sessions', 'login_attempts', 'targets', 'roe_verifications', 'roe_documents', 'scope_audit_log', 'runs', 'scope_tool_settings', 'scope_policies', 'findings', 'reports', 'audit_events', 'waitlist', 'plan_change_requests', 'email_tokens', 'rate_events'];

for (const table of tables) await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
await pool.query('DROP FUNCTION IF EXISTS runs_require_approved_roe() CASCADE');
await migrate();
await transaction((client) => seed(client));
for (const table of tables) {
  const row = await one<{ count: number }>(`SELECT COUNT(*)::int AS count FROM ${table}`);
  process.stdout.write(`${table}: ${row?.count ?? 0}\n`);
}
await pool.end();
