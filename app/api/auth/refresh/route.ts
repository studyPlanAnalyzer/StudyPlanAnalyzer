import { NextRequest, NextResponse } from 'next/server';
import {
  rotateRefreshToken,
  sessionIdForRefreshToken,
} from '@/lib/auth/session';
import { clearAuthCookies, refreshCookie } from '@/lib/auth/cookies';
import { withErrorHandling } from '@/lib/api/handler';
import { clientIp, rateLimit } from '@/lib/rate-limit';

/**
 * Trades the refresh cookie for a new access token and a new refresh token
 * (the old one is spent). A refresh token that was already used ends the
 * whole session, since someone else must have a copy; the user signs in again.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const limited = rateLimit(`refresh:ip:${clientIp(req)}`, 60, 15 * 60);
  if (limited) return limited;

  const raw = req.cookies.get(refreshCookie().name)?.value;
  const sessionId = raw ? await sessionIdForRefreshToken(raw) : null;
  if (sessionId) {
    const sessionLimited = rateLimit(`refresh:session:${sessionId}`, 30, 15 * 60);
    if (sessionLimited) return sessionLimited;
  }

  const res = NextResponse.json({ refreshed: true });
  const result = raw ? await rotateRefreshToken(res, raw) : null;
  if (result?.ok) return res;

  const denied = NextResponse.json(
    {
      error: 'Your session has ended. Please log in again.',
      code: result?.reason === 'reused' ? 'SESSION_REVOKED' : 'SESSION_ENDED',
    },
    { status: 401 },
  );
  clearAuthCookies(denied);
  return denied;
});
