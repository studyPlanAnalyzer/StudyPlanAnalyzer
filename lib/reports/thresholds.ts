// ---------------------------------------------------------------------------
// Every number the weekly report's rules use, in one file. Each is used by
// lib/reports/build-weekly-report.ts and explained where it is used there.
// ---------------------------------------------------------------------------

// Exam readiness: required sessions finished / required sessions scheduled,
// from the start of the plan to the end of the report week.
/** At or above this share (%): "on track so far". */
export const READINESS_ON_TRACK_PERCENT = 85;
/** At or above this share (%), below on-track: "a little behind so far".
 * Below it: "some catching up to do so far". */
export const READINESS_SLIGHTLY_BEHIND_PERCENT = 65;
/** Fewer required sessions scheduled than this: "too early to tell". */
export const READINESS_MIN_SESSIONS = 5;

// Topics needing attention.
/** Rated Again or Hard at least this many times… */
export const ATTENTION_MIN_HARD_RATINGS = 2;
/** …within this many days, ending on the last day of the report week. */
export const ATTENTION_RATING_WINDOW_DAYS = 28;
/** A topic is "weak" when leafPriority's weaknessPercent is above this. It is
 * the plan generator's own boundary for its weak tier (mastery below 50%). */
export const WEAK_TOPIC_WEAKNESS_PERCENT = 50;
/** At most this many topics are listed as needing attention. */
export const ATTENTION_MAX_TOPICS = 3;

/** At most this many "getting stronger" topics are listed. */
export const STRONGER_MAX_TOPICS = 3;
/** Next week's focus topics. */
export const FOCUS_TOPICS = 3;

// Headline rules.
/** A week needs at least this many required sessions scheduled before
 * "every session finished" or "a lighter week" can be said about it. */
export const HEADLINE_MIN_REQUIRED_SESSIONS = 3;
/** Share of planned study days studied (%) for "a consistent week". */
export const HEADLINE_CONSISTENT_DAYS_PERCENT = 80;
/** Daily challenge: attempts and average score (%) for "a strong challenge
 * week". */
export const HEADLINE_CHALLENGE_MIN_ATTEMPTS = 3;
export const HEADLINE_CHALLENGE_MIN_PERCENT = 80;
/** Required sessions finished below this share (%): "a lighter week". */
export const HEADLINE_LIGHT_WEEK_PERCENT = 50;

/** "One thing to do": no test logged for this many days → suggest logging
 * the latest result. */
export const ACTION_TEST_STALE_DAYS = 28;

// Milestones.
export const MILESTONE_STREAK_DAYS = 7;
export const MILESTONE_REVIEWS_ON_TIME = 10;

/** History read for the streaks (days). Longer runs are cut at this length. */
export const STREAK_HISTORY_DAYS = 120;
