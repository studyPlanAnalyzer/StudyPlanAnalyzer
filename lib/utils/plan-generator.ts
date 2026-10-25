import {
  addDays,
  dayAbbreviation,
  diffInDays,
  isWeekday,
  toDateString,
  todayUTC,
} from './date-utils';
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
}

export interface TopicInput {
  id: string;
  subjectId: string;
  difficultyRating: number;
  estimatedMastery: number | null;
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
  schoolDayMinutes: number;
  holidayDayMinutes: number;
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
const HARD_DIFFICULTY_THRESHOLD = 4;
const MAX_HARD_TOPICS_PER_DAY = 2;
const LOW_CONFIDENCE_MIN_WEAKNESS = 26;
const FINAL_REVIEW_DAYS = 5;

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

function effectiveWeaknessPercent(subject: SubjectInput): number {
  const percent = subjectBaselinePercent(subject);
  let weakness = Math.max(0, 100 - percent);
  if (subject.marksHistory.latestConfidence === 'low') {
    weakness = Math.min(
      100,
      Math.max(
        weakness + LOW_CONFIDENCE_WEAKNESS_BOOST,
        LOW_CONFIDENCE_MIN_WEAKNESS,
      ),
    );
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
    const weaknessPercent = Math.max(0, 100 - topic.estimatedMastery);
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
  capacityMinutes: number;
  usedMinutes: number;
  hardTopicsScheduled: number;
}

function buildCalendar(
  start: Date,
  end: Date,
  studyDays: string[],
  schoolDayMinutes: number,
  holidayDayMinutes: number,
): CalendarDay[] {
  const days: CalendarDay[] = [];
  let cur = start;
  while (cur.getTime() <= end.getTime()) {
    const abbrev = dayAbbreviation(cur);
    if (studyDays.includes(abbrev)) {
      const capacity = isWeekday(cur) ? schoolDayMinutes : holidayDayMinutes;
      days.push({
        date: cur,
        key: toDateString(cur),
        capacityMinutes: capacity,
        usedMinutes: 0,
        hardTopicsScheduled: 0,
      });
    }
    cur = addDays(cur, 1);
  }
  return days;
}

function findSlot(
  calendar: CalendarDay[],
  fromIndex: number,
  durationMinutes: number,
  isHardTopic: boolean,
): number {
  for (let i = Math.max(0, fromIndex); i < calendar.length; i++) {
    const day = calendar[i];
    const hardOk =
      !isHardTopic || day.hardTopicsScheduled < MAX_HARD_TOPICS_PER_DAY;
    if (hardOk && day.usedMinutes + durationMinutes <= day.capacityMinutes)
      return i;
  }
  return -1;
}

function reserveSlot(
  day: CalendarDay,
  durationMinutes: number,
  isHardTopic: boolean,
) {
  day.usedMinutes += durationMinutes;
  if (isHardTopic) day.hardTopicsScheduled += 1;
}

const LEARN_MINUTES: Record<Tier, number> = {
  weak: 40,
  medium: 30,
  strong: 20,
};

function inProgressReviewMinutes(tier: Tier): number {
  if (tier === 'weak') return 25;
  if (tier === 'medium') return 20;
  return 15;
}

export function generateStudyPlan(
  input: PlanGeneratorInput,
): PlanGeneratorResult {
  const start = input.startDate ? input.startDate : todayUTC();
  const scheduleEnd = input.scheduleEndDate ?? input.examDate;
  const totalDays = Math.max(1, diffInDays(input.examDate, start));
  const calendar = buildCalendar(
    start,
    scheduleEnd,
    input.studyDays,
    input.schoolDayMinutes,
    input.holidayDayMinutes,
  );

  const totalAvailableMinutes = calendar.reduce(
    (sum, d) => sum + d.capacityMinutes,
    0,
  );
  const averageDailyMinutes =
    calendar.length > 0
      ? Math.round(totalAvailableMinutes / calendar.length)
      : 0;

  const sessions: SessionDraft[] = [];
  const unscheduledTopicIds: string[] = [];

  // Every topic from every subject goes through the main loop, whatever its
  // tier. Weak topics sort first so they get the best slots; strong topics
  // get a short learn session and a sparse review chain.
  const plannedTopics = input.subjects
    .flatMap((subject) =>
      subject.topics.map((topic) => {
        const { priority, weaknessPercent } = leafPriority(subject, topic);
        return {
          topic,
          subject,
          priority,
          tier: tierForTopic(weaknessPercent, topic),
        };
      }),
    )
    .sort((a, b) => b.priority - a.priority);

  for (const entry of plannedTopics) {
    const { topic, subject, tier } = entry;
    const isHard = topic.difficultyRating >= HARD_DIFFICULTY_THRESHOLD;
    const spaced = topic.spacedState;

    // A topic that has been rated before is on the SM-2 ladder, including one
    // rated Again/Hard (count reset to 0 but next review set): it gets a single
    // review on its due date, not a fresh learn sequence.
    if (spaced && (spaced.repetitionCount > 0 || spaced.nextReviewDate)) {
      const minutes = inProgressReviewMinutes(tier);
      let searchFrom = 0;
      if (spaced.nextReviewDate) {
        const idx = calendar.findIndex((d) => d.key >= spaced.nextReviewDate!);
        // A review due after the schedule ends still gets one last look in
        // the final days. It isn't due yet, so it won't advance the ladder.
        searchFrom =
          idx === -1 ? Math.max(0, calendar.length - FINAL_REVIEW_DAYS) : idx;
      }
      const slotIdx = findSlot(calendar, searchFrom, minutes, isHard);
      if (slotIdx === -1) {
        unscheduledTopicIds.push(topic.id);
        continue;
      }
      reserveSlot(calendar[slotIdx], minutes, isHard);
      sessions.push({
        topicId: topic.id,
        subjectId: subject.id,
        scheduledDate: calendar[slotIdx].key,
        durationMinutes: minutes,
        sessionType: 'review',
        tier,
      });
      continue;
    }

    const learnMinutes = LEARN_MINUTES[tier];
    const learnIdx = findSlot(calendar, 0, learnMinutes, isHard);
    if (learnIdx === -1) {
      unscheduledTopicIds.push(topic.id);
      continue;
    }
    reserveSlot(calendar[learnIdx], learnMinutes, isHard);
    sessions.push({
      topicId: topic.id,
      subjectId: subject.id,
      scheduledDate: calendar[learnIdx].key,
      durationMinutes: learnMinutes,
      sessionType: 'learn',
      tier,
    });

    // SM-2's first interval is one day. Schedule just that one review; once
    // it is rated, SM-2 decides every later date (the plan is rebuilt daily).
    const reviewIdx = calendar.findIndex(
      (d) => diffInDays(d.date, calendar[learnIdx].date) >= 1,
    );
    if (reviewIdx !== -1) {
      const reviewMinutes = inProgressReviewMinutes(tier);
      const slotIdx = findSlot(calendar, reviewIdx, reviewMinutes, isHard);
      if (slotIdx !== -1) {
        reserveSlot(calendar[slotIdx], reviewMinutes, isHard);
        sessions.push({
          topicId: topic.id,
          subjectId: subject.id,
          scheduledDate: calendar[slotIdx].key,
          durationMinutes: reviewMinutes,
          sessionType: 'review',
          tier,
        });
      }
    }
  }

  const fillerPool = plannedTopics.map((e) => ({
    topicId: e.topic.id,
    subjectId: e.subject.id,
    isHard: e.topic.difficultyRating >= HARD_DIFFICULTY_THRESHOLD,
  }));

  const MIN_FILLER_MINUTES = 10;
  const STANDARD_FILLER_MINUTES = 20;
  const MAX_FILLER_ATTEMPTS_PER_DAY = 50;

  if (fillerPool.length > 0) {
    let rotation = 0;
    for (const day of calendar) {
      let remaining = day.capacityMinutes - day.usedMinutes;
      let attempts = 0;
      while (
        remaining >= MIN_FILLER_MINUTES &&
        attempts < MAX_FILLER_ATTEMPTS_PER_DAY
      ) {
        attempts++;
        const candidate = fillerPool[rotation % fillerPool.length];
        rotation++;
        if (
          candidate.isHard &&
          day.hardTopicsScheduled >= MAX_HARD_TOPICS_PER_DAY
        )
          continue;
        const minutes =
          Math.min(remaining, STANDARD_FILLER_MINUTES) >= MIN_FILLER_MINUTES
            ? Math.min(remaining, STANDARD_FILLER_MINUTES)
            : remaining;
        reserveSlot(day, minutes, candidate.isHard);
        sessions.push({
          topicId: candidate.topicId,
          subjectId: candidate.subjectId,
          scheduledDate: day.key,
          durationMinutes: minutes,
          sessionType: 'practice',
          tier: 'medium',
          isFiller: true,
        });
        remaining = day.capacityMinutes - day.usedMinutes;
      }
    }
  }

  sessions.sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : 1));

  const minutesByTier: Record<Tier, number> = { weak: 0, medium: 0, strong: 0 };
  for (const s of sessions) minutesByTier[s.tier] += s.durationMinutes;
  const totalScheduledMinutes =
    minutesByTier.weak + minutesByTier.medium + minutesByTier.strong;
  const pct = (n: number) =>
    totalScheduledMinutes > 0
      ? Math.round((n / totalScheduledMinutes) * 100)
      : 0;

  return {
    totalDays,
    averageDailyMinutes,
    weakFocusPercent: pct(minutesByTier.weak),
    mediumFocusPercent: pct(minutesByTier.medium),
    strongFocusPercent: pct(minutesByTier.strong),
    sessions,
    unscheduledTopicIds,
  };
}
