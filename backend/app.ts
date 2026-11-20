import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { authenticate, type SessionUser } from './auth/deps.js';
import { assertJwtSecret } from './auth/jwt.js';
import api from './routes/api.js';

assertJwtSecret();

const app = express();
const origins = (process.env.CORS_ORIGINS ?? 'http://127.0.0.1:5173,http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
const publicRoutes = new Set([
  'POST /auth/register',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/forgot-password',
  'POST /auth/reset-password',
  'POST /auth/verify-email',
  'GET /health',
  'GET /plans',
  'POST /waitlist',
]);

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
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginEmbedderPolicy: false,
}));
app.use(cors({
  origin: (origin, callback) => callback(null, !origin || origins.includes(origin)),
  credentials: true,
  allowedHeaders: ['content-type', 'x-requested-with'],
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    next();
    return;
  }
  if (req.get('x-requested-with') !== 'fetch') {
    res.status(403).json({ error: 'Request could not be verified. Refresh the page and try again.' });
    return;
  }
  const origin = req.get('origin');
  if (origin && !origins.includes(origin)) {
    res.status(403).json({ error: 'Request could not be verified. Refresh the page and try again.' });
    return;
  }
  const referer = req.get('referer');
  if (!origin && referer) {
    let refererOrigin = '';
    try { refererOrigin = new URL(referer).origin; } catch { refererOrigin = ''; }
    if (!origins.includes(refererOrigin)) {
      res.status(403).json({ error: 'Request could not be verified. Refresh the page and try again.' });
      return;
    }
  }
  next();
});
app.use('/api/auth', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api', (req, res, next) => {
  if (publicRoutes.has(`${req.method} ${req.path}`)) {
    next();
    return;
  }
  authenticate(req)
    .then((authenticated) => {
      if (!authenticated) {
        res.status(401).json({ error: 'Sign in to continue.' });
        return;
      }
      next();
    })
    .catch(next);
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

export type { SessionUser };
export default app;
