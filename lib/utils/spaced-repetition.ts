import { addDays, todayUTC, toDateString } from './date-utils';

export type Rating = 1 | 2 | 3 | 4; // 1=Again, 2=Hard, 3=Good, 4=Easy
export type TopicStatus = 'new' | 'learning' | 'reviewing' | 'mastered';

export interface SpacedState {
  intervalDays: number;
  easeFactor: number;
  repetitionCount: number;
  lastReviewDate: string | null; // YYYY-MM-DD
  nextReviewDate: string | null; // YYYY-MM-DD
  status: TopicStatus;
}

/**
 * SM-2–style spaced repetition update.
 *
 * Given a topic's current spaced-repetition state and how the student rated
 * their last review session, computes the next interval, updated ease
 * factor, and next review date. This mirrors the well-known SuperMemo SM-2
 * algorithm, adapted to a 1-4 rating scale (Again/Hard/Good/Easy) instead of
 * SM-2's native 0-5 scale.
 *
 * - A rating of "Again" or "Hard" (<=2) resets the topic to the start of the
 *   learning sequence so it gets re-taught soon.
 * - A rating of "Good" or "Easy" advances the topic along the standard
 *   1 day -> 6 days -> interval*easeFactor progression.
 * - Ease factor is nudged up or down using the standard SM-2 formula, then
 *   clamped to [1.3, 3.0] so it never spirals to an unusable extreme.
 * - `maxIntervalDays` caps the gap so reviews stay inside the time left before
 *   the exam (see intervalCapForExam). Without it the classic intervals apply.
 */
export function updateTopicSpacedState(
  current: SpacedState,
  rating: Rating,
  maxIntervalDays?: number,
): SpacedState {
  const next: SpacedState = { ...current };

  if (rating <= 2) {
    // Again / Hard: relearn soon
    next.repetitionCount = 0;
    next.intervalDays = 1;
  } else {
    // Good / Easy: advance the interval
    if (next.repetitionCount === 0) {
      next.intervalDays = 1;
    } else if (next.repetitionCount === 1) {
      next.intervalDays = 6;
    } else {
      next.intervalDays = Math.round(next.intervalDays * next.easeFactor);
    }
    next.repetitionCount += 1;
  }

  // SM-2 ease factor adjustment. Map our 1-4 rating to SM-2's 2-5 "quality" scale.
  const q = rating + 1;
  next.easeFactor = next.easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  next.easeFactor = Math.max(1.3, Math.min(3.0, next.easeFactor));

  if (maxIntervalDays !== undefined) {
    next.intervalDays = Math.min(next.intervalDays, maxIntervalDays);
  }

  const reviewDate = todayUTC();
  next.lastReviewDate = toDateString(reviewDate);
  next.nextReviewDate = toDateString(addDays(reviewDate, next.intervalDays));

  // A topic is never retired: it keeps coming back, at the capped interval,
  // for as long as there is time before the exam.
  if (next.repetitionCount > 0) {
    next.status = 'reviewing';
  } else {
    next.status = 'learning';
  }

  return next;
}

/**
 * Longest allowed review gap, proportional to the time left before the exam:
 * about 15% of it, kept between 3 and 21 days. With 60 days left that is 9
 * days, so a topic can be reviewed at least four or five times before the exam
 * instead of the classic ladder jumping past it.
 */
export function intervalCapForExam(daysUntilExam: number): number {
  return Math.max(3, Math.min(21, Math.round(daysUntilExam * 0.15)));
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
  };
}
