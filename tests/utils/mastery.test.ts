import { describe, test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  updateTopicSpacedState,
  intervalCapForExam,
  defaultSpacedState,
  type Rating,
  type SpacedState,
} from '@/lib/utils/spaced-repetition';
import { generateStudyPlan, type SubjectInput } from '@/lib/utils/plan-generator';
import { addDays, appToday, diffInDays, fromDateString, toDateString } from '@/lib/utils/date-utils';

// ---------------------------------------------------------------------------
// Mastery and the final look before the exam.
//
// - Three Easy reviews in a row (the learning session's rating doesn't count)
//   make a topic mastered. Its gap is then limited to 14 days instead of the
//   exam cap, and it gets one final look at the start of the last 5 days.
// - Good keeps mastery; Hard or Again takes it away.
// - Any topic gets ONE last look in the final window, not one every remaining
//   day (the plan is rebuilt daily, and used to add one each time).
// ---------------------------------------------------------------------------

const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;
const DAY_MS = 864e5;
// 10:00 in Nepal on Mon 2026-11-09 (04:15 UTC), well clear of midnight.
const START = Date.UTC(2026, 10, 9, 4, 15);
const ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

let clock = START;
beforeEach(() => {
  clock = START;
  mock.timers.enable({ apis: ['Date'], now: START });
});
afterEach(() => mock.timers.reset());

function advanceDays(n: number) {
  clock += n * DAY_MS;
  mock.timers.setTime(clock);
}
const today = () => toDateString(appToday());
/** Day n of the test, counted from START. */
const day = (n: number) => toDateString(addDays(fromDateString('2026-11-09'), n));
const dayNumber = (key: string) => diffInDays(fromDateString(key), fromDateString('2026-11-09'));

/** Rates on each due day in turn, with the exam cap; returns gaps and states. */
function walk(ratings: Rating[], examInDays: number) {
  const exam = addDays(appToday(), examInDays);
  let state = defaultSpacedState();
  const gaps: number[] = [];
  const states: SpacedState[] = [];
  for (const rating of ratings) {
    state = updateTopicSpacedState(state, rating, intervalCapForExam(diffInDays(exam, appToday())));
    gaps.push(state.intervalDays);
    states.push(state);
    advanceDays(state.intervalDays);
  }
  return { gaps, states };
}

// Low confidence makes the topic Weak tier: 25-minute reviews when not mastered.
function planFor(
  state: (Pick<SpacedState, 'status' | 'nextReviewDate' | 'repetitionCount'> & { lastSeenDate?: string | null }) | null,
  exam: Date,
  studyDays = ALL_DAYS,
) {
  const subject: SubjectInput = {
    id: 'sci',
    name: 'Science',
    examWeight: 'medium',
    marksHistory: { records: [], latestConfidence: null },
    estimatedConfidence: 'low',
    topics: [
      {
        id: 'force',
        subjectId: 'sci',
        difficultyRating: 3,
        estimatedMastery: null,
        spacedState: state
          ? {
              status: state.status,
              nextReviewDate: state.nextReviewDate,
              repetitionCount: state.repetitionCount,
              lastSeenDate: state.lastSeenDate ?? null,
            }
          : null,
      },
    ],
  };
  return generateStudyPlan({
    examDate: exam,
    studyDays,
    subjects: [subject],
    startDate: appToday(),
  });
}
const required = (plan: ReturnType<typeof planFor>) =>
  plan.sessions.filter((s) => s.topicId === 'force' && !s.isFiller);

describe('Mastery: earned with three Easy reviews in a row', () => {
  test("the learning session's Easy doesn't count; the third Easy review masters the topic", () => {
    const { states } = walk([EASY, EASY, EASY, EASY], 60);
    assert.deepEqual(states.map((s) => s.easyStreak), [0, 1, 2, 3]);
    assert.deepEqual(states.map((s) => s.status), ['reviewing', 'reviewing', 'reviewing', 'mastered']);
  });

  test('Good keeps mastery but restarts the Easy count', () => {
    const { states } = walk([EASY, EASY, EASY, EASY, GOOD, EASY], 90);
    assert.deepEqual(states.slice(3).map((s) => [s.status, s.easyStreak]), [
      ['mastered', 3],
      ['mastered', 0],
      ['mastered', 1],
    ]);
  });

  test('a Good in the middle restarts the count: Easy, Easy, Good, Easy, Easy is not mastered', () => {
    const { states } = walk([EASY, EASY, EASY, GOOD, EASY, EASY], 90);
    assert.equal(states[5].status, 'reviewing');
    assert.equal(states[5].easyStreak, 2);
  });

  test('Hard takes mastery away; as a pass, the topic keeps growing under the exam cap', () => {
    const { states } = walk([EASY, EASY, EASY, EASY, HARD], 60);
    assert.equal(states[4].status, 'reviewing');
    assert.equal(states[4].easyStreak, 0);
    assert.ok(states[4].intervalDays > 1);
    assert.ok(states[4].intervalDays <= 9, 'no longer allowed the 14-day mastery limit');
  });

  test('Again takes mastery away and brings the topic back tomorrow', () => {
    const { states } = walk([EASY, EASY, EASY, EASY, AGAIN], 60);
    assert.equal(states[4].status, 'learning');
    assert.equal(states[4].easyStreak, 0);
    assert.equal(states[4].intervalDays, 1);
  });
});

