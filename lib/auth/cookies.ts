import type { NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Every auth cookie, with its flags, in one place, so setting and clearing a
// cookie always use the same name, path and flags.
//
// - HttpOnly: page scripts can never read a token.
// - Secure: always in production. Outside production it can be switched off
//   with AUTH_COOKIE_INSECURE=true, for browsers (Safari) that refuse Secure
//   cookies on http://localhost.
// - SameSite=Strict: the app has no cross-site sign-in (no OAuth redirects
//   back into it), so cookies never need to ride on cross-site requests.
// - No Domain: host-only cookies, never shared with subdomains.
// - __Host- prefix (Secure, Path=/, no Domain) where the path is /, and
//   __Secure- where the cookie is scoped to a narrower path.
// - Max-Age equals the lifetime of the token inside.
// ---------------------------------------------------------------------------

export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export function cookiesAreSecure(): boolean {
  return (
    process.env.NODE_ENV === 'production' ||
    process.env.AUTH_COOKIE_INSECURE !== 'true'
  );
}

type CookieDef = { name: string; path: string };

function def(base: string, prefix: '__Host-' | '__Secure-', path: string) {
  return (): CookieDef => ({
    name: cookiesAreSecure() ? `${prefix}${base}` : base,
    path,
  });
}

/** The 15-minute access token (JWT). Sent with every request. */
export const accessCookie = def('sp_access', '__Host-', '/');
/** The 7-day refresh token. Only ever sent to /api/auth (refresh, logout). */
export const refreshCookie = def('sp_refresh', '__Secure-', '/api/auth');
/**
 * Holds no token, just "1": tells the proxy a refresh cookie exists (it can't
 * see that cookie, which is scoped to /api/auth), so a page isn't sent to
 * /login merely because the 15-minute access token has run out.
 */
export const signedInCookie = def('sp_signed_in', '__Host-', '/');

// The single cookie used before access/refresh tokens. Cleared on sign-in and
// sign-out so it doesn't linger in browsers.
const LEGACY_AUTH_COOKIE: CookieDef = { name: 'auth-token', path: '/' };

function options(c: CookieDef, maxAge: number) {
  return {
    httpOnly: true,
    secure: cookiesAreSecure(),
    sameSite: 'strict' as const,
    path: c.path,
    maxAge,
  };
}

export function setCookie(
  res: NextResponse,
  c: CookieDef,
  value: string,
  maxAge: number,
) {
  res.cookies.set(c.name, value, options(c, maxAge));
}

export function clearCookie(res: NextResponse, c: CookieDef) {
  res.cookies.set(c.name, '', options(c, 0));
}

/** Clears every auth cookie (sign-out, or a session found to be revoked). */
export function clearAuthCookies(res: NextResponse) {
  clearCookie(res, accessCookie());
  clearCookie(res, refreshCookie());
  clearCookie(res, signedInCookie());
  res.cookies.set(LEGACY_AUTH_COOKIE.name, '', {
    httpOnly: true,
    secure: cookiesAreSecure(),
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}
