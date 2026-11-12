import { addDays, dayAbbreviation, fromDateString, toDateString } from '@/lib/utils/date-utils';

/**
 * Every day is a study day. Saturday is always a revision day, and Sunday is
 * one too unless the child's school is open on Sundays (students.sunday_revision).
 *
 * Revision days are for topics from earlier exams (lib/revision.ts): no SM-2
 * session is listed on them. That only applies once there are earlier topics:
 * in the first term of an academic year, revision days run SM-2 like any day.
 */
export const ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Topics added in one go while setting up start this many a day. */
export const SETUP_NEW_TOPICS_PER_DAY = 4;

export function revisionDays(sundayRevision: boolean): string[] {
  return sundayRevision ? ['Sat', 'Sun'] : ['Sat'];
}

/**
 * The days SM-2 sessions are listed on: every day, except revision days once
 * the child has topics from earlier exams to revise.
 */
export function sm2Days(sundayRevision: boolean, hasEarlierTopics: boolean): string[] {
  if (!hasEarlierTopics) return [...ALL_DAYS];
  const off = revisionDays(sundayRevision);
  return ALL_DAYS.filter((d) => !off.includes(d));
}

export function isRevisionDay(dayKey: string, sundayRevision: boolean): boolean {
  return revisionDays(sundayRevision).includes(dayAbbreviation(fromDateString(dayKey)));
}

/**
 * Learn-from dates for `count` topics added in one go while setting up: from
 * the day after `todayKey`, at most SETUP_NEW_TOPICS_PER_DAY on each SM-2 day.
 */
export function spreadLearnFrom(count: number, todayKey: string, days: string[]): string[] {
  const out: string[] = [];
  let d = addDays(fromDateString(todayKey), 1);
  let onDay = 0;
  // Guard: with no SM-2 day at all there's nowhere to place them.
  if (days.length === 0) return Array.from({ length: count }, () => toDateString(d));
  while (out.length < count) {
    if (!days.includes(dayAbbreviation(d))) {
      d = addDays(d, 1);
      continue;
    }
    out.push(toDateString(d));
    if (++onDay === SETUP_NEW_TOPICS_PER_DAY) {
      onDay = 0;
      d = addDays(d, 1);
    }
  }
  return out;
}

/** The day after `todayKey`: when a topic added today gets its learn session. */
export function tomorrowKey(todayKey: string): string {
  return toDateString(addDays(fromDateString(todayKey), 1));
}
