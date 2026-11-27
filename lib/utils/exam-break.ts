import { diffInDays, fromDateString } from './date-utils';

/**
 * The break between one exam cycle and the next: the plan stops at the exam
 * (or a week earlier with the buffer week) and the family takes a break. When
 * the next cycle starts, the last exam's topics move to revision days, so
 * nothing on the daily list is waiting overdue. Until then, the family is
 * reminded to start it.
 */

/** A gentle reminder from this many days after the exam... */
export const BREAK_GENTLE_AFTER_DAYS = 14;
/** ...and a firmer warning from this many. */
export const BREAK_FIRM_AFTER_DAYS = 21;

export type BreakReminder = { stage: 'gentle' | 'firm'; weeks: number };

/**
 * The reminder to show the parent and the child while no new exam cycle has
 * started, counted from the exam date: none for the first 2 weeks (a break
 * is expected), gentle from 2 weeks, firm from 3.
 */
export function breakReminder(examDate: string, today: string): BreakReminder | null {
  const days = diffInDays(fromDateString(today), fromDateString(examDate));
  if (days < BREAK_GENTLE_AFTER_DAYS) return null;
  return {
    stage: days >= BREAK_FIRM_AFTER_DAYS ? 'firm' : 'gentle',
    weeks: Math.floor(days / 7),
  };
}

/** The reminder's words. */
export function breakReminderText(r: BreakReminder): string {
  return r.stage === 'gentle'
    ? `It's been ${r.weeks} weeks since the exam. Time to start studying again.`
    : `It's been ${r.weeks} weeks since the exam. Topics are fading, so start the next exam cycle.`;
}
