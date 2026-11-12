import { addDays, dayAbbreviation, fromDateString, toDateString } from '@/lib/utils/date-utils';
import { BUFFER_WEEK_DAYS } from '@/lib/utils/study-limits';

/**
 * The parent's status line: the child's pace against what the plan needs.
 *
 * "Need" is read from the plan's own forecast: the topics listed from today
 * through the next NEED_WINDOW_DAYS days (today's list already holds anything
 * overdue), per study day in that window. The forecast holds each topic's
 * NEXT review only, so a longer window would undercount; a week is what the
 * plan page's "Coming up" shows, so the two agree.
 */

/** Today plus the next 6 days. */
export const NEED_WINDOW_DAYS = 7;
/** A pace within 10% of the need still counts as on track. */
export const ON_TRACK_SHARE = 0.9;

/**
 * The plan's last study day: the day before the exam, or the start of the
 * buffer week while that is still ahead (as lib/plan-rebuild.ts schedules).
 */
export function planLastDay(examDate: string, useBufferWeek: boolean, todayKey: string): string {
  const exam = fromDateString(examDate);
  const bufferStart = toDateString(addDays(exam, -BUFFER_WEEK_DAYS));
  return useBufferWeek && bufferStart > todayKey ? bufferStart : toDateString(addDays(exam, -1));
}

/** Study days from `fromKey` to `toKey`, both included. */
export function countStudyDays(fromKey: string, toKey: string, studyDays: string[]): number {
  let n = 0;
  for (let d = fromDateString(fromKey); toDateString(d) <= toKey; d = addDays(d, 1)) {
    if (studyDays.includes(dayAbbreviation(d))) n++;
  }
  return n;
}

/** The last day of the need window, clipped to the plan's last day. */
export function needWindowEnd(todayKey: string, lastDay: string): string {
  const weekEnd = toDateString(addDays(fromDateString(todayKey), NEED_WINDOW_DAYS - 1));
  return weekEnd < lastDay ? weekEnd : lastDay;
}

export interface PlanStatus {
  /** 'new': no study days yet to measure a pace from. */
  kind: 'new' | 'on_track' | 'behind';
  /** Topics completed per study day lately (recentPace), or null. */
  pace: number | null;
  /** Topics per study day the next week of the plan lists. */
  need: number;
  /** Topics listed from today to the window's end. */
  listed: number;
  /** Of those, how many won't be done on time at this pace. */
  gap: number;
  /** Topics whose review was due before today and is still to do. */
  overdue: number;
}

/** null when the plan has no study day left. */
export function planStatus(input: {
  pace: number | null;
  /** Topics listed in the need window (any status). */
  listed: number;
  /** Study days in the need window. */
  studyDays: number;
  overdue: number;
}): PlanStatus | null {
  if (input.studyDays <= 0) return null;
  const need = input.listed / input.studyDays;
  const { pace } = input;
  const kind =
    pace === null ? 'new' : pace >= need * ON_TRACK_SHARE ? 'on_track' : 'behind';
  const gap =
    pace === null ? 0 : Math.max(0, Math.round(input.listed - pace * input.studyDays));
  return { kind, pace, need, listed: input.listed, gap, overdue: input.overdue };
}

/**
 * Two rates side by side: whole numbers, unless they'd read the same while
 * being different (2.6 and 3.2 are not "about 3" and "about 3").
 */
export function formatRates(a: number, b: number): [string, string] {
  const whole = (x: number) => String(Math.round(x));
  const tenth = (x: number) => String(Math.round(x * 10) / 10);
  return Math.round(a) === Math.round(b) && Math.abs(a - b) >= 0.05
    ? [tenth(a), tenth(b)]
    : [whole(a), whole(b)];
}

const topics = (n: number) => `${n} topic${n === 1 ? '' : 's'}`;

/** The words, for the dashboard and the plan page. */
export function planStatusText(
  s: PlanStatus,
  childName: string,
): { headline: string; lines: string[] } {
  const lines: string[] = [];
  if (s.pace === null) {
    lines.push(
      `${childName}'s pace shows after the first few study days. This week's plan lists about ${formatRates(s.need, s.need)[0]} topics a study day.`,
    );
  } else {
    const [pace, need] = formatRates(s.pace, s.need);
    lines.push(
      `${childName} completes about ${pace} topics a study day. Staying on schedule this week needs about ${need}.`,
    );
    if (s.kind === 'behind' && s.gap > 0) {
      lines.push(
        `At this pace, about ${topics(s.gap)} of the ${s.listed} due this week won't be done on time. Topics not done are listed again the next day, so a few more a day, or another study day in Settings, closes the gap.`,
      );
    }
  }
  if (s.overdue > 0) {
    lines.push(
      `${topics(s.overdue)} ${s.overdue === 1 ? 'is' : 'are'} overdue and first on today's list.`,
    );
  }
  const headline =
    s.kind === 'new' ? 'Getting started' : s.kind === 'on_track' ? 'On track' : 'Falling behind';
  return { headline, lines };
}

/** The dashboard's one-line summary. */
export function planStatusShort(s: PlanStatus): string {
  if (s.kind === 'new') return 'Getting started';
  const pace = formatRates(s.pace!, s.need)[0];
  const head = s.kind === 'on_track' ? 'On track' : 'Falling behind';
  const overdue = s.overdue > 0 ? ` · ${s.overdue} overdue` : '';
  return `${head} · about ${pace} topics a day${overdue}`;
}
