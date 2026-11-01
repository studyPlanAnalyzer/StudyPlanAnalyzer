import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'crypto';
import {
  GoogleKeysUnavailableError,
  setGoogleKeySourceForTests,
  verifyGoogleIdToken,
} from '@/lib/auth/google-token';
import { CLIENT_ID, googleToken, keySet, makeKey } from './google-fixtures';

// Checking Google ID tokens, with a local key pair in place of Google's keys.

const key = makeKey('key-1');
const verify = (t: string) => verifyGoogleIdToken(t, CLIENT_ID);

describe('Google ID token checks', () => {
  beforeEach(() => setGoogleKeySourceForTests(keySet(key)));
  after(() => setGoogleKeySourceForTests(null));

  test('a valid token gives the identity', async () => {
    assert.deepEqual(await verify(googleToken(key)), {
      sub: '1000000000000000001',
      email: 'parent@gmail.com',
      name: 'Sita Sharma',
    });
  });
  test('both Google issuer spellings are accepted', async () => {
    assert.ok(await verify(googleToken(key, { iss: 'accounts.google.com' })));
  });
  test('wrong audience: rejected', async () => {
    assert.equal(await verify(googleToken(key, { aud: 'someone-else.apps.googleusercontent.com' })), null);
  });
  test('wrong issuer: rejected', async () => {
    assert.equal(await verify(googleToken(key, { iss: 'https://evil.example' })), null);
  });
  test('expired: rejected', async () => {
    assert.equal(await verify(googleToken(key, {}, { expiresIn: -600 })), null);
  });
  test('email not verified: rejected', async () => {
    assert.equal(await verify(googleToken(key, { email_verified: false })), null);
    assert.equal(await verify(googleToken(key, { email_verified: undefined })), null);
  });
  test('missing sub or email: rejected', async () => {
    assert.equal(await verify(googleToken(key, { sub: '' })), null);
    assert.equal(await verify(googleToken(key, { email: undefined })), null);
  });
  test('tampered payload or signature: rejected', async () => {
    const [h, p, s] = googleToken(key).split('.');
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), sub: 'someone-else' })).toString('base64url');
    assert.equal(await verify(`${h}.${forged}.${s}`), null);
    assert.equal(await verify(`${h}.${p}.${s.slice(0, -4)}AAAA`), null);
  });
  test('signed by a key that is not Google\'s: rejected', async () => {
    const stranger = makeKey('key-1'); // same key id, different key
    assert.equal(await verify(googleToken(stranger)), null);
  });
  test('only RS256: "none" and HMAC (algorithm confusion) are rejected', async () => {
    const none = `${Buffer.from(JSON.stringify({ alg: 'none', kid: 'key-1' })).toString('base64url')}.${googleToken(key).split('.')[1]}.`;
    assert.equal(await verify(none), null);
    // An HS256 token whose "secret" is Google's public key.
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', kid: 'key-1', typ: 'JWT' })).toString('base64url');
    const payload = googleToken(key).split('.')[1];
    const sig = createHmac('sha256', JSON.stringify(key.jwk)).update(`${header}.${payload}`).digest('base64url');
    assert.equal(await verify(`${header}.${payload}.${sig}`), null);
  });
  test('missing, garbage or oversized token: rejected', async () => {
    assert.equal(await verify(''), null);
    assert.equal(await verify('not-a-jwt'), null);
    assert.equal(await verify('a'.repeat(5000)), null);
  });
  test('no client id configured: rejected', async () => {
    assert.equal(await verifyGoogleIdToken(googleToken(key), ''), null);
  });
});

describe('Google key cache', () => {
  after(() => setGoogleKeySourceForTests(null));

  test('keys are fetched once and reused', async () => {
    let fetches = 0;
    setGoogleKeySourceForTests(async () => { fetches++; return keySet(key)(); });
    await verify(googleToken(key));
    await verify(googleToken(key));
    assert.equal(fetches, 1);
  });
  test('an unknown key id (Google rotated) triggers one refetch', async () => {
    const rotated = makeKey('key-2');
    let fetches = 0;
    setGoogleKeySourceForTests(async () => (++fetches === 1 ? keySet(key)() : keySet(key, rotated)()), { minRefetchMs: 0 });
    assert.ok(await verify(googleToken(key)));
    assert.ok(await verify(googleToken(rotated)));
    assert.equal(fetches, 2);
  });
  test('random key ids can\'t make it refetch more than once a minute', async () => {
    let fetches = 0;
    setGoogleKeySourceForTests(async () => { fetches++; return keySet(key)(); });
    await verify(googleToken(key));
    for (let i = 0; i < 5; i++) assert.equal(await verify(googleToken(makeKey(`random-${i}`))), null);
    assert.equal(fetches, 1);
  });
  test('Google unreachable: a distinct error, not a rejected token', async () => {
    setGoogleKeySourceForTests(async () => { throw new GoogleKeysUnavailableError('offline'); });
    await assert.rejects(verify(googleToken(key)), GoogleKeysUnavailableError);
  });
});
