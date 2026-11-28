import pg from 'pg';
try { process.loadEnvFile('.env'); } catch {}
const id = process.argv[2];
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const q = async (label, sql) => { try { console.log(label, (await c.query(sql, [id])).rows); } catch (e) { console.log(label, 'ERROR', e.message); } };
await q('run', 'select id, status from runs where id = $1');
await q('findings', 'select count(*) from findings where run_id = $1');
await q('reports', 'select count(*) from reports where run_id = $1');
await q('audit', 'select decision, count(*) from scope_audit_log where run_id = $1 group by 1');
await c.end();