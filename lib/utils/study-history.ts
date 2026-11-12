/**
 * The child's recent study days, for the parent's status card: the pace
 * (topics completed per study day lately) is compared with what the plan
 * needs (lib/utils/plan-status.ts).
 */

/** The pace is the average over this many recent study days. */
export const PACE_STUDY_DAYS = 7;

/** A day that had topics on the list: how many, and how many were done. */
export interface StudyDay {
  date: string;
  listed: number;
  done: number;
}

/**
 * Topics completed per study day, averaged over the last PACE_STUDY_DAYS
 * (oldest first). null before the first study day.
 */
export function recentPace(completedPerStudyDay: number[]): number | null {
  const recent = completedPerStudyDay.slice(-PACE_STUDY_DAYS);
  if (recent.length === 0) return null;
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}
