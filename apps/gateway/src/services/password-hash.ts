import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const digest = scryptSync(password, salt, 64).toString('hex');

  return `${salt}:${digest}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, digest] = storedHash.split(':');

  if (!salt || !digest) {
    return false;
  }

  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(digest, 'hex');

  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}
