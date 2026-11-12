import { describe, test, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateStudyPlan,
  type SubjectInput,
  type TopicInput,
  type SessionDraft,
} from '@/lib/utils/plan-generator';
import {
  updateTopicSpacedState,
  intervalCapForExam,
  defaultSpacedState,
  type SpacedState,
} from '@/lib/utils/spaced-repetition';
import { recentPace } from '@/lib/utils/study-history';
import { addDays, appToday, diffInDays, fromDateString, toDateString } from '@/lib/utils/date-utils';

// ---------------------------------------------------------------------------
// The scheduler without a minutes budget: every due topic is listed, in one
// fixed order, and the child works down it as far as they get.
// ---------------------------------------------------------------------------

// 10:00 in Nepal on Mon 2026-11-09 (04:15 UTC).
const START = Date.UTC(2026, 10, 9, 4, 15);
const DAY_MS = 864e5;
let clock = START;
beforeEach(() => {
  clock = START;
  mock.timers.enable({ apis: ['Date'], now: START });
});
afterEach(() => mock.timers.reset());
const advanceDays = (n: number) => {
  clock += n * DAY_MS;
  mock.timers.setTime(clock);
};
const ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const day = (n: number) => toDateString(addDays(fromDateString('2026-11-09'), n));

const reviewing = (nextReviewDate: string, extra: Partial<NonNullable<TopicInput['spacedState']>> = {}) => ({
  status: 'reviewing' as const,
  nextReviewDate,
  repetitionCount: 3,
  lastSeenDate: day(-20),
  ...extra,
});
const t = (id: string, extra: Partial<TopicInput> = {}): TopicInput => ({
  id,
  subjectId: 'maths',
  difficultyRating: 2,
  estimatedMastery: null,
  spacedState: null,
  ...extra,
});
function plan(topics: TopicInput[], examInDays = 60, studyDays = ALL_DAYS) {
  const subject: SubjectInput = {
    id: 'maths',
    name: 'Maths',
    examWeight: 'medium',
    marksHistory: { records: [], latestConfidence: null },
    estimatedConfidence: 'medium',
    topics,
  };
  return generateStudyPlan({
    examDate: addDays(appToday(), examInDays),
    studyDays,
    subjects: [subject],
    startDate: appToday(),
  });
}
const onDay = (sessions: SessionDraft[], key: string) =>
  sessions.filter((s) => s.scheduledDate === key).sort((a, b) => a.position - b.position);

describe("A day's list: one fixed order", () => {
  test('first follow-ups, then new topics, then reviews longest overdue first', () => {
    const p = plan([
      t('due-today', { spacedState: reviewing(day(0)) }),
      t('overdue-5', { spacedState: reviewing(day(-5)) }),
      t('follow-up', { firstFollowUp: true, spacedState: reviewing(day(0), { repetitionCount: 1 }) }),
      t('new'),
      t('overdue-1', { spacedState: reviewing(day(-1)) }),
    ]);
    assert.deepEqual(
      onDay(p.sessions, day(0)).map((s) => [s.topicId, s.sessionType, s.position]),
      [
        ['follow-up', 'review', 0],
        ['new', 'learn', 1],
        ['overdue-5', 'review', 2],
        ['overdue-1', 'review', 3],
        ['due-today', 'review', 4],
      ],
    );
  });

  test('ties: a Needs practice topic first, then the weaker topic', () => {
    const p = plan([
      t('strong', { estimatedMastery: 90, spacedState: reviewing(day(0)) }),
      t('weak', { estimatedMastery: 30, spacedState: reviewing(day(0)) }),
      t('needs-practice', { estimatedMastery: 90, struggling: true, spacedState: reviewing(day(0)) }),
    ]);
    assert.deepEqual(onDay(p.sessions, day(0)).map((s) => s.topicId), ['needs-practice', 'weak', 'strong']);
  });

  test('positions start at 0 on every day', () => {
    const p = plan([t('a', { spacedState: reviewing(day(0)) }), t('b', { spacedState: reviewing(day(3)) })]);
    assert.deepEqual(p.sessions.map((s) => [s.scheduledDate, s.position]), [[day(0), 0], [day(3), 0]]);
  });
});

