import { addDays, fromDateString, toDateString } from '@/lib/utils/date-utils';

// ---------------------------------------------------------------------------
// The report week, in ONE place.
//
// Like the rest of the app, days are UTC days (lib/utils/date-utils.ts). A
// report week runs Sunday to Saturday, matching Nepal's school week (Saturday
// is the day off). A week's report can be made once the week has ended, at
// Saturday 24:00 UTC (05:45 Sunday in Nepal).
//
// To move the week, change only this constant.
// ---------------------------------------------------------------------------

/** First day of the report week: 0 = Sunday (as Date.getUTCDay()). */
export const REPORT_WEEK_START_DAY = 0;

export type ReportWeek = {
  /** First day (YYYY-MM-DD). */
  start: string;
  /** Last day, inclusive (YYYY-MM-DD). */
  end: string;
};

/** The report week containing `day` (YYYY-MM-DD). */
export function weekContaining(day: string): ReportWeek {
  const d = fromDateString(day);
  const back = (d.getUTCDay() - REPORT_WEEK_START_DAY + 7) % 7;
  return weekStartingOn(toDateString(addDays(d, -back)));
}

/** The week starting on `start`, which must be a week start. */
export function weekStartingOn(start: string): ReportWeek {
  const s = fromDateString(start);
  if (s.getUTCDay() !== REPORT_WEEK_START_DAY)
    throw new Error(`${start} is not the first day of a report week`);
  return { start, end: toDateString(addDays(s, 6)) };
}

export function previousWeek(week: ReportWeek): ReportWeek {
  return weekStartingOn(toDateString(addDays(fromDateString(week.start), -7)));
}

export function nextWeek(week: ReportWeek): ReportWeek {
  return weekStartingOn(toDateString(addDays(fromDateString(week.start), 7)));
}

/** Every day of the week, in order. */
export function daysOf(week: ReportWeek): string[] {
  const s = fromDateString(week.start);
  return Array.from({ length: 7 }, (_, i) => toDateString(addDays(s, i)));
}

export function isInWeek(day: string, week: ReportWeek): boolean {
  return day >= week.start && day <= week.end;
}

/** The most recent week that has ended by `now`. */
export function lastFinishedWeek(now: Date): ReportWeek {
  return previousWeek(weekContaining(toDateString(now)));
}
