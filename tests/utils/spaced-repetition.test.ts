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
// SM-2 is what the app promises: "Topics that feel easy come back later. Topics
// that feel hard come back sooner." These tests pin down exactly how many days
// each rating sends a topic away, on a fake clock that steps through real days,
// and check the plan generator then puts the review on that day.
//
// Ratings: 1 Again, 2 Hard, 3 Good, 4 Easy.
// ---------------------------------------------------------------------------

const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;
const DAY_MS = 864e5;
// 10:00 in Nepal on Mon 2026-11-09 (04:15 UTC), well clear of midnight.
const START = Date.UTC(2026, 10, 9, 4, 15);

let clock = START;
beforeEach(() => {
  clock = START;
  mock.timers.enable({ apis: ['Date'], now: START });
});
afterEach(() => mock.timers.reset());

/** Moves the fake clock forward whole days. */
function advanceDays(n: number) {
  clock += n * DAY_MS;
  mock.timers.setTime(clock);
}
const today = () => toDateString(appToday());
const gap = (from: string, to: string) => diffInDays(fromDateString(to), fromDateString(from));

/**
 * Reviews a topic with each rating in turn, ON its due day each time (as a
 * child following the plan would), and returns the gap in days after each one.
 * With `examInDays`, the exam cap is worked out each day from the days left,
 * the same way the session route does.
 */
function walk(ratings: Rating[], examInDays?: number) {
  const exam = examInDays === undefined ? undefined : addDays(appToday(), examInDays);
  let state = defaultSpacedState();
  const gaps: number[] = [];
  const eases: number[] = [];
  for (const rating of ratings) {
    const cap = exam ? intervalCapForExam(diffInDays(exam, appToday())) : undefined;
    const reviewedOn = today();
    state = updateTopicSpacedState(state, rating, cap);
    assert.equal(state.lastReviewDate, reviewedOn);
    const days = gap(reviewedOn, state.nextReviewDate!);
    assert.equal(days, state.intervalDays, 'nextReviewDate must be today + intervalDays');
    gaps.push(days);
    eases.push(state.easeFactor);
    advanceDays(days); // jump to the day it is due
  }
  return { gaps, eases, state };
}

const times = (r: Rating, n: number) => Array<Rating>(n).fill(r);
const round2 = (n: number) => Math.round(n * 100) / 100;