describe('Mastery: the 14-day limit replaces the exam cap', () => {
  const mastered = (intervalDays: number): SpacedState => ({
    ...defaultSpacedState(),
    status: 'mastered',
    easyStreak: 3,
    repetitionCount: 5,
    intervalDays,
    easeFactor: 2.8,
    lastReviewDate: '2026-11-01',
  });

  test('with a 5-day exam cap, a mastered topic can still go 14 days', () => {
    assert.equal(updateTopicSpacedState(mastered(10), EASY, 5).intervalDays, 14);
    assert.equal(updateTopicSpacedState(mastered(10), GOOD, 5).intervalDays, 14);
  });

  test('a mastered topic never gets a shorter gap than a normal one: a 21-day cap still applies', () => {
    assert.equal(updateTopicSpacedState(mastered(10), EASY, 21).intervalDays, 21);
  });

  test('with no exam set, mastery changes nothing about the classic SM-2 gaps', () => {
    assert.equal(updateTopicSpacedState(mastered(16), EASY).intervalDays, 45); // 16 x 2.8
  });
});

describe('Exam 30 days away, Force and Motion rated Easy every time', () => {
  test('SM-2 alone: gaps 1, 5, 5, then 14 once mastered, landing on day 25', () => {
    const { gaps, states } = walk([EASY, EASY, EASY, EASY], 30);
    assert.deepEqual(gaps, [1, 5, 5, 14]);
    assert.equal(states[3].status, 'mastered');
    assert.equal(states[3].nextReviewDate, day(25));
  });

  test('a child following the plan: learn on day 0, reviews on days 1, 6, 11, final look on day 16, then done', () => {
    // Mastered on day 11 and next due on day 25, inside the last 14 days
    // (16 to 29): its final look comes at the start of that window.
    const seen = followPlan(30, () => EASY);
    assert.deepEqual(seen.map((s) => [s.day, s.type]), [
      [0, 'learn'], [1, 'review'], [6, 'review'], [11, 'review'], [16, 'review'],
    ]);
    assert.equal(seen[4].minutes, 15, 'a mastered topic gets a quick check');
  });
});

describe('Final look: one per topic, not one every remaining day', () => {
  test('a review due after the plan ends gets one last look; once seen in the last 14 days, nothing more', () => {
    const exam = addDays(appToday(), 30);
    advanceDays(28); // day 28: reviewed on day 27, next due on exam day
    const state = { status: 'reviewing' as const, nextReviewDate: day(30), repetitionCount: 8 };
    assert.equal(required(planFor({ ...state, lastSeenDate: day(27) }, exam)).length, 0);
    // Not seen in the final window yet: it still gets its last look.
    const plan = planFor({ ...state, lastSeenDate: day(10) }, exam);
    assert.deepEqual(required(plan).map((s) => s.scheduledDate), [day(28)]);
    assert.deepEqual(plan.unscheduledTopicIds, []);
  });

  test('Good every time, exam 30 days away: no topic is reviewed on day after day at the end', () => {
    const seen = followPlan(30, () => GOOD);
    const notDue = seen.filter((s) => !s.due);
    assert.ok(notDue.length <= 1, `extra looks on days ${notDue.map((s) => s.day)}`);
    for (let i = 1; i < seen.length; i++)
      assert.ok(seen[i].day - seen[i - 1].day >= 5 || i <= 2, `days ${seen.map((s) => s.day)}`);
  });

  test("a mastered topic due inside the final window is looked at on the window's first day", () => {
    // Exam on day 30: the last 14 days are days 16 to 29.
    const exam = addDays(appToday(), 30);
    advanceDays(10);
    const plan = planFor({ status: 'mastered', nextReviewDate: day(27), repetitionCount: 5, lastSeenDate: day(3) }, exam);
    assert.deepEqual(required(plan).map((s) => [s.scheduledDate, s.durationMinutes]), [[day(16), 15]]);
  });

  test('a mastered topic due before the final window is reviewed on its due day', () => {
    const exam = addDays(appToday(), 60);
    const plan = planFor({ status: 'mastered', nextReviewDate: day(20), repetitionCount: 5, lastSeenDate: day(6) }, exam);
    assert.deepEqual(required(plan).map((s) => [s.scheduledDate, s.durationMinutes]), [[day(20), 15]]);
  });

  test('Saturdays only: the final look falls on the first Saturday of the last 14 days', () => {
    // Exam on Wed 2026-12-09 (day 30); the last 14 days (Wed 25 Nov to Tue
    // 8 Dec) hold Sat 28 Nov and Sat 5 Dec.
    const exam = addDays(appToday(), 30);
    const plan = planFor({ status: 'reviewing', nextReviewDate: day(40), repetitionCount: 4, lastSeenDate: day(14) }, exam, ['Sat']);
    assert.deepEqual(required(plan).map((s) => s.scheduledDate), ['2026-11-28']);
  });
});

/**
 * A child following the plan day by day, as the app does it: do the topic's
 * required session if there is one today, rate it (a good rating only moves
 * the ladder when the session is due; Hard/Again always does), record that
 * the topic was seen, then rebuild the plan.
 */
function followPlan(examInDays: number, rate: (n: number) => Rating) {
  const exam = addDays(appToday(), examInDays);
  let state: SpacedState | null = null;
  let lastSeenDate: string | null = null;
  const seen: { day: number; type: string; minutes: number; due: boolean }[] = [];
  let plan = planFor(null, exam);
  while (diffInDays(exam, appToday()) > 0) {
    const session = required(plan).find((s) => s.scheduledDate === today());
    if (session) {
      const rating = rate(seen.length);
      const due = !state?.nextReviewDate || today() >= state.nextReviewDate;
      seen.push({ day: dayNumber(today()), type: session.sessionType, minutes: session.durationMinutes, due });
      if (due || rating <= 2)
        state = updateTopicSpacedState(state ?? defaultSpacedState(), rating, intervalCapForExam(diffInDays(exam, appToday())));
      lastSeenDate = today();
    }
    advanceDays(1);
    plan = planFor(state ? { ...state, lastSeenDate } : null, exam);
  }
  return seen;
}
