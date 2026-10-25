import jwt from 'jsonwebtoken';

export interface JwtPayload {
  userId: string;
  email: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set. Add it to your .env file.');
  }
  return secret;
}

export const AUTH_COOKIE_NAME = 'auth-token';
export const AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

export function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, getSecret(), { expiresIn: '7d' });
}

export function verifyJwt(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      'userId' in decoded
    ) {
      return decoded as JwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Password reset tokens
//
// Issued only after an OTP has been verified, so possession of this token
// already implies the email was proven. It's deliberately short-lived and
// tagged with `type` so it can never be swapped in for a normal auth-token
// cookie by mistake.
// ---------------------------------------------------------------------------
export interface ResetTokenPayload {
  userId: string;
  email: string;
  type: 'password_reset';
}

const RESET_TOKEN_EXPIRY = '15m';

export function signResetToken(payload: {
  userId: string;
  email: string;
}): string {
  return jwt.sign({ ...payload, type: 'password_reset' }, getSecret(), {
    expiresIn: RESET_TOKEN_EXPIRY,
  });
}

export function verifyResetToken(token: string): ResetTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (
      typeof decoded === 'object' &&
      decoded !== null &&
      'userId' in decoded &&
      (decoded as { type?: string }).type === 'password_reset'
    ) {
      return decoded as ResetTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}
