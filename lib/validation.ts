import { z } from 'zod';
import {
  addDays,
  appToday,
  isRealDateString,
  toDateString,
  todayKey,
} from '@/lib/utils/date-utils';
import { MAX_EXAM_DAYS_AHEAD } from '@/lib/utils/study-limits';

// ---------------------------------------------------------------------------
// Request-body rules shared by every route that accepts the same kind of
// value, so one rule can't drift from another.
// ---------------------------------------------------------------------------

/** A real calendar day as "YYYY-MM-DD" (2027-02-30 is refused, not rolled over). */
export const dateStringSchema = z
  .string()
  .refine(isRealDateString, 'Use a real date (YYYY-MM-DD)');

/**
 * Why an exam date can't be used, or null when it can: it must be a real day
 * after today (Nepal time) and no more than MAX_EXAM_DAYS_AHEAD days ahead.
 */
export function examDateProblem(examDate: string): string | null {
  if (!isRealDateString(examDate)) return 'Use a real date (YYYY-MM-DD)';
  if (examDate <= todayKey()) return 'Exam date must be in the future';
  if (examDate > toDateString(addDays(appToday(), MAX_EXAM_DAYS_AHEAD)))
    return 'Exam date must be within a year from today';
  return null;
}

export const STUDY_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Study days: at least one of Sun..Sat, each listed once. */
export const studyDaysSchema = z
  .array(z.enum(STUDY_DAYS))
  .min(1)
  .transform((days) => Array.from(new Set(days)));

/** Grade 4 to 10, stored without leading zeros ("09" becomes "9"). */
export const gradeSchema = z
  .string()
  .trim()
  .regex(/^\d{1,2}$/, 'Grade must be a number, e.g. 9')
  .refine(
    (g) => Number(g) >= 4 && Number(g) <= 10,
    'Grade must be between 4 and 10',
  )
  .transform((g) => String(Number(g)));

/** School name: at least 3 characters, inner runs of spaces collapsed. */
export const schoolNameSchema = z
  .string()
  .trim()
  .min(3, 'School name is required')
  .max(200)
  .transform((s) => s.replace(/\s+/g, ' '));

export const MAX_FULL_MARKS = 100;

/** A subject's or a test's "out of": a whole number from 1 to 100. */
export const fullMarksSchema = z
  .number()
  .int()
  .positive()
  .max(MAX_FULL_MARKS, `Full marks can be at most ${MAX_FULL_MARKS}`);

/** The day a test was taken: a real day, today (Nepal) or earlier. */
export const testDateSchema = dateStringSchema.refine(
  (d) => d <= todayKey(),
  "A test can't be dated in the future",
);
