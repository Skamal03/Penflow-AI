import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { timingSafeEqual } from 'node:crypto';
import { db, migrate } from './db/index.js';
import { seed } from './db/seed.js';
import api from './routes/api.js';

migrate();
const seededUsers = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };
if (seededUsers.count === 0) seed(db);

const app = express();
const port = Number(process.env.PORT ?? 4000);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      fontSrc: ["'self'"],
      connectSrc: ["'self'", 'ws://127.0.0.1:5173'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      formAction: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', (req, res, next) => {
  if (req.method === 'GET') {
    next();
    return;
  }
  const cookieToken = req.cookies?.pf_csrf;
  const headerToken = req.get('x-csrf-token');
  if (typeof cookieToken !== 'string' || typeof headerToken !== 'string' || cookieToken.length !== headerToken.length || !timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken))) {
    res.status(403).json({ error: 'Request could not be verified. Refresh the page and try again.' });
    return;
  }
  next();
});
app.use('/api', api);
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (error instanceof Error && error.name === 'MulterError') {
    res.status(400).json({ error: 'The ROE upload is too large or contains too many files. Limit: one file up to 5 MB.' });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'The request could not be completed. Try again.' });
});

const server = app.listen(port, '127.0.0.1', () => {
  process.stdout.write(`PenflowAI API listening at http://127.0.0.1:${port}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => server.close(() => {
    db.close();
    process.exit(0);
  }));
}
