import { addDays, appToday, toDateString } from './date-utils';

export type Rating = 1 | 2 | 3 | 4; // 1=Again, 2=Hard, 3=Good, 4=Easy
export type TopicStatus = 'new' | 'learning' | 'reviewing' | 'mastered';

export interface SpacedState {
  intervalDays: number;
  easeFactor: number;
  repetitionCount: number;
  lastReviewDate: string | null; // YYYY-MM-DD
  nextReviewDate: string | null; // YYYY-MM-DD
  status: TopicStatus;
  /** Easy ratings in a row on reviews (the first, learning, rating doesn't count). */
  easyStreak: number;
}

/** SM-2's lowest ease factor. There is no highest one. */
export const MIN_EASE = 1.3;

/**
 * SM-2 rounds a fractional gap up ("If interval is a fraction, round it up").
 * Floating-point noise (6 * 2.5 = 15.000000000000002) mustn't add a day.
 */
function roundUpDays(days: number): number {
  return Math.ceil(Number(days.toFixed(6)));
}

/** Easy reviews in a row that make a topic mastered. */
export const MASTERY_EASY_STREAK = 3;
/**
 * Longest gap for a mastered topic while an exam is set: it replaces the exam
 * cap (unless that cap is longer), so a topic the child knows well isn't
 * pulled back every few days, yet is never left unseen more than two weeks.
 */
export const MASTERED_MAX_INTERVAL_DAYS = 14;

/**
 * SM-2 update, exactly as SuperMemo published it (Wozniak, 1990:
 * https://super-memory.com/english/ol/sm2.htm), plus the exam adaptations
 * listed below. Our 1-4 ratings map to SM-2's quality grades q = rating + 1:
 * Again = 2, Hard = 3, Good = 4, Easy = 5 (grades 0 and 1 are unused).
 *
 * - Again (q < 3) is a lapse: "start repetitions for the item from the
 *   beginning without changing the E-Factor", so the topic comes back
 *   tomorrow and the ease stays as it was.
 * - Hard, Good and Easy (q >= 3) are passes: the topic moves along the
 *   1 day -> 6 days -> interval * easeFactor progression, the gap rounded up
 *   to whole days. Hard is "correct response recalled with serious
 *   difficulty" in SM-2: it still passes, but lowers the ease by 0.14.
 * - The ease changes by SM-2's formula after every pass. It never drops
 *   below 1.3 and, as in SM-2, has no maximum.
 *
 * Exam adaptations (the only departures from SM-2):
 * - `maxIntervalDays` caps the gap so reviews stay inside the time left before
 *   the exam (see intervalCapForExam). Without it the classic intervals apply.
 * - Mastery (an addition to SM-2): MASTERY_EASY_STREAK Easy reviews in a row
 *   make a topic "mastered". Its gap is then limited by
 *   MASTERED_MAX_INTERVAL_DAYS instead of the exam cap, and the plan gives it
 *   one final look before the exam (see the plan generator). Good keeps
 *   mastery but restarts the Easy count; Hard or Again takes mastery away.
 */
export function updateTopicSpacedState(
  current: SpacedState,
  rating: Rating,
  maxIntervalDays?: number,
): SpacedState {
  const next: SpacedState = { ...current };

  // The first rating ever is the learning session, just after studying the
  // topic: an Easy there says little about memory, so it doesn't count.
  const isFirstRating = current.lastReviewDate === null;
  next.easyStreak =
    rating === 4 ? (isFirstRating ? 0 : (current.easyStreak ?? 0) + 1) : 0;
  const mastered =
    rating >= 3 &&
    (current.status === 'mastered' || next.easyStreak >= MASTERY_EASY_STREAK);

  if (rating === 1) {
    // Again: a lapse. Back to the start of the ladder, ease unchanged.
    next.repetitionCount = 0;
    next.intervalDays = 1;
  } else {
    // Hard, Good, Easy: a pass. Advance the interval, rounded up.
    if (next.repetitionCount === 0) {
      next.intervalDays = 1;
    } else if (next.repetitionCount === 1) {
      next.intervalDays = 6;
    } else {
      next.intervalDays = roundUpDays(next.intervalDays * next.easeFactor);
    }
    next.repetitionCount += 1;

    // SM-2's ease formula, with q = rating + 1. Floor 1.3, no maximum.
    const q = rating + 1;
    next.easeFactor = Math.max(
      MIN_EASE,
      next.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)),
    );
  }

  if (maxIntervalDays !== undefined) {
    const limit = mastered
      ? Math.max(maxIntervalDays, MASTERED_MAX_INTERVAL_DAYS)
      : maxIntervalDays;
    next.intervalDays = Math.min(next.intervalDays, limit);
  }

  const reviewDate = appToday();
  next.lastReviewDate = toDateString(reviewDate);
  next.nextReviewDate = toDateString(addDays(reviewDate, next.intervalDays));

  // A topic is never retired: even a mastered one comes back within the
  // mastered limit, and gets a final look before the exam.
  if (mastered) {
    next.status = 'mastered';
  } else if (next.repetitionCount > 0) {
    next.status = 'reviewing';
  } else {
    next.status = 'learning';
  }

  return next;
}

/**
 * Longest allowed review gap, proportional to the time left before the exam:
 * about 15% of it, kept between 5 and 21 days. With 60 days left that is 9
 * days, so a topic can be reviewed at least four or five times before the exam
 * instead of the classic ladder jumping past it. The 5-day floor never delays
 * a lapse (Again brings a topic back tomorrow anyway), and near the exam a
 * topic the child recalls isn't pulled back every 3 days.
 */
export function intervalCapForExam(daysUntilExam: number): number {
  return Math.max(5, Math.min(21, Math.round(daysUntilExam * 0.15)));
}

/**
 * Test-score adjustment (an addition to SM-2, which only looks at session
 * ratings). `deltaPoints` is how far a topic's newest test is above or below
 * the blend of its earlier topic tests. Sized against SM-2's own steps (Again
 * -0.32, Easy +0.10): a drop costs 0.01 per point up to 0.3, a rise earns half
 * that rate up to 0.2 and only back up to the 2.5 starting value. A drop of 20
 * points or more also restarts the topic's ladder.
 */
export function adjustForTestTrend(easeFactor: number, deltaPoints: number) {
  const ease =
    deltaPoints < 0
      ? Math.max(1.3, easeFactor + Math.max(-0.3, deltaPoints * 0.01))
      : Math.max(
          easeFactor,
          Math.min(2.5, easeFactor + Math.min(0.2, deltaPoints * 0.005)),
        );
  return { easeFactor: ease, resetLadder: deltaPoints <= -20 };
}

export function defaultSpacedState(): SpacedState {
  return {
    intervalDays: 0,
    easeFactor: 2.5,
    repetitionCount: 0,
    lastReviewDate: null,
    nextReviewDate: null,
    status: 'new',
    easyStreak: 0,
  };
}
