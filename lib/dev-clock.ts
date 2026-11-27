import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import { isRealDateString } from '@/lib/utils/date-utils';

/**
 * A fake "today" for testing day-by-day behaviour (SM-2 reviews, plan
 * rebuilds, revision days, exam expiry) without waiting real days. Never in
 * production. It lives in one of two places:
 *
 * - Local development (NODE_ENV "development"): a git-ignored .dev-today file
 *   in the project root, so it survives dev-server restarts and is shared by
 *   every request and by scripts (scripts/seed-test-child.ts).
 * - Vercel preview deployments (VERCEL_ENV "preview", behind Vercel's login):
 *   a cookie, so each browser has its own day. The server can't share a file
 *   there, so each API request runs inside its cookie's day (withDevToday,
 *   called by withErrorHandling for every route).
 *
 * appDay() in date-utils reads the day through globalThis.__devToday.
 */
export type DevClockMode = 'file' | 'cookie' | null;
export const DEV_CLOCK_MODE: DevClockMode =
  process.env.NODE_ENV === 'development'
    ? 'file'
    : process.env.VERCEL_ENV === 'preview'
      ? 'cookie'
      : null;
export const DEV_CLOCK_ENABLED = DEV_CLOCK_MODE !== null;
export const DEV_CLOCK_COOKIE = 'dev-today';

const FILE = path.join(process.cwd(), '.dev-today');
const requestDay = new AsyncLocalStorage<string | null>();

function valid(value: string | null | undefined): string | null {
  const day = value?.trim();
  return day && isRealDateString(day) ? day : null;
}

/**
 * The fake day, or null for the real one. In development, the file's. On a
 * preview, the cookie's: `cookieValue` when given, otherwise the current
 * request's (inside withDevToday).
 */
export function readDevToday(cookieValue?: string | null): string | null {
  if (DEV_CLOCK_MODE === 'file') {
    try {
      return valid(fs.readFileSync(FILE, 'utf8'));
    } catch {
      return null;
    }
  }
  if (DEV_CLOCK_MODE === 'cookie')
    return cookieValue !== undefined ? valid(cookieValue) : (requestDay.getStore() ?? null);
  return null;
}

/** Development: sets the fake day, or clears it (back to the real day) with null. */
export function writeDevToday(day: string | null) {
  if (DEV_CLOCK_MODE !== 'file') return;
  if (day === null) fs.rmSync(FILE, { force: true });
  else fs.writeFileSync(FILE, `${day}\n`);
}

/** Points appDay() on the server at the dev clock. Safe to call often. */
export function installDevClock() {
  if (DEV_CLOCK_ENABLED) globalThis.__devToday = () => readDevToday();
}

/** The dev-clock cookie in a request's Cookie header, if any. */
export function devTodayCookie(req: unknown): string | null {
  if (!(req instanceof Request)) return null;
  for (const part of (req.headers.get('cookie') ?? '').split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === DEV_CLOCK_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * Preview deployments: runs `fn` (a request's work) with the fake day from
 * that request's cookie, so everything it calls sees the same "today".
 * Elsewhere it just runs `fn`.
 */
export function withDevToday<T>(req: unknown, fn: () => T): T {
  if (DEV_CLOCK_MODE !== 'cookie') return fn();
  installDevClock();
  return requestDay.run(valid(devTodayCookie(req)), fn);
}
