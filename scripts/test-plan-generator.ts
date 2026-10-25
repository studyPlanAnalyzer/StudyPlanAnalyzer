/**
 * Lightweight regression tests for lib/utils/plan-generator.ts.
 *
 * No test framework (jest/vitest) is added here on purpose — this is a
 * handful of high-value scenario checks against the exact function real
 * requests call, using plain node `assert`. Run with:
 *
 *   npm run test:plan-generator
 */
import assert from 'node:assert/strict';
import {
  generateStudyPlan,
  subjectPriority,
  topicPriority,
  leafPriority,
  SubjectInput,
  TopicInput,
} from '../lib/utils/plan-generator';
import { ESTIMATED_CONFIDENCE_PERCENT } from '../lib/utils/scoring';
import {
  intervalCapForExam,
  adjustForTestTrend,
  updateTopicSpacedState,
  defaultSpacedState,
} from '../lib/utils/spaced-repetition';

function topic(
  id: string,
  subjectId: string,
  overrides: Partial<TopicInput> = {},
): TopicInput {
  return {
    id,
    subjectId,
    difficultyRating: 2,
    estimatedMastery: null,
    spacedState: null,
    ...overrides,
  };
}

function subject(
  id: string,
  overrides: Partial<SubjectInput> = {},
): SubjectInput {
  return {
    id,
    name: id,
    examWeight: 'medium',
    marksHistory: { records: [], latestConfidence: null },
    topics: [],
    ...overrides,
  };
}

const EXAM_DATE = new Date(Date.UTC(2026, 10, 7)); // Nov 7, 2026
const START_DATE = new Date(Date.UTC(2026, 8, 24)); // Sept 24, 2026 (~44 days runway)
const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ok  - ${name}`);
  } catch (err) {
    console.error(`FAIL - ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

console.log('plan-generator regression tests\n');

test('the plan reaches all the way to the schedule end date, not stopping weeks early', () => {
  const s = subject('s1', {
    marksHistory: {
      records: [{ percent: 30, fullMarks: 100 }],
      latestConfidence: null,
    },
    topics: [topic('algebra', 's1'), topic('geometry', 's1')],
  });

  const result = generateStudyPlan({
    examDate: EXAM_DATE,
    studyDays: ALL_DAYS,
    schoolDayMinutes: 60,
    holidayDayMinutes: 90,
    subjects: [s],
    startDate: START_DATE,
  });

  const lastSessionDate = result.sessions
    .map((s) => s.scheduledDate)
    .sort()
    .slice(-1)[0];
  // The exam is Nov 7; a healthy plan should keep scheduling content into
  // the final week or two, not die out a month early (the original bug).
  assert.ok(
    lastSessionDate >= '2026-10-24',
    `expected content late in the plan, last session was ${lastSessionDate}`,
  );
});

test('capacity utilization is high after the leveling pass — no more 45-of-60-minute days', () => {
  const s = subject('s1', {
    marksHistory: {
      records: [{ percent: 40, fullMarks: 100 }],
      latestConfidence: null,
    },
    topics: [topic('t1', 's1'), topic('t2', 's1'), topic('t3', 's1')],
  });

  const result = generateStudyPlan({
    examDate: EXAM_DATE,
    studyDays: ALL_DAYS,
    schoolDayMinutes: 60,
    holidayDayMinutes: 90,
    subjects: [s],
    startDate: START_DATE,
  });

  const dayTotals = new Map<string, number>();
  for (const sess of result.sessions) {
    dayTotals.set(
      sess.scheduledDate,
      (dayTotals.get(sess.scheduledDate) ?? 0) + sess.durationMinutes,
    );
  }
  const usedDays = Array.from(dayTotals.values());
  const avgUsed = usedDays.reduce((a, b) => a + b, 0) / usedDays.length;
  assert.ok(
    avgUsed >= 50,
    `expected most days to be well-used (avg >= 50 min), got avg ${avgUsed.toFixed(1)}`,
  );
});

