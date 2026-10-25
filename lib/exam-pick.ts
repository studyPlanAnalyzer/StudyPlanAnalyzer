import { fromDateString } from '@/lib/utils/date-utils';

/**
 * The exam a student's plan, settings and subjects screens work on:
 *  1. the primary exam, if there is one;
 *  2. otherwise the nearest upcoming exam;
 *  3. otherwise (all exams have passed) the most recent one.
 *
 * Used by BOTH the student GET (to say which plan is "current") and the
 * settings save, so the two can never disagree.
 */
export function pickExam<
  T extends { isPrimary: boolean | null; examDate: string },
>(exams: T[]): T | undefined {
  const primary = exams.find((e) => e.isPrimary);
  if (primary) return primary;

  const byDate = [...exams].sort((a, b) =>
    a.examDate.localeCompare(b.examDate),
  );
  const now = Date.now();
  return (
    byDate.find((e) => fromDateString(e.examDate).getTime() > now) ??
    byDate[byDate.length - 1]
  );
}
