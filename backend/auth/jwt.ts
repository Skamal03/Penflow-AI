import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export type Role = 'requester' | 'reviewer' | 'admin';

export type AccessClaims = {
  sub: string;
  role: Role;
  sid: string;
  iat: number;
  exp: number;
  jti: string;
};

const roles: Role[] = ['requester', 'reviewer', 'admin'];
const encode = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');

function secret(): string {
  const value = process.env.JWT_SECRET;
  if (!value || Buffer.byteLength(value, 'utf8') < 32) throw new Error('JWT_SECRET must be at least 32 bytes.');
  return value;
}

export function assertJwtSecret(): void {
  secret();
}

export function accessTtlSeconds(): number {
  return Number(process.env.ACCESS_TTL_MIN ?? 15) * 60;
}

export function signAccessToken(user: { id: string; role: Role }, sessionId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ sub: user.id, role: user.role, sid: sessionId, iat: now, exp: now + accessTtlSeconds(), jti: randomUUID() });
  const signature = createHmac('sha256', secret()).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifyAccessToken(token: string): AccessClaims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts as [string, string, string];
  let algorithm: unknown;
  try {
    algorithm = (JSON.parse(Buffer.from(header, 'base64url').toString('utf8')) as { alg?: unknown }).alg;
  } catch {
    return null;
  }
  if (algorithm !== 'HS256') return null;
  const expected = createHmac('sha256', secret()).update(`${header}.${payload}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let claims: AccessClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as AccessClaims;
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now) return null;
  if (typeof claims.iat !== 'number' || claims.iat > now + 60) return null;
  if (typeof claims.sub !== 'string' || typeof claims.sid !== 'string' || typeof claims.jti !== 'string') return null;
  if (!roles.includes(claims.role)) return null;
  return claims;
}
