import {
  addDays,
  dayAbbreviation,
  diffInDays,
  toDateString,
  appToday,
} from './date-utils';
import { MAX_EXAM_DAYS_AHEAD } from './study-limits';
import {
  blendedPercent,
  ESTIMATED_CONFIDENCE_PERCENT,
  EstimatedConfidence,
  WeightedRecord,
} from './scoring';

export type ExamWeight = 'low' | 'medium' | 'high';
export type SessionType = 'learn' | 'practice' | 'review' | 'mock';
export type TopicSpacedStatus = 'new' | 'learning' | 'reviewing' | 'mastered';

export interface TopicSpacedStateInput {
  status: TopicSpacedStatus;
  nextReviewDate: string | null;
  repetitionCount: number;
  /** Last day the topic was studied in a rated session, due or not. */
  lastSeenDate?: string | null;
}

export interface TopicInput {
  id: string;
  subjectId: string;
  difficultyRating: number;
  estimatedMastery: number | null;
  /** The confidence given with this topic's latest test, if it had one. */
  latestConfidence?: 'low' | 'medium' | 'high' | null;
  /** Rated Again/Hard on 2 of the last 3 sessions (lib/utils/topic-status). */
  struggling?: boolean;
  /** Its only rating so far is its learn session: the next review is its first follow-up. */
  firstFollowUp?: boolean;
  /** A new topic's learn session goes on the first study day on or after this
   * (the day after it was added; later for a setup batch). Unset: from the start. */
  learnFrom?: string | null;
  spacedState?: TopicSpacedStateInput | null;
}

export type SubjectMarkRecord = WeightedRecord;

export interface SubjectMarksHistory {
  records: SubjectMarkRecord[];
  latestConfidence?: 'low' | 'medium' | 'high' | null;
}

export interface SubjectInput {
  id: string;
  name: string;
  examWeight: ExamWeight;
  marksHistory: SubjectMarksHistory;
  /**
   * A parent's rough starting confidence, used ONLY while the subject has no
   * marks at all. Deliberately kept beside (not inside) marksHistory so it can
   * never be blended with real results.
   */
  estimatedConfidence?: EstimatedConfidence | null;
  topics: TopicInput[];
}

export interface PlanGeneratorInput {
  examDate: Date;
  scheduleEndDate?: Date;
  studyDays: string[];
  subjects: SubjectInput[];
  startDate?: Date;
}

export type Tier = 'weak' | 'medium' | 'strong';

export interface SessionDraft {
  topicId: string | null;
  subjectId: string | null;
  scheduledDate: string;
  durationMinutes: number;
  sessionType: SessionType;
  tier: Tier;
  /** Order within its day: 0 is the top of the day's list. */
  position: number;
  isFiller?: boolean;
}

export interface PlanGeneratorResult {
  totalDays: number;
  averageDailyMinutes: number;
  weakFocusPercent: number;
  mediumFocusPercent: number;
  strongFocusPercent: number;
  sessions: SessionDraft[];
  unscheduledTopicIds: string[];
}

const EXAM_WEIGHT_MULTIPLIER: Record<ExamWeight, number> = {
  low: 0.8,
  medium: 1.0,
  high: 1.5,
};
const LOW_CONFIDENCE_WEAKNESS_BOOST = 15;
/** Difficulty 4 and 5: a hard topic (never in the strong tier). */
export const HARD_DIFFICULTY_THRESHOLD = 4;
const LOW_CONFIDENCE_MIN_WEAKNESS = 26;
/** Final looks fall in the plan's last this-many days. */
export const FINAL_LOOK_DAYS = 14;
// A mastered topic's review is a quick check, whatever its tier.
const MASTERED_REVIEW_MINUTES = 15;

/**
 * First day of the final-look window: the last FINAL_LOOK_DAYS days of the
 * schedule. If no study day falls in them (say, a long holiday), it starts on
 * the last study day instead, so the window always holds one.
 */
function finalWindowStart(scheduleEnd: Date, studyDays: string[]): string {
  let start = addDays(scheduleEnd, -(FINAL_LOOK_DAYS - 1));
  for (let i = 0; i < 7; i++) {
    const day = addDays(scheduleEnd, -i);
    if (studyDays.includes(dayAbbreviation(day))) {
      if (day.getTime() < start.getTime()) start = day;
      break;
    }
  }
  return toDateString(start);
}

function trendFactor(records: SubjectMarkRecord[]): number {
  if (records.length < 2) return 1.0;
  const latest = records[records.length - 1].percent;
  const previous = records[records.length - 2].percent;
  const delta = latest - previous;
  if (delta <= -3) return 1.3;
  if (delta >= 3) return 0.85;
  return 1.0;
}