test('a confident (strong) subject gets only a learn and one review per topic', () => {
  const s = subject('english', {
    marksHistory: {
      records: [{ percent: 92, fullMarks: 100 }],
      latestConfidence: 'high',
    },
    topics: [topic('grammar', 'english'), topic('essays', 'english')],
  });

  const result = generateStudyPlan({
    examDate: EXAM_DATE,
    studyDays: ALL_DAYS,
    schoolDayMinutes: 60,
    holidayDayMinutes: 90,
    subjects: [s],
    startDate: START_DATE,
  });

  const englishSessions = result.sessions.filter(
    (sess) =>
      sess.subjectId === 'english' && sess.tier === 'strong' && !sess.isFiller,
  );
  // Each topic gets a learn session plus its single next-day review (SM-2's
  // first interval); a confident subject gets no extra sessions beyond that.
  assert.equal(
    englishSessions.length,
    4,
    `expected a learn + one review per topic, got ${englishSessions.length}`,
  );
});

test('every subject gets real presence in the plan — none end up with zero sessions', () => {
  const weak = subject('math', {
    marksHistory: {
      records: [{ percent: 35, fullMarks: 100 }],
      latestConfidence: null,
    },
    topics: [topic('algebra', 'math')],
  });
  const strong = subject('art', {
    marksHistory: {
      records: [{ percent: 90, fullMarks: 100 }],
      latestConfidence: 'high',
    },
    topics: [topic('painting', 'art')],
  });

  const result = generateStudyPlan({
    examDate: EXAM_DATE,
    studyDays: ALL_DAYS,
    schoolDayMinutes: 60,
    holidayDayMinutes: 90,
    subjects: [weak, strong],
    startDate: START_DATE,
  });

  const subjectsWithSessions = new Set(result.sessions.map((s) => s.subjectId));
  assert.ok(
    subjectsWithSessions.has('math'),
    'the weak subject must appear in the plan',
  );
  assert.ok(
    subjectsWithSessions.has('art'),
    'the confident subject must still appear in the plan somewhere',
  );
});

test('a 99% score with LOW confidence gets more study time than a confident 99%', () => {
  const confident = subject('s5a', {
    marksHistory: {
      records: [{ percent: 99, fullMarks: 100 }],
      latestConfidence: 'high',
    },
    topics: [topic('t5a', 's5a')],
  });
  const unsure = subject('s5b', {
    marksHistory: {
      records: [{ percent: 99, fullMarks: 100 }],
      latestConfidence: 'low',
    },
    topics: [topic('t5b', 's5b')],
  });

  const result = generateStudyPlan({
    examDate: EXAM_DATE,
    studyDays: ALL_DAYS,
    schoolDayMinutes: 90,
    holidayDayMinutes: 90,
    subjects: [confident, unsure],
    startDate: START_DATE,
  });

  const confidentSessions = result.sessions.filter(
    (s) => s.subjectId === 's5a' && !s.isFiller,
  );
  const unsureSessions = result.sessions.filter(
    (s) => s.subjectId === 's5b' && !s.isFiller,
  );

  assert.ok(
    confidentSessions.length <= 3,
    'a genuinely confident 99% subject should only get its learn and review',
  );
  // Every topic now gets the same session count; the tier shows up as longer
  // sessions instead.
  const minutes = (list: typeof confidentSessions) =>
    list.reduce((sum, x) => sum + x.durationMinutes, 0);
  assert.ok(
    minutes(unsureSessions) > minutes(confidentSessions),
    `a 99% score with LOW confidence should get more study time than a confident 99% — got confident=${minutes(confidentSessions)}, unsure=${minutes(unsureSessions)}`,
  );
});

