import type { SubjectInput } from '@/lib/utils/plan-generator';

// ===========================================================================
// Input: rows already loaded from the database for ONE child (see
// lib/reports/load-report-inputs.ts). Dates are "YYYY-MM-DD" (UTC days),
// timestamps are ISO strings, so fixtures in tests are plain data.
// ===========================================================================

export type SessionStatus =
  | 'planned'
  | 'completed'
  | 'partly_completed'
  | 'skipped';

export interface SessionRow {
  id: string;
  planId: string;
  topicId: string | null;
  topicName: string | null;
  subjectName: string | null;
  scheduledDate: string;
  durationMinutes: number;
  sessionType: string; // 'learn' | 'practice' | 'review' | 'mock'
  isFiller: boolean;
  status: SessionStatus;
  completedAt: string | null;
}

export interface TopicReviewRow {
  topicId: string;
  topicName: string;
  subjectName: string;
  scheduledDate: string;
  completedDate: string | null;
  rating: number; // 1 Again, 2 Hard, 3 Good, 4 Easy
}

export interface QuizAttemptRow {
  completedAt: string;
  score: number;
  totalQuestions: number;
}

export interface TodoRow {
  todoDate: string;
  isCompleted: boolean;
}

export interface MarkRow {
  markId: string;
  assessmentId: string;
  assessmentName: string;
  assessmentDate: string;
  createdAt: string;
  subjectId: string;
  subjectName: string;
  obtainedMarks: number;
  fullMarks: number;
  confidenceLevel: 'low' | 'medium' | 'high' | null;
  /** Lowest-level topics the mark is scoped to; empty = whole subject. */
  topicIds: string[];
}

export type BillingForReport = 'active' | 'pending' | 'grace';

export interface ReportInput {
  student: {
    id: string;
    name: string;
    createdAt: string;
  };
  /** First day of the report week (lib/reports/week.ts). */
  weekStart: string;
  /** Billing state when the report is made. Locked and unpaid children get
   * no report at all, so they never reach the builder. */
  billing: BillingForReport;
  /** The exam the plan works on (lib/exam-pick.ts), if the child has one. */
  exam: { id: string; name: string; examDate: string } | null;
  /** The plan for that exam, if there is one. */
  plan: { id: string; generatedAt: string } | null;
  /** Every session of every plan the child has. */
  sessions: SessionRow[];
  /** Earlier-exam topics revised in the week, and how (lib/revision.ts). */
  revisions: { revisedOn: string; rating: number }[];
  /** Ratings from RATING_HISTORY_DAYS before the week end up to it, oldest
   * first (a day's ratings in the order they were made). */
  topicReviews: TopicReviewRow[];
  /** Daily challenge attempts in this week and the one before. */
  quizAttempts: QuizAttemptRow[];
  /** When the child's very first challenge was done, if ever. */
  firstQuizAttemptAt: string | null;
  /** To-dos for STREAK_HISTORY_DAYS up to the week end. */
  todos: TodoRow[];
  /** Every test mark the child has. */
  marks: MarkRow[];
  /** The plan generator's own inputs (lib/plan-inputs.ts), for priorities. */
  subjectInputs: SubjectInput[];
  /** Names of the lowest-level topics in subjectInputs. */
  topicNames: Record<string, { name: string; subjectName: string }>;
  /** Each topic's current revision gap (topic_spaced_state.intervalDays). */
  intervalDays: Record<string, number>;
  /** Review-type sessions finished on or before their day, all time. */
  onTimeReviewsAllTime: number;
  /** The child's report for the week before, if there is one. */
  previousReport: WeeklyReportSnapshot | null;
  /** Whether the child has any earlier report at all. */
  hasEarlierReport: boolean;
  /** Milestones the child already has. */
  awardedMilestones: MilestoneKey[];
  /** Made after a newer week had already ended (a parent catching up on
   * missed weeks). The sections that depend on the child's state NOW
   * (getting stronger, weak topics, priorities, next week's focus) are left
   * out, because they would describe today rather than that week. */
  builtLater: boolean;
}

// ===========================================================================
// Output: the stored snapshot. Facts and rule outcomes only, no sentences:
// wording lives in lib/reports/strings.ts, so it can be translated (the
// parent's preferredLanguage) without changing any stored report.
// ===========================================================================

/**
 * 3: topics done instead of minutes (the plan lists every due topic, with
 * no minutes budget), earlier-exam topics revised on revision days, Needs
 * practice in "needs attention", topics coming up next week. Version 2
 * reports are still stored and shown as they were made: the fields marked
 * "v2" are theirs.
 */
export const SNAPSHOT_VERSION = 3;

export type HeadlineKind =
  | 'exam_finished'
  | 'no_plan'
  | 'quiet_week'
  | 'first_week'
  | 'all_sessions_done'
  | 'consistent_week'
  | 'strong_challenge_week'
  | 'lighter_week'
  | 'steady_week';

export type ReadinessStatus =
  | 'on_track'
  | 'slightly_behind'
  | 'behind'
  | 'too_early';

export type ActionKind =
  | 'pay_to_keep_access'
  | 'start_new_exam_cycle'
  | 'create_plan'
  | 'start_together'
  | 'explain_topic_back'
  | 'log_test'
  | 'fix_study_time'
  | 'ask_what_learned';

export type MilestoneKey =
  | 'first_report'
  | 'study_day_streak_7'
  | 'first_challenge'
  | 'all_required_sessions_week'
  | 'reviews_on_time_10';

