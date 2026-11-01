import { generateKeyPairSync, type KeyObject } from 'crypto';
import jwt from 'jsonwebtoken';
import type { GoogleKeySet } from '@/lib/auth/google-token';

// A stand-in for Google: a locally made RSA key pair, its public key served
// as a JWK set from memory, and ID tokens signed the way Google signs them.
// Nothing here touches the network.

export const CLIENT_ID = 'test-client.apps.googleusercontent.com';

export function makeKey(kid: string) {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } };
}

export type TestKey = ReturnType<typeof makeKey>;

export const keySet = (...keys: TestKey[]) => async (): Promise<GoogleKeySet> => ({
  keys: keys.map((k) => k.jwk),
  maxAgeSeconds: 3600,
});

export function googleToken(
  key: { kid: string; privateKey: KeyObject },
  claims: Record<string, unknown> = {},
  opts: { expiresIn?: number; algorithm?: jwt.Algorithm } = {},
) {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    {
      iss: 'https://accounts.google.com',
      aud: CLIENT_ID,
      sub: '1000000000000000001',
      email: 'parent@gmail.com',
      email_verified: true,
      name: 'Sita Sharma',
      iat: now,
      exp: now + (opts.expiresIn ?? 3600),
      ...claims,
    },
    key.privateKey,
    { algorithm: opts.algorithm ?? 'RS256', keyid: key.kid },
  );
}