test('an in-progress topic gets a single review session anchored to its real due date', () => {
  const s = subject('s1', {
    marksHistory: {
      records: [{ percent: 40, fullMarks: 100 }],
      latestConfidence: null,
    },
    topics: [
      topic('t1', 's1', {
        spacedState: {
          status: 'reviewing',
          nextReviewDate: '2026-10-05',
          repetitionCount: 2,
        },
      }),
    ],
  });

  const result = generateStudyPlan({
    examDate: EXAM_DATE,
    studyDays: ALL_DAYS,
    schoolDayMinutes: 60,
    holidayDayMinutes: 90,
    subjects: [s],
    startDate: START_DATE,
  });

  const sessionsForTopic = result.sessions.filter(
    (sess) => sess.topicId === 't1' && !sess.isFiller,
  );
  assert.equal(
    sessionsForTopic.length,
    1,
    'an in-progress topic should get exactly one scheduled session',
  );
  assert.equal(sessionsForTopic[0].sessionType, 'review');
  assert.ok(sessionsForTopic[0].scheduledDate >= '2026-10-05');
});

test('a topic with many repetitions is still scheduled for another review', () => {
  const s = subject('s4', {
    topics: [
      topic('t4', 's4', {
        spacedState: {
          status: 'reviewing',
          nextReviewDate: '2026-10-10',
          repetitionCount: 8,
        },
      }),
    ],
  });
  const result = generateStudyPlan({
    examDate: EXAM_DATE,
    studyDays: ALL_DAYS,
    schoolDayMinutes: 60,
    holidayDayMinutes: 90,
    subjects: [s],
    startDate: START_DATE,
  });
  const core = result.sessions.filter((x) => x.topicId === 't4' && !x.isFiller);
  assert.equal(core.length, 1);
  assert.equal(core[0].sessionType, 'review');
});

test('scheduleEndDate stops the schedule early when a buffer week is requested', () => {
  const s = subject('s1', {
    marksHistory: {
      records: [{ percent: 30, fullMarks: 100 }],
      latestConfidence: null,
    },
    topics: [topic('t1', 's1')],
  });
  const scheduleEndDate = new Date(Date.UTC(2026, 9, 31)); // Oct 31 — 7 days before Nov 7

  const result = generateStudyPlan({
    examDate: EXAM_DATE,
    scheduleEndDate,
    studyDays: ALL_DAYS,
    schoolDayMinutes: 60,
    holidayDayMinutes: 90,
    subjects: [s],
    startDate: START_DATE,
  });

  const lastSessionDate = result.sessions
    .map((sess) => sess.scheduledDate)
    .sort()
    .slice(-1)[0];
  assert.ok(
    lastSessionDate <= '2026-10-31',
    `expected nothing scheduled after the buffer cutoff, got ${lastSessionDate}`,
  );
});

test('an impossible-to-fit topic is reported in unscheduledTopicIds, not silently dropped', () => {
  const s = subject('s6', {
    marksHistory: {
      records: [{ percent: 10, fullMarks: 100 }],
      latestConfidence: null,
    },
    topics: [topic('t6', 's6', { difficultyRating: 5 })],
  });

  const result = generateStudyPlan({
    examDate: new Date(Date.UTC(2026, 8, 25)),
    studyDays: ALL_DAYS,
    schoolDayMinutes: 5,
    holidayDayMinutes: 5,
    subjects: [s],
    startDate: START_DATE,
  });

  assert.ok(result.unscheduledTopicIds.includes('t6'));
});

test('estimated confidence maps to the agreed percents', () => {
  assert.deepEqual(ESTIMATED_CONFIDENCE_PERCENT, {
    low: 35,
    medium: 50,
    high: 85,
  });
});

test('with zero marks, a low estimate outranks medium, and medium matches the flat default', () => {
  const none = subjectPriority(subject('a'));
  const low = subjectPriority(subject('a', { estimatedConfidence: 'low' }));
  const medium = subjectPriority(
    subject('a', { estimatedConfidence: 'medium' }),
  );
  const high = subjectPriority(subject('a', { estimatedConfidence: 'high' }));
  assert.ok(low > medium, 'low should be higher priority than medium');
  assert.ok(high < medium, 'high should be lower priority than medium');
  assert.equal(medium, none);
});

