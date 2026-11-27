/** The plan API's sessions, by week and day (GET /api/plans/[planId]). */
export interface PlanSession {
  id: string;
  scheduledDate: string;
  durationMinutes: number;
  sessionType: 'learn' | 'practice' | 'review' | 'mock';
  status: 'planned' | 'completed' | 'partly_completed' | 'skipped';
  topicName: string | null;
  subjectName: string | null;
  /** The topic is mastered now (three Easy reviews in a row). */
  topicMastered?: boolean;
  /** Needs practice: rated Hard or Again on 2 of the topic's last 3 sessions. */
  topicStruggling?: boolean;
}

export interface PlanDay {
  date: string;
  totalMinutes: number;
  sessions: PlanSession[];
}

export interface PlanWeek {
  weekNumber: number;
  days: PlanDay[];
}
