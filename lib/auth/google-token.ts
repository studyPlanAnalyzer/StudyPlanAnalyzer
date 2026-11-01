import { createPublicKey, type JsonWebKey, type KeyObject } from 'crypto';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Checking a Google ID token ("Sign in with Google"), on the server, every
// time. Nothing the browser says about who someone is is trusted; only a
// token that passes all of these:
//
//   - signed with RS256 (no other algorithm), by one of Google's published
//     keys, picked by the token's key id
//   - iss is Google: https://accounts.google.com or accounts.google.com
//   - aud is this app's GOOGLE_CLIENT_ID
//   - not expired (30 seconds of clock tolerance)
//   - email_verified is true, and sub and email are present
//
// Google's keys are cached for as long as Google says (Cache-Control
// max-age). A token with an unknown key id (Google rotates keys) triggers one
// fresh fetch, at most once a minute, so random key ids can't make this
// server hammer Google.
// ---------------------------------------------------------------------------

export const GOOGLE_ISSUERS: [string, ...string[]] = ['https://accounts.google.com', 'accounts.google.com'];
const GOOGLE_KEYS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const CLOCK_TOLERANCE_SECONDS = 30;
const MAX_TOKEN_LENGTH = 4096;

export type GoogleKeySet = { keys: (JsonWebKey & { kid?: string })[]; maxAgeSeconds: number };
export type GoogleKeySource = () => Promise<GoogleKeySet>;

export class GoogleKeysUnavailableError extends Error {}

async function fetchGoogleKeys(): Promise<GoogleKeySet> {
  let res: Response;
  try {
    res = await fetch(GOOGLE_KEYS_URL, { cache: 'no-store' });
  } catch (err) {
    throw new GoogleKeysUnavailableError(`Could not reach Google's keys: ${String(err)}`);
  }
  if (!res.ok) throw new GoogleKeysUnavailableError(`Google's keys answered ${res.status}`);
  const body = (await res.json()) as { keys?: GoogleKeySet['keys'] };
  const maxAge = /max-age=(\d+)/.exec(res.headers.get('cache-control') ?? '')?.[1];
  return { keys: body.keys ?? [], maxAgeSeconds: maxAge ? Number(maxAge) : 3600 };
}

let source: GoogleKeySource = fetchGoogleKeys;
let minRefetchMs = 60_000;
let cache: { keys: Map<string, KeyObject>; expiresAt: number; fetchedAt: number } | null = null;

/** Tests only: serve keys from memory instead of Google (null restores
 * Google), and optionally allow an immediate refetch for an unknown key. */
export function setGoogleKeySourceForTests(
  fn: GoogleKeySource | null,
  opts: { minRefetchMs?: number } = {},
) {
  source = fn ?? fetchGoogleKeys;
  minRefetchMs = opts.minRefetchMs ?? 60_000;
  cache = null;
}

async function loadKeys() {
  const set = await source();
  const keys = new Map<string, KeyObject>();
  for (const k of set.keys)
    if (k.kid && k.kty === 'RSA') keys.set(k.kid, createPublicKey({ key: k, format: 'jwk' }));
  const now = Date.now();
  cache = { keys, fetchedAt: now, expiresAt: now + Math.max(60, set.maxAgeSeconds) * 1000 };
  return cache;
}

async function keyFor(kid: string): Promise<KeyObject | null> {
  let c = cache && Date.now() < cache.expiresAt ? cache : await loadKeys();
  if (!c.keys.has(kid) && Date.now() - c.fetchedAt >= minRefetchMs) c = await loadKeys();
  return c.keys.get(kid) ?? null;
}

export interface GoogleIdentity {
  /** Google's stable user id: the account's identity in this app. */
  sub: string;
  /** Verified by Google; for display and the admin list only. */
  email: string;
  name: string | null;
}

/**
 * The verified identity in a Google ID token, or null if the token fails any
 * check. Throws GoogleKeysUnavailableError only when Google's keys can't be
 * fetched (a temporary problem, not a bad token).
 */
export async function verifyGoogleIdToken(
  token: string,
  clientId: string,
): Promise<GoogleIdentity | null> {
  if (!token || token.length > MAX_TOKEN_LENGTH || !clientId) return null;
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string') return null;
  if (decoded.header.alg !== 'RS256' || !decoded.header.kid) return null;

  const key = await keyFor(decoded.header.kid);
  if (!key) return null;

  let p: jwt.JwtPayload | string;
  try {
    p = jwt.verify(token, key, {
      algorithms: ['RS256'],
      issuer: GOOGLE_ISSUERS,
      audience: clientId,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });
  } catch {
    return null;
  }
  if (typeof p !== 'object' || typeof p.exp !== 'number') return null;
  const verified = p.email_verified === true || p.email_verified === 'true';
  if (!verified || typeof p.sub !== 'string' || !p.sub || typeof p.email !== 'string' || !p.email)
    return null;
  return {
    sub: p.sub,
    email: p.email,
    name: typeof p.name === 'string' && p.name.trim() ? p.name.trim().slice(0, 200) : null,
  };
}
