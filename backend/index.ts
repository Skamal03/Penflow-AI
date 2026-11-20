import { migrate, one, pool, transaction } from './db/index.js';
import { seed } from './db/seed.js';
import app from './app.js';

await migrate();
const seededUsers = await one<{ count: number }>('SELECT COUNT(*)::int AS count FROM users');
if ((seededUsers?.count ?? 0) === 0) await transaction((client) => seed(client));

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, '127.0.0.1', () => {
  process.stdout.write(`PenflowAI API listening at http://127.0.0.1:${port}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => {
    void pool.end().finally(() => process.exit(0));
  }));
}
