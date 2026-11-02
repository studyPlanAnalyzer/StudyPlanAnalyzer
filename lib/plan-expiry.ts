import { todayKey } from '@/lib/utils/date-utils';

/**
 * An exam is over from the start of its exam day (midnight in Nepal). This is
 * the same rule the plan rebuild already uses ("Exam date has passed"), so a
 * plan is removed at exactly the moment it could no longer be rebuilt.
 */
export function isExamOver(examDate: string): boolean {
  return examDate <= todayKey();
}
