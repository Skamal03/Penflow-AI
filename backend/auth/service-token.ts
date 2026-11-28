import { timingSafeEqual } from 'node:crypto';

export type ServiceTokenStatus = 'valid' | 'invalid' | 'unconfigured';

export function verifyServiceToken(header: string | undefined): ServiceTokenStatus {
  const expected = process.env.PENFLOW_SERVICE_TOKEN;
  if (!expected || Buffer.byteLength(expected, 'utf8') < 32) return 'unconfigured';
  if (!header?.startsWith('Bearer ')) return 'invalid';
  const actual = Buffer.from(header.slice(7), 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (actual.length !== expectedBytes.length || !timingSafeEqual(actual, expectedBytes)) return 'invalid';
  return 'valid';
}
