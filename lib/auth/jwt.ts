import { randomUUID } from 'crypto';
import jwt from 'jsonwebtoken';

// ---------------------------------------------------------------------------
// Signing
//
// HS256 only, with a secret of at least 256 bits from JWT_SECRET. Every token
// carries sub, iat, exp, iss, aud and jti, and verification checks the
// algorithm, signature, exp, iss and aud (30 seconds of clock tolerance).
// ---------------------------------------------------------------------------

// The example values from .env.example: anyone who has read the repo knows
// them, so a token signed with one can be forged for any account.
const PLACEHOLDER_SECRETS = [
  'your-secret-key-change-in-production',
  'generate-a-long-random-string',
];
// `openssl rand -base64 32` gives 44 characters; 43 allows unpadded base64.
const MIN_SECRET_LENGTH = 43;

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Add it to your .env file.');
  }
  if (
    process.env.NODE_ENV === 'production' &&
    (PLACEHOLDER_SECRETS.includes(secret) || secret.length < MIN_SECRET_LENGTH)
  ) {
    throw new Error(
      'JWT_SECRET is a placeholder or shorter than 256 bits. Generate one with: openssl rand -base64 32',
    );
  }
  return secret;
}

const ALGORITHM = 'HS256' as const;
const ISSUER = 'studyplan-analyzer';
const ACCESS_AUDIENCE = 'studyplan-analyzer:api';
const CLOCK_TOLERANCE_SECONDS = 30;

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

function verify(token: string, audience: string): jwt.JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret(), {
      algorithms: [ALGORITHM],
      issuer: ISSUER,
      audience,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });
    if (
      typeof decoded !== 'object' ||
      typeof decoded.sub !== 'string' ||
      typeof decoded.jti !== 'string' ||
      typeof decoded.iat !== 'number' ||
      typeof decoded.exp !== 'number'
    )
      return null;
    return decoded;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Access tokens (15 minutes, in the access cookie)
//
// Only what authorisation needs: the user id (sub), their role, and the
// session (refresh token family) the token belongs to, which is how logging
// out or a detected replay ends it before it expires. No email or other
// personal data.
// ---------------------------------------------------------------------------
export type Role = 'admin' | 'parent';

export interface AccessTokenPayload {
  userId: string;
  role: Role;
  sid: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign({ role: payload.role, sid: payload.sid }, getSecret(), {
    algorithm: ALGORITHM,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    issuer: ISSUER,
    audience: ACCESS_AUDIENCE,
    subject: payload.userId,
    jwtid: randomUUID(),
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  const d = verify(token, ACCESS_AUDIENCE);
  if (
    !d ||
    typeof d.sid !== 'string' ||
    (d.role !== 'admin' && d.role !== 'parent')
  )
    return null;
  return { userId: d.sub!, role: d.role, sid: d.sid };
}