describe('No minutes budget', () => {
  test('every topic due today is listed today, however many', () => {
    const topics = Array.from({ length: 50 }, (_, i) => t(`t${i}`, { spacedState: reviewing(day(0)) }));
    const today = onDay(plan(topics).sessions, day(0));
    assert.equal(today.length, 50);
    assert.deepEqual(today.map((s) => s.position), Array.from({ length: 50 }, (_, i) => i));
  });

  test('an overdue topic is listed on the first day', () => {
    const p = plan([t('late', { spacedState: reviewing(day(-30)) })]);
    assert.deepEqual(p.sessions.map((s) => s.scheduledDate), [day(0)]);
  });

  test('hard topics are never moved off their due date', () => {
    const topics = Array.from({ length: 5 }, (_, i) => t(`hard${i}`, { difficultyRating: 5, spacedState: reviewing(day(2)) }));
    assert.ok(plan(topics).sessions.every((s) => s.scheduledDate === day(2)));
  });

  test('a review due on a day off is listed on the next study day', () => {
    // 2026-11-14 (day 5) is a Saturday.
    const p = plan([t('sat', { spacedState: reviewing(day(5)) })], 60, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    assert.deepEqual(p.sessions.map((s) => s.scheduledDate), [day(6)]);
  });

  test('there are no optional sessions and nothing is left out', () => {
    const p = plan(Array.from({ length: 40 }, (_, i) => t(`n${i}`)));
    assert.ok(!p.sessions.some((s) => s.isFiller));
    assert.deepEqual(p.unscheduledTopicIds, []);
  });
});

describe('Final looks: spread over the last 14 days', () => {
  test('oldest-seen first across the window, each on its own day here', () => {
    // Exam on day 30: the plan ends day 29, the window is days 16 to 29.
    const topics = Array.from({ length: 14 }, (_, i) =>
      t(`f${i}`, { spacedState: reviewing(day(40), { lastSeenDate: day(i - 14) }) }),
    );
    const looks = plan(topics, 30).sessions;
    assert.equal(looks.length, 14);
    for (let i = 0; i < 14; i++) assert.equal(looks.find((s) => s.topicId === `f${i}`)?.scheduledDate, day(16 + i));
  });

  test('never after the topic\'s own due date', () => {
    // Mastered, due on day 17: inside the window, so a final look, but no later than day 17.
    const topics = [
      ...Array.from({ length: 10 }, (_, i) => t(`old${i}`, { spacedState: reviewing(day(40), { lastSeenDate: day(-30) }) })),
      t('mastered', { spacedState: reviewing(day(17), { status: 'mastered', lastSeenDate: day(3) }) }),
    ];
    const look = plan(topics, 30).sessions.find((s) => s.topicId === 'mastered');
    assert.ok(look && look.scheduledDate <= day(17), look?.scheduledDate);
  });
});

describe('New topics: taught today, learned the next study day', () => {
  test('a topic added today has its learn session tomorrow and its first review the day after', () => {
    const p = plan([t('taught', { learnFrom: day(1) })]);
    assert.deepEqual(
      p.sessions.map((s) => [s.scheduledDate, s.sessionType]),
      [[day(1), 'learn'], [day(2), 'review']],
    );
  });

  test('however many are added, each starts on its own day: no cap', () => {
    const p = plan(Array.from({ length: 9 }, (_, i) => t(`n${i}`, { learnFrom: day(1) })));
    assert.equal(onDay(p.sessions, day(1)).filter((s) => s.sessionType === 'learn').length, 9);
  });

  test('on days with no SM-2 sessions (revision days), the learn session waits for the next school day', () => {
    // 2026-11-13 (day 4) is a Friday: added then, learned on Monday (day 7).
    const p = plan([t('friday', { learnFrom: day(5) })], 60, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    assert.deepEqual(
      p.sessions.map((s) => [s.scheduledDate, s.sessionType]),
      [[day(7), 'learn'], [day(8), 'review']],
    );
  });

  test('a learn session that was missed comes back today', () => {
    const p = plan([t('missed', { learnFrom: day(-2) })]);
    assert.equal(p.sessions[0].scheduledDate, day(0));
  });
});

describe('Pace for the status card', () => {
  test('the plain average of the last 7 study days, null before the first', () => {
    assert.equal(recentPace([]), null);
    assert.equal(recentPace([2, 3]), 2.5);
    assert.equal(recentPace([10, 10, 1, 1, 1, 1, 1, 1, 1]), 1);
  });
});

describe('Fairness: no topic starves', () => {
  test('a child who does only 3 topics a day still reviews every one of 75 topics during a 90-day term', () => {
    // Every listed session counts as a review (final looks included).
    const exam = addDays(appToday(), 90);
    const states = new Map<string, SpacedState>();
    const reviewed = new Set<string>();
    // 75 topics learned last term, due over the next two weeks or already overdue.
    for (let i = 0; i < 75; i++)
      states.set(`t${i}`, {
        ...defaultSpacedState(),
        intervalDays: 5,
        repetitionCount: 4,
        status: 'reviewing',
        lastReviewDate: day((i % 15) - 20),
        nextReviewDate: day((i % 15) - 10),
      });
    for (let d = 0; d < 90; d++) {
      const p = plan(
        Array.from(states.entries()).map(([id, s]) =>
          t(id, { spacedState: { status: s.status, nextReviewDate: s.nextReviewDate, repetitionCount: s.repetitionCount, lastSeenDate: s.lastReviewDate } }),
        ),
        diffInDays(exam, appToday()),
      );
      for (const s of onDay(p.sessions, toDateString(appToday())).slice(0, 3)) {
        const cap = intervalCapForExam(diffInDays(exam, appToday()));
        states.set(s.topicId!, updateTopicSpacedState(states.get(s.topicId!)!, 3, cap));
        reviewed.add(s.topicId!);
      }
      advanceDays(1);
    }
    assert.equal(reviewed.size, 75, `${75 - reviewed.size} topics were never reviewed`);
  });
});
