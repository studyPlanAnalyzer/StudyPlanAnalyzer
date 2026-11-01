import { NextRequest, NextResponse } from 'next/server';

// Fixed-window counters, one set per server instance (like the paid cache in
// lib/billing/guard.ts). On Vercel several instances can run at once, so this
// slows down brute force and abuse from a single client rather than enforcing
// an exact global limit; a platform rule (e.g. the Vercel firewall) is the
// place for a hard one.
const windows = new Map<string, { count: number; resetAt: number }>();
const MAX_KEYS = 10_000;

// Vercel sets both headers itself (replacing any a client sent), so they hold
// the real client address there.
export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/**
 * Counts one hit against `key`. Returns a 429 response once more than `limit`
 * hits land within `windowSeconds`, or null while the caller is under it.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): NextResponse | null {
  const now = Date.now();
  let entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    if (windows.size >= MAX_KEYS) {
      windows.forEach((v, k) => {
        if (v.resetAt <= now) windows.delete(k);
      });
      if (windows.size >= MAX_KEYS) windows.clear();
    }
    entry = { count: 0, resetAt: now + windowSeconds * 1000 };
    windows.set(key, entry);
  }
  entry.count += 1;
  if (entry.count <= limit) return null;

  const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
  return NextResponse.json(
    {
      error: 'Too many attempts. Please wait a few minutes and try again.',
      code: 'RATE_LIMITED',
    },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  );
}