test('one real mark makes the estimate irrelevant (never blended)', () => {
  const marksHistory = {
    records: [{ percent: 60, fullMarks: 100 }],
    latestConfidence: null,
  };
  const without = subjectPriority(subject('a', { marksHistory }));
  for (const level of ['low', 'medium', 'high'] as const) {
    assert.equal(
      subjectPriority(
        subject('a', { marksHistory, estimatedConfidence: level }),
      ),
      without,
    );
  }
});

test('a low-estimate subject gets more study time than a high-estimate one', () => {
  const result = generateStudyPlan({
    examDate: EXAM_DATE,
    studyDays: ALL_DAYS,
    schoolDayMinutes: 60,
    holidayDayMinutes: 90,
    subjects: [
      subject('weakish', {
        estimatedConfidence: 'low',
        topics: [topic('w1', 'weakish'), topic('w2', 'weakish')],
      }),
      subject('sure', {
        estimatedConfidence: 'high',
        topics: [topic('s1', 'sure'), topic('s2', 'sure')],
      }),
    ],
    startDate: START_DATE,
  });
  const minutes = (id: string) =>
    result.sessions
      .filter((x) => x.subjectId === id)
      .reduce((sum, x) => sum + x.durationMinutes, 0);
  assert.ok(minutes('weakish') > minutes('sure'));
});

test('topic difficulty outweighs estimated confidence when ranking topics', () => {
  const mathPriority = subjectPriority(
    subject('math', { estimatedConfidence: 'high' }),
  );
  const sciencePriority = subjectPriority(
    subject('science', { estimatedConfidence: 'low' }),
  );
  const ranked = [
    ...[5, 5, 2, 2].map((d, i) => ({
      name: `math${i}-d${d}`,
      p: topicPriority(
        mathPriority,
        topic(`m${i}`, 'math', { difficultyRating: d }),
      ),
    })),
    ...[5, 2, 2].map((d, i) => ({
      name: `sci${i}-d${d}`,
      p: topicPriority(
        sciencePriority,
        topic(`s${i}`, 'science', { difficultyRating: d }),
      ),
    })),
  ].sort((a, b) => b.p - a.p);
  assert.deepEqual(
    ranked.slice(0, 3).map((r) => r.name.split('-')[1]),
    ['d5', 'd5', 'd5'],
  );
});

test('a brand-new topic gets one learn session and a single review the next day (SM-2 first interval)', () => {
  const s = subject('s1', {
    marksHistory: {
      records: [{ percent: 40, fullMarks: 100 }],
      latestConfidence: null,
    },
    topics: [topic('t1', 's1')],
  });
  const result = generateStudyPlan({
    examDate: EXAM_DATE,
    studyDays: ALL_DAYS,
    schoolDayMinutes: 60,
    holidayDayMinutes: 90,
    subjects: [s],
    startDate: START_DATE,
  });
  const core = result.sessions
    .filter((x) => x.topicId === 't1' && !x.isFiller)
    .sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : 1));
  assert.deepEqual(
    core.map((x) => x.sessionType),
    ['learn', 'review'],
  );
  const dayMs = 24 * 60 * 60 * 1000;
  const gap =
    (new Date(core[1].scheduledDate).getTime() -
      new Date(core[0].scheduledDate).getTime()) /
    dayMs;
  assert.equal(gap, 1);
});