export interface TopicRef {
  topicName: string;
  subjectName: string;
}

export interface WeeklyReportSnapshot {
  version: 2 | typeof SNAPSHOT_VERSION;
  studentId: string;
  studentName: string;
  week: { start: string; end: string };
  /** The day the report is about to be read (the day after the week). */
  reportDate: string;

  context: {
    /** No earlier report: show a baseline, no comparisons. */
    isFirstReport: boolean;
    /** The child was added during this week. */
    addedThisWeek: boolean;
    /** Whether "last week" figures are shown: the child existed for all of
     * last week and this is not the first report. */
    hasComparison: boolean;
    /** Billing is in its grace days: one gentle "payment due" line. */
    paymentDue: boolean;
    /** Anything happened: a finished session, a challenge or a to-do. */
    hadActivity: boolean;
    /** See ReportInput.builtLater: shown with a small "built later" label. */
    builtLater: boolean;
  };

  headline: HeadlineKind;

  /** v2: planned length (minutes) of sessions marked completed or partly
   * completed whose completedAt falls in the week. Not a stopwatch. */
  studyTime?: { minutes: number; lastWeekMinutes: number | null };

  /** Topics done: sessions marked completed or partly completed whose
   * completedAt falls in the week (one per topic per day). */
  topicsDone?: { count: number; lastWeek: number | null };

  /** Earlier-exam topics revised in the week (revision days, lib/revision.ts),
   * and how many of those revisions were rated Hard or Again. */
  revised?: { count: number; hard: number };

  /** Study days: days with at least one required session scheduled. */
  consistency: {
    plannedDays: number;
    /** Planned days with a session finished (by completedAt) that day. */
    plannedDaysStudied: number;
    /** Days with a session finished that had nothing planned. */
    extraDaysStudied: number;
    /** Consecutive planned study days, up to the week end, each with a
     * session finished that day. Rest days are skipped, not counted. */
    studyDayStreak: number;
  };

  /** Topics listed in the week (v2: required sessions). */
  adherence: {
    required: number;
    /** Of those, marked completed or partly completed (whenever). */
    finished: number;
    /** Of those, not done: skipped by the parent, or missed (left planned
     * past their day, which a plan rebuild turns into skipped). */
    notDone: number;
  };

  revision: {
    /** Review-type sessions finished (completedAt) in the week. */
    reviewsDone: number;
    /** Of those, finished on or before their scheduled day. */
    reviewsOnTime: number;
    /** Every rating recorded (topic_reviews, completedDate in the week). */
    ratings: { again: number; hard: number; good: number; easy: number };
    /** Distinct topics with a learn-type session finished in the week. */
    newTopicsLearned: TopicRef[];
    /** Topics whose revision gap is longer than in last week's report.
     * null = not shown (no report for last week to compare with, or built
     * later). */
    gettingStronger:
      | (TopicRef & { everyDays: number; lastWeekEveryDays: number })[]
      | null;
    /** reason: 'needs_practice' (rated Hard or Again on 2 of its last 3
     * sessions, as the badge), 'weak' (test results), or v2's
     * 'hard_ratings' (Hard or Again twice in 28 days). */
    needsAttention: (TopicRef & { reason: 'needs_practice' | 'weak' | 'hard_ratings' })[];
  };

  challenge: {
    attempts: number;
    /** Mean of score / questions, as a whole percent. null if no attempts. */
    averagePercent: number | null;
    bestDay: { date: string; percent: number } | null;
    lastWeek: { attempts: number; averagePercent: number | null } | null;
  };

  /** To-dos dated in the week. */
  habits: {
    completed: number;
    total: number;
    /** The dashboard's habit streak (computeStreaks), as of the week end. */
    streak: number;
  };

  /** Test marks logged with a test date in the week. */
  tests: {
    logged: boolean;
    subjects: TestChange[];
    topics: TestChange[];
  };

  exam: {
    state: 'none' | 'no_plan' | 'over' | 'upcoming';
    name: string | null;
    examDate: string | null;
    /** Days from reportDate to the exam (upcoming only). */
    daysLeft: number | null;
    /** Lowest-level topics in active subjects, and how many have had a
     * session finished at least once. */
    topicsStudied: number;
    topicsTotal: number;
    /** Required sessions of the plan scheduled from its start to the week
     * end, and how many are finished. */
    toDate: { required: number; finished: number };
    /** null unless upcoming with a plan. Rule: thresholds.ts READINESS_*. */
    readiness: ReadinessStatus | null;
  };

  /** The plan's next week. null if no plan, the exam is over, or built
   * later. v2: plannedMinutes; v3: topics, how many topics come up (a
   * forecast: each topic's next review). */
  nextWeek: { plannedMinutes?: number; topics?: number; focusTopics: TopicRef[] } | null;

  action: { kind: ActionKind; topic?: TopicRef; subjectName?: string };

  /** Milestones first earned this week. */
  milestonesUnlocked: MilestoneKey[];

  /** Every topic's revision gap now, for next week's "getting stronger".
   * Empty when built later (today's gaps don't belong to that week). */
  intervalDays: Record<string, number>;
}

export interface TestChange {
  name: string; // subject name, or topic name for topic rows
  subjectName: string;
  assessmentName: string;
  date: string;
  percent: number;
  /** The same subject's (or topic's) test before this one. */
  previousPercent: number | null;
  confidence: 'low' | 'medium' | 'high' | null;
}
