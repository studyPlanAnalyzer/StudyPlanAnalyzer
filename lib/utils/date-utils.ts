/** All dates are handled as UTC-midnight `Date` objects and formatted as
 * "YYYY-MM-DD" strings for storage in Postgres `date` columns, so that
 * timezone drift never shifts a study session onto the wrong day.
 *
 * Which calendar day it is "now" is decided in the app's time zone, Nepal
 * (Asia/Kathmandu, UTC+5:45, no daylight saving), on the server and in every
 * browser alike: today's sessions, the daily challenge, to-dos, report weeks
 * and "the exam is over" all roll over at midnight in Nepal. */

export const APP_TIME_ZONE = 'Asia/Kathmandu';
export const APP_UTC_OFFSET_MS = (5 * 60 + 45) * 60 * 1000;

export function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * Development only: a fake "today" set with the dev clock (lib/dev-clock.ts,
 * components/dev/DevClock.tsx), so days can be stepped through by hand. The
 * server installs a reader for the .dev-today file; the browser gets the
 * value from an inline script in the root layout. Outside development (and
 * in tests and scripts, where NODE_ENV isn't "development") it is never read.
 */
export type DevTodaySource = string | null | (() => string | null);
declare global {
  // eslint-disable-next-line no-var
  var __devToday: DevTodaySource | undefined;
}

function devToday(): Date | null {
  if (process.env.NODE_ENV !== 'development') return null;
  const source = globalThis.__devToday;
  const value = typeof source === 'function' ? source() : source;
  return value && isRealDateString(value) ? fromDateString(value) : null;
}

/** The app's (Nepal) calendar day that `instant` falls on, as a UTC-midnight
 * Date. With no `instant` it is today, which the dev clock can fake; an
 * explicit `instant` (a stored timestamp) is always converted as is. */
export function appDay(instant?: Date): Date {
  if (!instant) {
    const fake = devToday();
    if (fake) return fake;
  }
  const at = instant ?? new Date();
  return startOfDayUTC(new Date(at.getTime() + APP_UTC_OFFSET_MS));
}

/** Today in the app's time zone, as a UTC-midnight Date. */
export function appToday(): Date {
  return appDay();
}

/** Today in the app's time zone, as YYYY-MM-DD. */
export function todayKey(): string {
  return toDateString(appDay());
}

/** The instant the app day `day` (a UTC-midnight Date) begins: midnight in Nepal. */
export function appDayStart(day: Date): Date {
  return new Date(startOfDayUTC(day).getTime() - APP_UTC_OFFSET_MS);
}

/** Whole days from today (Nepal) to the "YYYY-MM-DD" day: 0 today, 1 tomorrow. */
export function daysUntil(dateStr: string): number {
  return diffInDays(fromDateString(dateStr), appToday());
}

/** True for a "YYYY-MM-DD" string naming a real calendar day (not 2027-02-30). */
export function isRealDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toDateString(fromDateString(s)) === s;
}

export function addDays(date: Date, days: number): Date {
  const result = startOfDayUTC(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

export function diffInDays(later: Date, earlier: Date): number {
  const ms = startOfDayUTC(later).getTime() - startOfDayUTC(earlier).getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

export function toDateString(date: Date): string {
  return startOfDayUTC(date).toISOString().slice(0, 10); // YYYY-MM-DD
}

export function fromDateString(dateStr: string): Date {
  // Postgres `date` columns come back as "YYYY-MM-DD"
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

const DAY_ABBREVIATIONS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export type DayAbbreviation = (typeof DAY_ABBREVIATIONS)[number];

export function dayAbbreviation(date: Date): DayAbbreviation {
  return DAY_ABBREVIATIONS[date.getUTCDay()];
}

export function isWeekday(date: Date): boolean {
  const day = date.getUTCDay();
  return day >= 1 && day <= 5; // Mon-Fri
}

/** Returns every calendar date from `start` (inclusive) to `end` (inclusive). */
export function enumerateDates(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  let cur = startOfDayUTC(start);
  const last = startOfDayUTC(end);
  while (cur.getTime() <= last.getTime()) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

/** Returns the ISO week number (1-based, relative to `start`) that `date` falls into. */
export function weekNumberFromStart(date: Date, start: Date): number {
  return Math.floor(diffInDays(date, start) / 7) + 1;
}

/** A "YYYY-MM-DD" day as text: the same day on every device, whatever its
 * time zone (a bare `new Date('2026-12-15')` shows Dec 14 west of UTC). */
export function formatDay(
  dateStr: string,
  options: Intl.DateTimeFormatOptions = {},
  locale?: string,
): string {
  return fromDateString(dateStr).toLocaleDateString(locale, {
    ...options,
    timeZone: 'UTC',
  });
}

/** A stored moment (e.g. paid-until) as the date it is in Nepal, on every device. */
export function formatInstantDay(
  instant: string | Date,
  options: Intl.DateTimeFormatOptions = {},
  locale?: string,
): string {
  return new Date(instant).toLocaleDateString(locale, {
    ...options,
    timeZone: APP_TIME_ZONE,
  });
}

/** A stored moment as date and time in Nepal, on every device. */
export function formatInstantDateTime(instant: string | Date, locale?: string): string {
  return new Date(instant).toLocaleString(locale, { timeZone: APP_TIME_ZONE });
}

export function formatHumanDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