// The percent that weakness and tier are derived from. Real marks always win;
// the estimate is only a stand-in for the flat default when there are none.
function subjectBaselinePercent(subject: SubjectInput): number {
  const { records } = subject.marksHistory;
  if (records.length === 0 && subject.estimatedConfidence) {
    return ESTIMATED_CONFIDENCE_PERCENT[subject.estimatedConfidence];
  }
  return blendedPercent(records);
}

// "Low confidence" means weaker than the marks alone suggest.
function withLowConfidenceBoost(weakness: number): number {
  return Math.min(
    100,
    Math.max(
      weakness + LOW_CONFIDENCE_WEAKNESS_BOOST,
      LOW_CONFIDENCE_MIN_WEAKNESS,
    ),
  );
}

function effectiveWeaknessPercent(subject: SubjectInput): number {
  const percent = subjectBaselinePercent(subject);
  let weakness = Math.max(0, 100 - percent);
  if (subject.marksHistory.latestConfidence === 'low') {
    weakness = withLowConfidenceBoost(weakness);
  }
  return weakness;
}

// A parent's gut-sense estimate is a weak signal, so for a subject with no
// marks it only nudges priority this far away from the neutral 50. That keeps
// topic difficulty (up to DIFFICULTY_PRIORITY_WEIGHT) the stronger factor: a
// difficulty-5 topic in a "high confidence" subject still outranks an easy
// topic in a "low confidence" one. Tiers still use the full mapped percent.
const ESTIMATE_PRIORITY_INFLUENCE = 0.2;

export function subjectPriority(subject: SubjectInput): number {
  let weakness = effectiveWeaknessPercent(subject);
  if (
    subject.marksHistory.records.length === 0 &&
    subject.estimatedConfidence
  ) {
    weakness = 50 + (weakness - 50) * ESTIMATE_PRIORITY_INFLUENCE;
  }
  const importance = EXAM_WEIGHT_MULTIPLIER[subject.examWeight];
  const trend = trendFactor(subject.marksHistory.records);
  return weakness * importance * trend;
}

const DIFFICULTY_PRIORITY_WEIGHT = 40;

// 0 for difficulty 1, up to DIFFICULTY_PRIORITY_WEIGHT for difficulty 5
function difficultyBoost(topic: TopicInput): number {
  return ((topic.difficultyRating - 1) / 4) * DIFFICULTY_PRIORITY_WEIGHT;
}

/** Priority of a topic that has no results of its own: the subject baseline. */
export function topicPriority(subjPriority: number, topic: TopicInput): number {
  return subjPriority + difficultyBoost(topic);
}

/**
 * Priority and weakness of one lowest-level topic. Everything is judged at
 * that level: a topic with its own test results is scored from them alone,
 * so a sibling's result can never move it, and it never moves a sibling. A
 * topic with no results of its own falls back to the subject baseline (the
 * subject's whole-subject marks, or the estimated confidence).
 */
export function leafPriority(
  subject: SubjectInput,
  topic: TopicInput,
): { priority: number; weaknessPercent: number } {
  if (topic.estimatedMastery != null) {
    // The topic's own confidence counts the same way a subject's does: a
    // topic that scored well but felt shaky is still treated as weaker.
    let weaknessPercent = Math.max(0, 100 - topic.estimatedMastery);
    if (topic.latestConfidence === 'low')
      weaknessPercent = withLowConfidenceBoost(weaknessPercent);
    return {
      priority:
        weaknessPercent * EXAM_WEIGHT_MULTIPLIER[subject.examWeight] +
        difficultyBoost(topic),
      weaknessPercent,
    };
  }
  return {
    priority: topicPriority(subjectPriority(subject), topic),
    weaknessPercent: effectiveWeaknessPercent(subject),
  };
}

function tierForTopic(weaknessPercent: number, topic: TopicInput): Tier {
  const percent = 100 - weaknessPercent;
  let tier: Tier = percent < 50 ? 'weak' : percent < 75 ? 'medium' : 'strong';
  const isHardTopic = topic.difficultyRating >= HARD_DIFFICULTY_THRESHOLD;
  if (isHardTopic && tier === 'strong') tier = 'medium';
  return tier;
}

interface CalendarDay {
  date: Date;
  key: string;
}

/** The child's study days from start to end, inclusive. No minutes: a day holds whatever is due. */
function buildCalendar(start: Date, end: Date, studyDays: string[]): CalendarDay[] {
  const days: CalendarDay[] = [];
  let cur = start;
  while (cur.getTime() <= end.getTime()) {
    if (studyDays.includes(dayAbbreviation(cur))) days.push({ date: cur, key: toDateString(cur) });
    cur = addDays(cur, 1);
  }
  return days;
}

const LEARN_MINUTES: Record<Tier, number> = {
  weak: 40,
  medium: 30,
  strong: 20,
};