test('a topic rated Again/Hard (count 0, next review set) gets one review, not a new learn sequence', () => {
  const s = subject('s1', {
    marksHistory: {
      records: [{ percent: 40, fullMarks: 100 }],
      latestConfidence: null,
    },
    topics: [
      topic('t1', 's1', {
        spacedState: {
          status: 'learning',
          nextReviewDate: '2026-10-05',
          repetitionCount: 0,
        },
      }),
    ],
  });
  const result = generateStudyPlan({
    examDate: EXAM_DATE,
    studyDays: ALL_DAYS,
    schoolDayMinutes: 60,
    holidayDayMinutes: 90,
    subjects: [s],
    startDate: START_DATE,
  });
  const core = result.sessions.filter((x) => x.topicId === 't1' && !x.isFiller);
  assert.equal(core.length, 1);
  assert.equal(core[0].sessionType, 'review');
  assert.ok(core[0].scheduledDate >= '2026-10-05');
});

test('interval cap is proportional to the time left, within 3..21 days', () => {
  assert.equal(intervalCapForExam(60), 9);
  assert.equal(intervalCapForExam(10), 3);
  assert.equal(intervalCapForExam(400), 21);
});

test('capped SM-2 interval never exceeds the cap, and the topic is never retired', () => {
  let st = defaultSpacedState();
  for (let i = 0; i < 6; i++) st = updateTopicSpacedState(st, 3, 9);
  assert.ok(st.intervalDays <= 9);
  assert.equal(st.status, 'reviewing');
});

test('a review due after the schedule ends is moved into the final days', () => {
  const s = subject('s1', {
    topics: [
      topic('t1', 's1', {
        spacedState: {
          status: 'reviewing',
          nextReviewDate: '2027-01-01',
          repetitionCount: 3,
        },
      }),
    ],
  });
  const result = generateStudyPlan({
    examDate: EXAM_DATE,
    studyDays: ALL_DAYS,
    schoolDayMinutes: 60,
    holidayDayMinutes: 90,
    subjects: [s],
    startDate: START_DATE,
  });
  const core = result.sessions.filter((x) => x.topicId === 't1' && !x.isFiller);
  assert.equal(core.length, 1);
  assert.ok(core[0].scheduledDate >= '2026-11-02');
});

test('test trend: drops cost more than rises earn, rises stop at 2.5', () => {
  assert.equal(adjustForTestTrend(2.5, -10).easeFactor, 2.4);
  assert.equal(adjustForTestTrend(2.5, -10).resetLadder, false);
  assert.equal(adjustForTestTrend(2.5, -20).resetLadder, true);
  assert.equal(adjustForTestTrend(2.5, -50).easeFactor, 2.2);
  assert.equal(adjustForTestTrend(1.3, -50).easeFactor, 1.3);
  assert.equal(adjustForTestTrend(1.5, 20).easeFactor, 1.6);
  assert.equal(adjustForTestTrend(1.5, 60).easeFactor, 1.7);
  assert.equal(adjustForTestTrend(2.4, 60).easeFactor, 2.5);
  assert.equal(adjustForTestTrend(2.8, 40).easeFactor, 2.8);
});

test("a topic's own result moves only that topic, never its siblings", () => {
  const social = (historyMastery: number | null) =>
    subject('social', {
      estimatedConfidence: 'medium',
      topics: [
        topic('history', 'social', { estimatedMastery: historyMastery }),
        topic('civics', 'social'),
      ],
    });
  const before = social(null);
  const after = social(100);
  const p = (s: SubjectInput, id: string) =>
    leafPriority(s, s.topics.find((t) => t.id === id)!);
  // Civics has no result of its own: untouched by History's test.
  assert.equal(p(after, 'civics').priority, p(before, 'civics').priority);
  assert.equal(
    p(after, 'civics').weaknessPercent,
    p(before, 'civics').weaknessPercent,
  );
  // History scored 100/100: its priority drops.
  assert.ok(p(after, 'history').priority < p(before, 'history').priority);
  // A weak result raises it above the untested sibling.
  const weak = social(30);
  assert.ok(p(weak, 'history').priority > p(weak, 'civics').priority);
});

console.log(`\n${passed} test(s) passed.`);
if (process.exitCode) {
  console.error('\nSome tests FAILED.');
} else {
  console.log('All tests passed.');
}
