import pg from 'pg';
try { process.loadEnvFile('.env'); } catch {}
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(
  "select table_name, column_name, data_type, is_nullable from information_schema.columns where table_name in ('findings','reports','runs') order by table_name, ordinal_position"
);
for (const t of ['runs', 'reports', 'findings']) {
  const r = await c.query("select conname, pg_get_constraintdef(oid) as def from pg_constraint where conrelid = $1::regclass and contype in ('c','u')", [t]);
  console.log(t, r.rows);
}
console.table(r.rows);
await c.end();