// A struggling (Needs practice) topic shows the next tier's (longer) time
// estimate. Its tier, and so the plan's focus split and its priority, still
// come from marks.
const LONGER_TIER: Record<Tier, Tier> = {
  strong: 'medium',
  medium: 'weak',
  weak: 'weak',
};

function inProgressReviewMinutes(tier: Tier): number {
  if (tier === 'weak') return 25;
  if (tier === 'medium') return 20;
  return 15;
}

// Where a session sits in its day's list, first to last: new topics, each
// new topic's first follow-up (the day after learning, when a topic is
// easiest to lose), then every other review, longest overdue first.
const GROUP_FIRST_FOLLOW_UP = 0;
const GROUP_NEW = 1;
const GROUP_REVIEW = 2;

interface PlacedSession extends SessionDraft {
  group: number;
  /** For ordering reviews: the SM-2 due date; the earliest (longest overdue) goes first. */
  dueKey: string;
  struggling: boolean;
  priority: number;
}

const onLadder = (s: TopicSpacedStateInput | null | undefined) =>
  !!s && (s.repetitionCount > 0 || !!s.nextReviewDate);

/**
 * The plan from `startDate` to the last study day before the exam (or the
 * buffer week), for the current exam's topics (and earlier topics rated
 * Again on a revision day: lib/plan-inputs.ts). `studyDays` are the days
 * SM-2 sessions go on (lib/utils/revision-days.ts). There is no minutes
 * budget and no daily goal: every topic SM-2 says is due is listed on its
 * due day, overdue ones on the first day, so no topic can be crowded out.
 * Whatever isn't done is listed again, in its place, when the plan is rebuilt.
 *
 * - A new topic gets its learn session on the first study day on or after
 *   its learnFrom date (the day after it was added), whatever the number
 *   that day, and its first follow-up review the next study day.
 * - Topics on the SM-2 ladder get one review, on the first study day on or
 *   after their due date.
 * - Final looks: a topic due after the plan ends, or a mastered topic due in
 *   the last FINAL_LOOK_DAYS days, gets one look in those days instead. The
 *   looks are spread over the window, the topic seen longest ago first, and
 *   never come after the topic's own due date. A topic already seen in the
 *   window gets none.
 * - Each day's list is ordered: first follow-ups (the next-day review after a
 *   learn session, so SM-2's first step is never pushed back), then new
 *   topics, then the other reviews by due date (longest overdue first). Ties:
 *   Needs practice first, then the weaker topic. `position` numbers that order.
 */
