/** All dates are handled as UTC-midnight `Date` objects and formatted as
 * "YYYY-MM-DD" strings for storage in Postgres `date` columns, so that
 * timezone drift never shifts a study session onto the wrong day. */

export function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function todayUTC(): Date {
  return startOfDayUTC(new Date());
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

export function formatHumanDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