describe('SM-2: days until a topic comes back (no exam cap)', () => {
  test('Easy every time: 1, 6, 17, 48, 140, 420 days, gaps rounded up, ease past 3.0', () => {
    // SM-2 rounds a fractional gap up (6 x 2.7 = 16.2 -> 17) and has no
    // maximum ease.
    const { gaps, eases } = walk(times(EASY, 6));
    assert.deepEqual(gaps, [1, 6, 17, 48, 140, 420]);
    assert.deepEqual(eases.map(round2), [2.6, 2.7, 2.8, 2.9, 3.0, 3.1]);
  });

  test('Good every time: 1, 6, 15, 38, 95 days', () => {
    const { gaps, eases } = walk(times(GOOD, 5));
    assert.deepEqual(gaps, [1, 6, 15, 38, 95]);
    assert.deepEqual(eases.map(round2), [2.5, 2.5, 2.5, 2.5, 2.5]);
  });

  test('Hard every time: a pass, so the gap still grows (1, 6, 14, 30, 59) while the ease drops 0.14', () => {
    // SM-2 grade 3, "correct response recalled with serious difficulty".
    const { gaps, eases, state } = walk(times(HARD, 5));
    assert.deepEqual(gaps, [1, 6, 14, 30, 59]);
    assert.deepEqual(eases.map(round2), [2.36, 2.22, 2.08, 1.94, 1.8]);
    assert.equal(state.repetitionCount, 5);
    assert.equal(state.status, 'reviewing');
  });

  test('Again every time: back the next day, ease unchanged', () => {
    // SM-2 restarts a lapsed item "without changing the E-Factor".
    const { gaps, eases, state } = walk(times(AGAIN, 5));
    assert.deepEqual(gaps, [1, 1, 1, 1, 1]);
    assert.deepEqual(eases.map(round2), [2.5, 2.5, 2.5, 2.5, 2.5]);
    assert.equal(state.repetitionCount, 0);
    assert.equal(state.status, 'learning');
  });

  test('forgetting restarts the ladder: Good x3, Again, then Good climbs 1, 1, 6, 15 again', () => {
    const { gaps, eases } = walk([GOOD, GOOD, GOOD, AGAIN, GOOD, GOOD, GOOD]);
    // 15 days after the third Good; Again brings it back tomorrow; then the
    // ladder restarts at 1 and 6, and the ease (unchanged by Again) gives 15.
    assert.deepEqual(gaps, [1, 6, 15, 1, 1, 6, 15]);
    assert.equal(round2(eases[3]), 2.5);
  });

  test('later on, Easy brings a topic back later than Good, Good later than Hard', () => {
    const easy = walk(times(EASY, 4)).gaps;
    const good = walk(times(GOOD, 4)).gaps;
    const hard = walk(times(HARD, 4)).gaps;
    for (let i = 0; i < 4; i++) {
      assert.ok(easy[i] >= good[i], `review ${i + 1}: Easy ${easy[i]}d < Good ${good[i]}d`);
      assert.ok(good[i] >= hard[i], `review ${i + 1}: Good ${good[i]}d < Hard ${hard[i]}d`);
    }
    assert.ok(easy[3] > good[3] && good[3] > hard[3]);
  });

  test('ease follows the SM-2 formula for q = rating + 1 on a pass, floor 1.3, no maximum; Again leaves it alone', () => {
    for (const rating of [AGAIN, HARD, GOOD, EASY] as Rating[]) {
      for (const ef of [1.3, 1.5, 2.0, 2.5, 2.9, 3.0, 3.5]) {
        const q = rating + 1;
        const expected = rating === AGAIN ? ef : Math.max(1.3, ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
        const next = updateTopicSpacedState({ ...defaultSpacedState(), easeFactor: ef }, rating);
        assert.equal(round2(next.easeFactor), round2(expected), `rating ${rating}, ease ${ef}`);
      }
    }
  });

  test('the interval multiplies by the ease factor from before this review', () => {
    const state: SpacedState = { ...defaultSpacedState(), intervalDays: 10, repetitionCount: 3, easeFactor: 2.0 };
    assert.equal(updateTopicSpacedState(state, GOOD).intervalDays, 20);
    assert.equal(updateTopicSpacedState(state, EASY).intervalDays, 20);
  });

  test('ease survives a save to numeric(4,2) and back without drift', () => {
    // The route stores String(easeFactor) in numeric(4,2) and reads Number().
    let state = defaultSpacedState();
    for (const r of [EASY, HARD, GOOD, AGAIN, EASY, EASY, HARD] as Rating[]) {
      state = updateTopicSpacedState(state, r);
      const stored = Number(Number(state.easeFactor).toFixed(2));
      assert.ok(Math.abs(stored - state.easeFactor) < 1e-9, `ease ${state.easeFactor} would be rounded`);
      state = { ...state, easeFactor: stored };
      advanceDays(state.intervalDays);
    }
  });

  test('the input state is not mutated', () => {
    const before = { ...defaultSpacedState(), intervalDays: 6, repetitionCount: 2 };
    const copy = { ...before };
    updateTopicSpacedState(before, EASY);
    assert.deepEqual(before, copy);
  });
});

describe('SM-2: review dates follow the Nepal calendar day', () => {
  test('a review at 23:59 in Nepal counts as that day; at 00:01 as the next', () => {
    mock.timers.setTime(Date.UTC(2026, 10, 9, 18, 14)); // 23:59 Mon 9 Nov in Nepal
    const late = updateTopicSpacedState(defaultSpacedState(), GOOD);
    assert.equal(late.lastReviewDate, '2026-11-09');
    assert.equal(late.nextReviewDate, '2026-11-10');

    mock.timers.setTime(Date.UTC(2026, 10, 9, 18, 16)); // 00:01 Tue 10 Nov in Nepal
    const early = updateTopicSpacedState(defaultSpacedState(), GOOD);
    assert.equal(early.lastReviewDate, '2026-11-10');
    assert.equal(early.nextReviewDate, '2026-11-11');
  });

  test('long gaps cross month and year ends correctly', () => {
    mock.timers.setTime(Date.UTC(2026, 11, 20, 4, 15)); // 20 Dec 2026
    const s = updateTopicSpacedState(
      { ...defaultSpacedState(), intervalDays: 15, repetitionCount: 2, easeFactor: 2.5 },
      GOOD,
    );
    assert.equal(s.intervalDays, 38);
    assert.equal(s.nextReviewDate, '2027-01-27');
  });
});

describe('Exam cap: gaps stay inside the time before the exam', () => {
  test('cap is about 15% of the days left, between 5 and 21', () => {
    const table: [number, number][] = [
      [-5, 5], [0, 5], [1, 5], [10, 5], [20, 5], [23, 5], [24, 5], [28, 5],
      [30, 5], [36, 5], [37, 6], [60, 9], [90, 14], [120, 18], [140, 21], [365, 21],
    ];
    for (const [days, cap] of table) assert.equal(intervalCapForExam(days), cap, `${days} days left`);
  });

  test('no gap is ever longer than the cap on the day of the review (a mastered topic: 14 days)', () => {
    for (const examIn of [7, 14, 28, 45, 60, 90, 120, 180]) {
      for (const r of [EASY, GOOD] as Rating[]) {
        mock.timers.setTime(START);
        clock = START;
        const exam = addDays(appToday(), examIn);
        let state = defaultSpacedState();
        while (diffInDays(exam, appToday()) > 0) {
          const cap = intervalCapForExam(diffInDays(exam, appToday()));
          state = updateTopicSpacedState(state, r, cap);
          const limit = state.status === 'mastered' ? Math.max(cap, 14) : cap;
          assert.ok(state.intervalDays <= limit, `exam in ${examIn}, gap ${state.intervalDays} > limit ${limit}`);
          assert.ok(state.intervalDays >= 1);
          advanceDays(state.intervalDays);
        }
      }
    }
  });

  test('Again brings a topic back the next day under any cap; Hard grows the gap up to the cap', () => {
    for (const cap of [3, 9, 21]) {
      const state = { ...defaultSpacedState(), intervalDays: 15, repetitionCount: 3 };
      assert.equal(updateTopicSpacedState(state, AGAIN, cap).intervalDays, 1);
      // Uncapped, Hard would give 15 x 2.5 = 38 days.
      assert.equal(updateTopicSpacedState(state, HARD, cap).intervalDays, Math.min(38, cap));
    }
  });

  test('60-day exam, Good every time: 1, 6, 8, 7, 6, then every 5 days before the exam', () => {
    const { gaps } = walk(times(GOOD, 10), 60);
    assert.deepEqual(gaps, [1, 6, 8, 7, 6, 5, 5, 5, 5, 5]);
  });

  test('a review with 2 days left is at most 5 days out (past the exam: the plan gives a final look)', () => {
    const s = updateTopicSpacedState(
      { ...defaultSpacedState(), intervalDays: 6, repetitionCount: 2 },
      GOOD,
      intervalCapForExam(2),
    );
    assert.equal(s.intervalDays, 5);
  });
});

// ---------------------------------------------------------------------------
// The whole loop: a rating sets nextReviewDate, and the plan rebuilt the next
// day (what the session route does) puts that topic's review on that date.
// ---------------------------------------------------------------------------

const ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function planFor(topics: { id: string; state: SpacedState | null }[], examInDays: number, exam?: Date) {
  const subject: SubjectInput = {
    id: 'maths',
    name: 'Maths',
    examWeight: 'medium',
    marksHistory: { records: [], latestConfidence: null },
    estimatedConfidence: 'medium',
    topics: topics.map(({ id, state }) => ({
      id,
      subjectId: 'maths',
      difficultyRating: 2,
      estimatedMastery: null,
      spacedState: state
        ? { status: state.status, nextReviewDate: state.nextReviewDate, repetitionCount: state.repetitionCount }
        : null,
    })),
  };
  return generateStudyPlan({
    examDate: exam ?? addDays(appToday(), examInDays),
    studyDays: ALL_DAYS,
    subjects: [subject],
    startDate: appToday(),
  });
}
const requiredFor = (plan: ReturnType<typeof planFor>, topicId: string) =>
  plan.sessions.filter((s) => s.topicId === topicId && !s.isFiller);

describe('Plan generator puts each review on the day SM-2 chose', () => {
  test('a new topic gets a learn session today and its first review tomorrow', () => {
    const plan = planFor([{ id: 't', state: null }], 60);
    const sessions = requiredFor(plan, 't');
    assert.deepEqual(
      sessions.map((s) => [s.sessionType, gap(today(), s.scheduledDate)]),
      [['learn', 0], ['review', 1]],
    );
  });

  test('after each rating, the rebuilt plan has exactly one review, on nextReviewDate', () => {
    for (const rating of [AGAIN, HARD, GOOD, EASY] as Rating[]) {
      mock.timers.setTime(START);
      const state = updateTopicSpacedState(
        { ...defaultSpacedState(), intervalDays: 6, repetitionCount: 2, easeFactor: 2.5 },
        rating,
        intervalCapForExam(90),
      );
      const plan = planFor([{ id: 't', state }], 90);
      const sessions = requiredFor(plan, 't');
      assert.equal(sessions.length, 1, `rating ${rating}`);
      assert.equal(sessions[0].sessionType, 'review');
      assert.equal(sessions[0].scheduledDate, state.nextReviewDate, `rating ${rating}`);
    }
  });

  test('a child following the plan for 60 days: every review lands on its due day', () => {
    // Day by day: do whatever is due today, rate it, rebuild the plan from
    // tomorrow, and check the plan's next session for the topic is the date
    // SM-2 stored. A pattern of ratings, not all the same.
    const exam = addDays(appToday(), 60);
    const pattern: Rating[] = [GOOD, GOOD, HARD, GOOD, EASY, GOOD, AGAIN, GOOD, EASY, EASY];
    let state: SpacedState | null = null;
    let reviews = 0;
    let plan = planFor([{ id: 't', state }], 0, exam);
    while (diffInDays(exam, appToday()) > 0) {
      const due = requiredFor(plan, 't').find((s) => s.scheduledDate === today());
      if (due) {
        const cap = intervalCapForExam(diffInDays(exam, appToday()));
        // Only a review due on/after the exam may come early: that is the
        // planned last look before the exam, which doesn't advance the ladder.
        const isDue = !state?.nextReviewDate || today() >= state.nextReviewDate;
        const lastLook = !!state?.nextReviewDate && state.nextReviewDate >= toDateString(exam);
        assert.ok(isDue || lastLook, `a session on ${today()} before its due date ${state?.nextReviewDate}`);
        if (!isDue) break;
        state = updateTopicSpacedState(state ?? defaultSpacedState(), pattern[reviews % pattern.length], cap);
        reviews++;
        advanceDays(1);
        plan = planFor([{ id: 't', state }], 0, exam);
        const next = requiredFor(plan, 't')[0];
        if (state.nextReviewDate! < toDateString(exam)) {
          assert.ok(next, `no review planned after ${today()}`);
          assert.equal(next.scheduledDate, state.nextReviewDate);
        }
      } else {
        advanceDays(1);
      }
    }
    assert.ok(reviews >= 8, `only ${reviews} reviews in 60 days`);
  });

  test('no session is ever planned on or after the exam day', () => {
    const exam = addDays(appToday(), 30);
    const state = updateTopicSpacedState(
      { ...defaultSpacedState(), intervalDays: 15, repetitionCount: 3 },
      EASY,
    ); // uncapped: 38 days, past the exam
    const plan = planFor([{ id: 't', state }], 0, exam);
    for (const s of plan.sessions) assert.ok(s.scheduledDate < toDateString(exam), s.scheduledDate);
    // It still gets a last look before the exam.
    assert.equal(requiredFor(plan, 't').length, 1);
  });
});

// ---------------------------------------------------------------------------
// What the landing page promises, checked against what actually happens for a
// typical school exam. The ones marked TODO fail today and are reported, not
// counted as failures, until the product decides how to fix them.
// ---------------------------------------------------------------------------

describe('Landing page promises (typical exam window)', () => {
  test(
    '"Topics that feel easy come back later": Easy beats Good with the exam 60 days away',
    () => {
      // Three Easy reviews make a topic mastered, which lifts it off the exam cap.
      const easy = walk(times(EASY, 4), 60).gaps;
      mock.timers.setTime(START);
      clock = START;
      const good = walk(times(GOOD, 4), 60).gaps;
      assert.notDeepEqual(easy, good, `Easy ${easy} and Good ${good} give the same gaps`);
    },
  );

  test(
    'Easy on the first study session pushes the topic further than tomorrow',
    { todo: 'SM-2 sends every first pass back in 1 day, whatever the rating' },
    () => {
      assert.ok(walk([EASY]).gaps[0] > walk([GOOD]).gaps[0]);
    },
  );

  test(
    'Hard (a struggle, but recalled) comes back later than Again (forgotten)',
    () => {
      const hard = walk([GOOD, GOOD, GOOD, HARD]).gaps[3];
      mock.timers.setTime(START);
      clock = START;
      const again = walk([GOOD, GOOD, GOOD, AGAIN]).gaps[3];
      assert.ok(hard > again, `Hard ${hard}d vs Again ${again}d`);
    },
  );

  test(
    'Revision calendar: "longer gaps each time" for a topic rated Good, exam 28 days away',
    { todo: 'the cap shrinks as the exam nears: real gaps are 1, 5, 5, 5' },
    () => {
      const { gaps } = walk(times(GOOD, 4), 28);
      for (let i = 1; i < gaps.length; i++)
        assert.ok(gaps[i] > gaps[i - 1], `gaps ${gaps} do not grow`);
    },
  );
});