export function generateStudyPlan(
  input: PlanGeneratorInput,
): PlanGeneratorResult {
  const start = input.startDate ? input.startDate : appToday();
  // The last study day is the day before the exam (the plan is gone from the
  // start of exam day), and a schedule never runs longer than the furthest an
  // exam can be set, whatever dates reach this function.
  const scheduleEnd = [
    input.scheduleEndDate ?? input.examDate,
    addDays(input.examDate, -1),
    addDays(start, MAX_EXAM_DAYS_AHEAD),
  ].reduce((a, b) => (b.getTime() < a.getTime() ? b : a));
  const totalDays = Math.max(1, diffInDays(input.examDate, start));
  const calendar = buildCalendar(start, scheduleEnd, input.studyDays);
  const scheduleEndKey = toDateString(scheduleEnd);
  const windowStartKey = finalWindowStart(scheduleEnd, input.studyDays);
  const startKey = toDateString(start);
  /** The first study day on or after `key`, or undefined past the plan's end. */
  const dayOnOrAfter = (key: string) => calendar.find((d) => d.key >= key);

  const entries = input.subjects.flatMap((subject) =>
    subject.topics.map((topic) => {
      const { priority, weaknessPercent } = leafPriority(subject, topic);
      const tier = tierForTopic(weaknessPercent, topic);
      return {
        topic,
        subject,
        priority,
        tier,
        lengthTier: topic.struggling ? LONGER_TIER[tier] : tier,
      };
    }),
  );
  type Entry = (typeof entries)[number];
  const placed: PlacedSession[] = [];
  const place = (e: Entry, day: CalendarDay, type: SessionType, minutes: number, group: number, dueKey: string) =>
    placed.push({
      topicId: e.topic.id,
      subjectId: e.subject.id,
      scheduledDate: day.key,
      durationMinutes: minutes,
      sessionType: type,
      tier: e.tier,
      position: 0,
      group,
      dueKey,
      struggling: !!e.topic.struggling,
      priority: e.priority,
    });

  // ---- Topics on the SM-2 ladder: one review each.
  const learned = entries.filter((e) => onLadder(e.topic.spacedState));
  const isMastered = (e: Entry) => e.topic.spacedState?.status === 'mastered';
  const finalLookOnly = (e: Entry) => {
    const next = e.topic.spacedState?.nextReviewDate ?? null;
    return next !== null && (next > scheduleEndKey || (isMastered(e) && next > windowStartKey));
  };
  const seenInWindow = (e: Entry) => {
    const seen = e.topic.spacedState?.lastSeenDate;
    return !!seen && seen >= windowStartKey;
  };

  // Final looks, spread over the window: the topic seen longest ago first.
  const finalLookDay = new Map<string, CalendarDay>();
  const lookers = learned
    .filter((e) => finalLookOnly(e) && !seenInWindow(e))
    .sort((a, b) =>
      (a.topic.spacedState?.lastSeenDate ?? '').localeCompare(b.topic.spacedState?.lastSeenDate ?? ''),
    );
  const windowDays = calendar.filter((d) => d.key >= windowStartKey);
  lookers.forEach((e, i) => {
    let day = windowDays.at(Math.floor((i * windowDays.length) / lookers.length));
    if (!day) return;
    // Never after the topic's own due date.
    const own = dayOnOrAfter(e.topic.spacedState!.nextReviewDate!);
    if (own && own.key < day.key) day = own;
    finalLookDay.set(e.topic.id, day);
  });

  for (const e of learned) {
    const spaced = e.topic.spacedState!;
    const minutes = isMastered(e)
      ? Math.min(MASTERED_REVIEW_MINUTES, inProgressReviewMinutes(e.tier))
      : inProgressReviewMinutes(e.lengthTier);
    const dueKey = spaced.nextReviewDate ?? startKey;
    if (finalLookOnly(e)) {
      // Not due before the plan ends: a final look, unless already seen.
      const day = finalLookDay.get(e.topic.id);
      if (day) place(e, day, 'review', minutes, GROUP_REVIEW, dueKey);
      continue;
    }
    const day = dayOnOrAfter(dueKey); // overdue: the first day
    if (!day) continue;
    place(e, day, 'review', minutes, e.topic.firstFollowUp ? GROUP_FIRST_FOLLOW_UP : GROUP_REVIEW, dueKey);
  }

  // ---- New topics: a learn session on the first study day on or after
  // learnFrom, then the first follow-up the study day after.
  const fresh = entries
    .filter((e) => !onLadder(e.topic.spacedState))
    .sort((a, b) => b.priority - a.priority);
  for (const e of fresh) {
    const from = e.topic.learnFrom && e.topic.learnFrom > startKey ? e.topic.learnFrom : startKey;
    const today = dayOnOrAfter(from);
    if (!today) continue; // added too late to fit before the plan ends
    place(e, today, 'learn', LEARN_MINUTES[e.lengthTier], GROUP_NEW, today.key);
    // SM-2's first step is one day: the first follow-up comes the next
    // study day. Once rated, SM-2 decides every later date.
    const next = calendar[calendar.indexOf(today) + 1];
    if (next) place(e, next, 'review', inProgressReviewMinutes(e.lengthTier), GROUP_FIRST_FOLLOW_UP, next.key);
  }

  // ---- Each day's order, numbered.
  placed.sort(
    (a, b) =>
      a.scheduledDate.localeCompare(b.scheduledDate) ||
      a.group - b.group ||
      (a.group === GROUP_REVIEW ? a.dueKey.localeCompare(b.dueKey) : 0) ||
      Number(b.struggling) - Number(a.struggling) ||
      b.priority - a.priority,
  );
  let day = '';
  let position = 0;
  for (const p of placed) {
    if (p.scheduledDate !== day) {
      day = p.scheduledDate;
      position = 0;
    }
    p.position = position++;
  }
  const sessions: SessionDraft[] = placed.map(
    ({ group: _g, dueKey: _d, struggling: _s, priority: _p, ...s }) => s,
  );

  // The plan's focus, and its expected load: estimated minutes per study day.
  const minutesByTier: Record<Tier, number> = { weak: 0, medium: 0, strong: 0 };
  for (const s of sessions) minutesByTier[s.tier] += s.durationMinutes;
  const totalMinutes = minutesByTier.weak + minutesByTier.medium + minutesByTier.strong;
  const pct = (n: number) => (totalMinutes > 0 ? Math.round((n / totalMinutes) * 100) : 0);

  return {
    totalDays,
    averageDailyMinutes: calendar.length > 0 ? Math.round(totalMinutes / calendar.length) : 0,
    weakFocusPercent: pct(minutesByTier.weak),
    mediumFocusPercent: pct(minutesByTier.medium),
    strongFocusPercent: pct(minutesByTier.strong),
    sessions,
    // Nothing is left out any more: every topic is on the list.
    unscheduledTopicIds: [],
  };
}
