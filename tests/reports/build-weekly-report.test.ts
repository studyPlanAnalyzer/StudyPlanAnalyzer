import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyReport, readinessFor } from '@/lib/reports/build-weekly-report';
import {
  lastFinishedWeek,
  weekContaining,
  weekStartingOn,
} from '@/lib/reports/week';
import type {
  MarkRow,
  ReportInput,
  SessionRow,
  TopicReviewRow,
  WeeklyReportSnapshot,
} from '@/lib/reports/types';
import type { SubjectInput, TopicInput } from '@/lib/utils/plan-generator';

// ---------------------------------------------------------------------------
// Fixtures. The report week is Sunday 2026-10-11 to Saturday 2026-10-17; the
// week before is 10-04..10-10, the week after 10-18..10-24.
// ---------------------------------------------------------------------------
const WEEK = '2026-10-11';
const PLAN = 'plan-1';
let seq = 0;

function session(p: Partial<SessionRow> & { scheduledDate: string }): SessionRow {
  return {
    id: `s${++seq}`,
    planId: PLAN,
    topicId: 'alg',
    topicName: 'Algebra',
    subjectName: 'Maths',
    durationMinutes: 30,
    sessionType: 'practice',
    isFiller: false,
    status: 'planned',
    completedAt: null,
    ...p,
  };
}
/** A session finished at noon on its own day. */
const done = (date: string, p: Partial<SessionRow> = {}) =>
  session({ scheduledDate: date, status: 'completed', completedAt: `${date}T12:00:00.000Z`, ...p });

function topic(id: string, p: Partial<TopicInput> = {}): TopicInput {
  return { id, subjectId: 'maths', difficultyRating: 2, estimatedMastery: null, latestConfidence: null, spacedState: null, ...p };
}

const MATHS: SubjectInput = {
  id: 'maths',
  name: 'Maths',
  examWeight: 'medium',
  marksHistory: { records: [], latestConfidence: null },
  estimatedConfidence: null,
  topics: [topic('alg'), topic('geo'), topic('stat'), topic('prob')],
};
const NAMES = {
  alg: { name: 'Algebra', subjectName: 'Maths' },
  geo: { name: 'Geometry', subjectName: 'Maths' },
  stat: { name: 'Statistics', subjectName: 'Maths' },
  prob: { name: 'Probability', subjectName: 'Maths' },
};

function input(p: Partial<ReportInput> = {}): ReportInput {
  return {
    student: { id: 'kid-1', name: 'Aarav', createdAt: '2026-09-01T08:00:00.000Z' },
    weekStart: WEEK,
    billing: 'active',
    exam: { id: 'exam-1', name: 'Finals', examDate: '2026-12-20' },
    plan: { id: PLAN, generatedAt: '2026-09-01T09:00:00.000Z' },
    sessions: [],
    topicReviews: [],
    quizAttempts: [],
    firstQuizAttemptAt: null,
    todos: [],
    marks: [],
    subjectInputs: [MATHS],
    topicNames: NAMES,
    intervalDays: {},
    onTimeReviewsAllTime: 0,
    previousReport: null,
    hasEarlierReport: true,
    awardedMilestones: ['first_report'],
    builtLater: false,
    ...p,
  };
}

function review(topicId: keyof typeof NAMES, completedDate: string, rating: number): TopicReviewRow {
  return { topicId, topicName: NAMES[topicId].name, subjectName: 'Maths', scheduledDate: completedDate, completedDate, rating };
}

function mark(p: Partial<MarkRow> & { assessmentDate: string; obtainedMarks: number }): MarkRow {
  return {
    markId: `m${++seq}`,
    assessmentId: `a${seq}`,
    assessmentName: 'Unit test',
    createdAt: `${p.assessmentDate}T10:00:00.000Z`,
    subjectId: 'maths',
    subjectName: 'Maths',
    fullMarks: 100,
    confidenceLevel: null,
    topicIds: [],
    ...p,
  };
}

/** Every number anywhere in the snapshot. */
function numbers(v: unknown): number[] {
  if (typeof v === 'number') return [v];
  if (v && typeof v === 'object') return Object.values(v).flatMap(numbers);
  return [];
}

// ---------------------------------------------------------------------------
describe('report week (lib/reports/week.ts)', () => {
  test('every day maps to the Sunday that starts its week', () => {
    for (const d of ['2026-10-11', '2026-10-14', '2026-10-17'])
      assert.deepEqual(weekContaining(d), { start: '2026-10-11', end: '2026-10-17' });
    assert.equal(weekContaining('2026-10-18').start, '2026-10-18');
  });
  test('a non-Sunday is refused as a week start', () => {
    assert.throws(() => weekStartingOn('2026-10-12'));
  });
  test('a week has finished once its Saturday (UTC) is over', () => {
    assert.equal(lastFinishedWeek(new Date('2026-10-17T23:59:59Z')).start, '2026-10-04');
    assert.equal(lastFinishedWeek(new Date('2026-10-18T00:00:00Z')).start, '2026-10-11');
    assert.equal(lastFinishedWeek(new Date('2026-10-24T23:00:00Z')).start, '2026-10-11');
  });
});

describe('study time', () => {
  test('planned minutes of completed and partly completed sessions finished in the week', () => {
    const r = buildWeeklyReport(input({
      sessions: [
        done('2026-10-12', { durationMinutes: 40 }),
        done('2026-10-13', { durationMinutes: 25, status: 'partly_completed' }),
        done('2026-10-14', { durationMinutes: 15, isFiller: true }),
        session({ scheduledDate: '2026-10-15', status: 'skipped' }),
        session({ scheduledDate: '2026-10-16' }),
      ],
    }));
    assert.equal(r.studyTime.minutes, 80);
  });
  test('counted by completedAt, at the UTC week boundary', () => {
    const r = buildWeeklyReport(input({
      sessions: [
        session({ scheduledDate: '2026-10-17', status: 'completed', completedAt: '2026-10-17T23:59:59.000Z', durationMinutes: 10 }),
        session({ scheduledDate: '2026-10-17', status: 'completed', completedAt: '2026-10-18T00:00:00.000Z', durationMinutes: 99 }),
        session({ scheduledDate: '2026-10-10', status: 'completed', completedAt: '2026-10-11T00:00:00.000Z', durationMinutes: 5 }),
      ],
    }));
    assert.equal(r.studyTime.minutes, 15);
  });
  test('last week shown when the child existed all of last week', () => {
    const r = buildWeeklyReport(input({ sessions: [done('2026-10-12'), done('2026-10-05', { durationMinutes: 50 })] }));
    assert.equal(r.studyTime.lastWeekMinutes, 50);
  });
});

describe('consistency and the study-day streak', () => {
  test('planned days, planned days studied, and extra days', () => {
    const r = buildWeeklyReport(input({
      sessions: [
        done('2026-10-12'),
        session({ scheduledDate: '2026-10-13' }),
        done('2026-10-14'),
        done('2026-10-17', { isFiller: true }), // Saturday: nothing required, an extra day
      ],
    }));
    assert.deepEqual(
      { p: r.consistency.plannedDays, s: r.consistency.plannedDaysStudied, x: r.consistency.extraDaysStudied },
      { p: 3, s: 2, x: 1 },
    );
  });
  test('rest days are skipped, not counted, and do not break the streak', () => {
    // Sun–Fri planned and studied in both weeks; Saturdays are rest days.
    const days = ['04', '05', '06', '07', '08', '09', '11', '12', '13', '14', '15', '16'];
    const r = buildWeeklyReport(input({ sessions: days.map((d) => done(`2026-10-${d}`)) }));
    assert.equal(r.consistency.studyDayStreak, 12);
  });
  test('studying on a rest day does not add to the streak', () => {
    const r = buildWeeklyReport(input({
      sessions: [done('2026-10-15'), done('2026-10-16'), done('2026-10-17', { isFiller: true })],
    }));
    assert.equal(r.consistency.studyDayStreak, 2);
  });
  test('a missed planned day breaks it, and the last planned day counts as over', () => {
    const missedLast = buildWeeklyReport(input({
      sessions: [done('2026-10-14'), done('2026-10-15'), session({ scheduledDate: '2026-10-16', status: 'skipped' })],
    }));
    assert.equal(missedLast.consistency.studyDayStreak, 0);
    const missedMiddle = buildWeeklyReport(input({
      sessions: [done('2026-10-13'), session({ scheduledDate: '2026-10-14' }), done('2026-10-15'), done('2026-10-16')],
    }));
    assert.equal(missedMiddle.consistency.studyDayStreak, 2);
  });
});

describe('plan adherence', () => {
  test('required sessions only; skipped and missed are "not done"', () => {
    const r = buildWeeklyReport(input({
      sessions: [
        done('2026-10-12'),
        done('2026-10-13', { status: 'partly_completed' }),
        session({ scheduledDate: '2026-10-14', status: 'skipped' }),
        session({ scheduledDate: '2026-10-15' }), // left planned: missed
        done('2026-10-16', { isFiller: true }),
      ],
    }));
    assert.deepEqual(r.adherence, { required: 4, finished: 2, notDone: 2 });
  });
  test('a session finished late still counts as finished', () => {
    const r = buildWeeklyReport(input({
      sessions: [session({ scheduledDate: '2026-10-12', status: 'completed', completedAt: '2026-10-19T08:00:00.000Z' })],
    }));
    assert.equal(r.adherence.finished, 1);
  });
});

describe('revision quality', () => {
  test('revisions are review sessions only; on time = finished by their day', () => {
    const r = buildWeeklyReport(input({
      sessions: [
        done('2026-10-12', { sessionType: 'review' }),
        session({ scheduledDate: '2026-10-12', sessionType: 'review', status: 'completed', completedAt: '2026-10-14T09:00:00.000Z' }),
        done('2026-10-13', { sessionType: 'practice' }),
        done('2026-10-13', { sessionType: 'learn' }),
      ],
    }));
    assert.equal(r.revision.reviewsDone, 2);
    assert.equal(r.revision.reviewsOnTime, 1);
  });
  test('learn sessions are reported as new topics learned, each topic once', () => {
    const r = buildWeeklyReport(input({
      sessions: [
        done('2026-10-12', { sessionType: 'learn', topicId: 'geo' }),
        done('2026-10-13', { sessionType: 'learn', topicId: 'geo' }),
        done('2026-10-14', { sessionType: 'learn', topicId: 'stat' }),
      ],
    }));
    assert.deepEqual(r.revision.newTopicsLearned.map((t) => t.topicName), ['Geometry', 'Statistics']);
  });
  test('rating counts come from topic_reviews in the week', () => {
    const r = buildWeeklyReport(input({
      topicReviews: [
        review('alg', '2026-10-12', 1), review('alg', '2026-10-13', 2),
        review('geo', '2026-10-14', 3), review('geo', '2026-10-15', 3),
        review('stat', '2026-10-16', 4), review('stat', '2026-10-10', 4), // last week
      ],
    }));
    assert.deepEqual(r.revision.ratings, { again: 1, hard: 1, good: 2, easy: 1 });
  });
  test('needs attention: two Again/Hard ratings in 28 days, then weak topics, at most 3', () => {
    const r = buildWeeklyReport(input({
      topicReviews: [
        review('alg', '2026-09-20', 1), review('alg', '2026-10-15', 2), // both inside the 28 days
        review('geo', '2026-10-14', 1), // once only
        review('stat', '2026-09-19', 1), review('stat', '2026-10-16', 1), // one just outside
      ],
      subjectInputs: [{
        ...MATHS,
        topics: [topic('alg'), topic('geo', { estimatedMastery: 30 }), topic('stat'), topic('prob', { estimatedMastery: 40 })],
      }],
    }));
    assert.deepEqual(
      r.revision.needsAttention.map((t) => [t.topicName, t.reason]),
      [['Algebra', 'hard_ratings'], ['Geometry', 'weak'], ['Probability', 'weak']],
    );
  });
  test('a subject with no marks does not make its topics "weak"', () => {
    assert.deepEqual(buildWeeklyReport(input()).revision.needsAttention, []);
  });
  test('getting stronger needs last week\'s report', () => {
    const first = buildWeeklyReport(input({ intervalDays: { alg: 6 } }));
    assert.equal(first.revision.gettingStronger, null);

    const last = { ...first, week: { start: '2026-10-04', end: '2026-10-10' }, intervalDays: { alg: 1, geo: 6, stat: 3 } };
    const r = buildWeeklyReport(input({ intervalDays: { alg: 6, geo: 6, stat: 2 }, previousReport: last }));
    assert.deepEqual(r.revision.gettingStronger, [
      { topicName: 'Algebra', subjectName: 'Maths', everyDays: 6, lastWeekEveryDays: 1 },
    ]);

    const older = { ...last, week: { start: '2026-09-27', end: '2026-10-03' } };
    assert.equal(buildWeeklyReport(input({ intervalDays: { alg: 6 }, previousReport: older })).revision.gettingStronger, null);
  });
});

describe('daily challenge', () => {
  test('attempts, average and best day as percent of questions', () => {
    const r = buildWeeklyReport(input({
      quizAttempts: [
        { completedAt: '2026-10-12T10:00:00.000Z', score: 3, totalQuestions: 5 },
        { completedAt: '2026-10-14T10:00:00.000Z', score: 5, totalQuestions: 5 },
        { completedAt: '2026-10-15T10:00:00.000Z', score: 5, totalQuestions: 5 },
        { completedAt: '2026-10-06T10:00:00.000Z', score: 2, totalQuestions: 5 },
      ],
    }));
    assert.equal(r.challenge.attempts, 3);
    assert.equal(r.challenge.averagePercent, 87); // (60 + 100 + 100) / 3 = 86.7
    assert.deepEqual(r.challenge.bestDay, { date: '2026-10-14', percent: 100 }); // earliest of the tie
    assert.deepEqual(r.challenge.lastWeek, { attempts: 1, averagePercent: 40 });
  });
  test('no attempts: no average, no best day (no division by zero)', () => {
    const r = buildWeeklyReport(input());
    assert.equal(r.challenge.averagePercent, null);
    assert.equal(r.challenge.bestDay, null);
    assert.deepEqual(r.challenge.lastWeek, { attempts: 0, averagePercent: null });
  });
});

describe('daily habits', () => {
  test('to-dos in the week and the habit streak as of the week end', () => {
    const t = (d: string, ok: boolean) => ({ todoDate: d, isCompleted: ok });
    const r = buildWeeklyReport(input({
      todos: [
        t('2026-10-14', true), t('2026-10-15', true), t('2026-10-16', true), t('2026-10-16', true),
        t('2026-10-17', true), t('2026-10-13', false), t('2026-10-18', true), // after the week
      ],
    }));
    assert.deepEqual(r.habits, { completed: 5, total: 6, streak: 4 });
  });
});

describe('tests and marks', () => {
  test('no test in the week: logged is false, nothing invented', () => {
    const r = buildWeeklyReport(input({ marks: [mark({ assessmentDate: '2026-10-01', obtainedMarks: 70 })] }));
    assert.deepEqual(r.tests, { logged: false, subjects: [], topics: [] });
  });
  test('per subject and per topic, against the test before, with the confidence given', () => {
    const r = buildWeeklyReport(input({
      marks: [
        mark({ assessmentDate: '2026-09-20', obtainedMarks: 60 }),
        mark({ assessmentDate: '2026-10-13', obtainedMarks: 72, confidenceLevel: 'medium' }),
        mark({ assessmentDate: '2026-10-14', obtainedMarks: 18, fullMarks: 20, topicIds: ['alg'], confidenceLevel: 'high' }),
      ],
    }));
    assert.deepEqual(r.tests.subjects.map((s) => [s.name, s.percent, s.previousPercent, s.confidence]), [['Maths', 72, 60, 'medium']]);
    assert.deepEqual(r.tests.topics.map((s) => [s.name, s.percent, s.previousPercent, s.confidence]), [['Algebra', 90, null, 'high']]);
  });
});

describe('exam readiness', () => {
  test('thresholds: too early below 5 sessions, then 85% and 65%', () => {
    assert.equal(readinessFor(4, 4), 'too_early');
    assert.equal(readinessFor(20, 17), 'on_track'); // 85%
    assert.equal(readinessFor(20, 16), 'slightly_behind'); // 80%
    assert.equal(readinessFor(20, 13), 'slightly_behind'); // 65%
    assert.equal(readinessFor(20, 12), 'behind'); // 60%
  });
  test('upcoming: days left from the report date, topics studied, plan to date', () => {
    const r = buildWeeklyReport(input({
      sessions: [
        done('2026-10-01', { topicId: 'alg' }), done('2026-10-05', { topicId: 'geo' }),
        done('2026-10-12', { topicId: 'geo' }), session({ scheduledDate: '2026-10-13', topicId: 'stat' }),
        session({ scheduledDate: '2026-10-20', topicId: 'prob' }), // next week: not "to date"
      ],
    }));
    assert.equal(r.exam.state, 'upcoming');
    assert.equal(r.exam.daysLeft, 63); // 2026-10-18 → 2026-12-20
    assert.deepEqual([r.exam.topicsStudied, r.exam.topicsTotal], [2, 4]);
    assert.deepEqual(r.exam.toDate, { required: 4, finished: 3 });
    assert.equal(r.exam.readiness, 'too_early');
  });
  test('the exam falling inside the week: over, no readiness, no next week', () => {
    const r = buildWeeklyReport(input({
      exam: { id: 'exam-1', name: 'Finals', examDate: '2026-10-15' },
      sessions: [done('2026-10-12'), done('2026-10-13')],
    }));
    assert.equal(r.exam.state, 'over');
    assert.equal(r.exam.readiness, null);
    assert.equal(r.nextWeek, null);
    assert.equal(r.headline, 'exam_finished');
    assert.equal(r.action.kind, 'start_new_exam_cycle');
    assert.equal(r.studyTime.minutes, 60); // the week's work still shows
  });
  test('the exam on the report date counts as over', () => {
    assert.equal(buildWeeklyReport(input({ exam: { id: 'e', name: 'F', examDate: '2026-10-18' } })).exam.state, 'over');
  });
  test('plan cleared because the exam is over (exam long past)', () => {
    const r = buildWeeklyReport(input({ exam: { id: 'e', name: 'Finals', examDate: '2026-09-30' } }));
    assert.equal(r.exam.state, 'over');
    assert.equal(r.action.kind, 'start_new_exam_cycle');
  });
  test('no plan yet / no exam', () => {
    const noPlan = buildWeeklyReport(input({ plan: null }));
    assert.equal(noPlan.exam.state, 'no_plan');
    assert.equal(noPlan.exam.daysLeft, 63);
    assert.equal(noPlan.headline, 'no_plan');
    assert.equal(noPlan.action.kind, 'create_plan');
    assert.equal(noPlan.nextWeek, null);
    const noExam = buildWeeklyReport(input({ exam: null, plan: null, subjectInputs: [], topicNames: {} }));
    assert.equal(noExam.exam.state, 'none');
    assert.deepEqual([noExam.exam.topicsStudied, noExam.exam.topicsTotal], [0, 0]);
  });
});

describe('next week', () => {
  test('required minutes; focus only on planned topics, by the generator\'s priority', () => {
    const r = buildWeeklyReport(input({
      subjectInputs: [{
        ...MATHS,
        topics: [topic('alg', { estimatedMastery: 90 }), topic('geo', { estimatedMastery: 30 }), topic('stat', { estimatedMastery: 60 }), topic('prob', { estimatedMastery: 10 })],
      }],
      sessions: [
        session({ scheduledDate: '2026-10-19', topicId: 'alg', durationMinutes: 30 }),
        session({ scheduledDate: '2026-10-20', topicId: 'geo', durationMinutes: 40 }),
        session({ scheduledDate: '2026-10-21', topicId: 'stat', durationMinutes: 20 }),
        session({ scheduledDate: '2026-10-22', topicId: 'stat', durationMinutes: 15, isFiller: true }),
        session({ scheduledDate: '2026-10-25', topicId: 'prob' }), // the week after
      ],
    }));
    assert.equal(r.nextWeek?.plannedMinutes, 90);
    assert.deepEqual(r.nextWeek?.focusTopics.map((t) => t.topicName), ['Geometry', 'Statistics', 'Algebra']);
  });
});

describe('headline', () => {
  const week = ['11', '12', '13', '14', '15', '16'].map((d) => `2026-10-${d}`);
  test('quiet week: nothing happened', () => {
    assert.equal(buildWeeklyReport(input({ sessions: week.map((d) => session({ scheduledDate: d })) })).headline, 'quiet_week');
  });
  test('first week: the child is new', () => {
    const r = buildWeeklyReport(input({ student: { id: 'k', name: 'Aarav', createdAt: '2026-10-08T10:00:00.000Z' }, sessions: [done('2026-10-12')] }));
    assert.equal(r.headline, 'first_week');
  });
  test('every required session finished', () => {
    assert.equal(buildWeeklyReport(input({ sessions: week.map((d) => done(d)) })).headline, 'all_sessions_done');
  });
  test('consistent: at least 80% of planned days studied', () => {
    const s = week.map((d, i) => (i < 5 ? done(d) : session({ scheduledDate: d })));
    s.push(session({ scheduledDate: '2026-10-12' }));
    assert.equal(buildWeeklyReport(input({ sessions: s })).headline, 'consistent_week');
  });
  test('strong challenge week', () => {
    const r = buildWeeklyReport(input({
      sessions: [done('2026-10-12'), session({ scheduledDate: '2026-10-13' }), session({ scheduledDate: '2026-10-14' })],
      quizAttempts: ['12', '13', '14'].map((d) => ({ completedAt: `2026-10-${d}T09:00:00.000Z`, score: 5, totalQuestions: 5 })),
    }));
    assert.equal(r.headline, 'strong_challenge_week');
  });
  test('a lighter week: under half the required sessions', () => {
    const r = buildWeeklyReport(input({ sessions: [done('2026-10-12'), ...week.slice(2).map((d) => session({ scheduledDate: d }))] }));
    assert.equal(r.headline, 'lighter_week');
  });
  test('otherwise a steady week', () => {
    const r = buildWeeklyReport(input({ sessions: [done('2026-10-12'), done('2026-10-13'), session({ scheduledDate: '2026-10-14' }), session({ scheduledDate: '2026-10-15' })] }));
    assert.equal(r.headline, 'steady_week');
  });
});

describe('one thing to do', () => {
  const recentTest = [mark({ assessmentDate: '2026-10-05', obtainedMarks: 70 })];
  test('grace billing comes first, with the payment line', () => {
    const r = buildWeeklyReport(input({ billing: 'grace' }));
    assert.equal(r.action.kind, 'pay_to_keep_access');
    assert.equal(r.context.paymentDue, true);
    assert.equal(buildWeeklyReport(input({ billing: 'pending' })).context.paymentDue, false);
  });
  test('nothing happened: start together', () => {
    assert.equal(buildWeeklyReport(input()).action.kind, 'start_together');
  });
  test('a topic rated Again/Hard repeatedly: explain it back', () => {
    const r = buildWeeklyReport(input({
      sessions: [done('2026-10-12')], marks: recentTest,
      topicReviews: [review('geo', '2026-10-12', 1), review('geo', '2026-10-13', 2)],
    }));
    assert.deepEqual(r.action, { kind: 'explain_topic_back', topic: { topicName: 'Geometry', subjectName: 'Maths' } });
  });
  test('no test for 28 days: log the subject with the oldest result', () => {
    const r = buildWeeklyReport(input({
      sessions: [done('2026-10-12')],
      subjectInputs: [MATHS, { ...MATHS, id: 'sci', name: 'Science', topics: [] }],
      marks: [mark({ assessmentDate: '2026-08-01', obtainedMarks: 70 })],
    }));
    assert.deepEqual(r.action, { kind: 'log_test', subjectName: 'Science' });
  });
  test('under 85% of required sessions: agree a fixed study time', () => {
    const r = buildWeeklyReport(input({ marks: recentTest, sessions: [done('2026-10-12'), done('2026-10-13'), session({ scheduledDate: '2026-10-14' })] }));
    assert.equal(r.action.kind, 'fix_study_time');
  });
  test('otherwise: ask what they learned', () => {
    const r = buildWeeklyReport(input({ marks: recentTest, sessions: [done('2026-10-12', { sessionType: 'learn', topicId: 'stat' })] }));
    assert.deepEqual(r.action, { kind: 'ask_what_learned', topic: { topicName: 'Statistics', subjectName: 'Maths' } });
  });
});

describe('milestones', () => {
  test('first report unlocks once', () => {
    assert.ok(buildWeeklyReport(input({ awardedMilestones: [] })).milestonesUnlocked.includes('first_report'));
    assert.ok(!buildWeeklyReport(input()).milestonesUnlocked.includes('first_report'));
  });
  test('7-day study-day streak, all required sessions (3+), 10 reviews on time', () => {
    const days = ['06', '07', '08', '09', '11', '12', '13'].map((d) => done(`2026-10-${d}`));
    const r = buildWeeklyReport(input({ sessions: days, onTimeReviewsAllTime: 10 }));
    assert.deepEqual(r.milestonesUnlocked.sort(), ['all_required_sessions_week', 'reviews_on_time_10', 'study_day_streak_7']);
    const one = buildWeeklyReport(input({ sessions: [done('2026-10-12')], onTimeReviewsAllTime: 9 }));
    assert.deepEqual(one.milestonesUnlocked, []);
  });
  test('first challenge only in the week of the very first attempt', () => {
    assert.ok(buildWeeklyReport(input({ firstQuizAttemptAt: '2026-10-13T09:00:00.000Z' })).milestonesUnlocked.includes('first_challenge'));
    assert.ok(!buildWeeklyReport(input({ firstQuizAttemptAt: '2026-09-13T09:00:00.000Z' })).milestonesUnlocked.includes('first_challenge'));
  });
  test('never awarded twice', () => {
    const r = buildWeeklyReport(input({ onTimeReviewsAllTime: 50, awardedMilestones: ['first_report', 'reviews_on_time_10'] }));
    assert.ok(!r.milestonesUnlocked.includes('reviews_on_time_10'));
  });
});

describe('edge cases', () => {
  test('first week: baseline, no comparisons', () => {
    const r = buildWeeklyReport(input({
      student: { id: 'k', name: 'Aarav', createdAt: '2026-10-07T10:00:00.000Z' },
      hasEarlierReport: false, awardedMilestones: [], sessions: [done('2026-10-12'), done('2026-10-06')],
    }));
    assert.equal(r.context.isFirstReport, true);
    assert.equal(r.context.hasComparison, false);
    assert.equal(r.studyTime.lastWeekMinutes, null);
    assert.equal(r.challenge.lastWeek, null);
    assert.equal(r.revision.gettingStronger, null);
  });
  test('a child added mid-week', () => {
    const r = buildWeeklyReport(input({ student: { id: 'k', name: 'Aarav', createdAt: '2026-10-14T06:00:00.000Z' } }));
    assert.equal(r.context.addedThisWeek, true);
    assert.equal(r.context.hasComparison, false);
  });
  test('a week with no activity: kind headline, one action, no negative numbers', () => {
    const r = buildWeeklyReport(input({ sessions: [session({ scheduledDate: '2026-10-12', status: 'skipped' }), done('2026-10-05')] }));
    assert.equal(r.context.hadActivity, false);
    assert.equal(r.headline, 'quiet_week');
    assert.equal(r.action.kind, 'start_together');
    assert.ok(numbers(r).every((n) => n >= 0 && Number.isFinite(n)));
  });
  test('empty everything: no crash, no NaN, no division by zero', () => {
    const r = buildWeeklyReport(input({ exam: null, plan: null, sessions: [], subjectInputs: [], topicNames: {} }));
    assert.ok(numbers(r).every((n) => Number.isFinite(n) && n >= 0));
  });
  test('several children: each report only uses its own input', () => {
    const a = buildWeeklyReport(input({ sessions: [done('2026-10-12', { durationMinutes: 45 })] }));
    const b = buildWeeklyReport(input({ student: { id: 'kid-2', name: 'Maya', createdAt: '2026-09-01T08:00:00.000Z' }, sessions: [] }));
    assert.deepEqual([a.studentName, a.studyTime.minutes, b.studentName, b.studyTime.minutes], ['Aarav', 45, 'Maya', 0]);
  });
  test('the snapshot survives a JSON round trip unchanged', () => {
    const r = buildWeeklyReport(input({ sessions: [done('2026-10-12')], intervalDays: { alg: 6 } }));
    assert.deepEqual(JSON.parse(JSON.stringify(r)) as WeeklyReportSnapshot, r);
  });
});

describe('built later (a missed week caught up on)', () => {
  const stateful = () =>
    input({
      intervalDays: { alg: 6 },
      previousReport: {
        ...buildWeeklyReport(input()),
        week: { start: '2026-10-04', end: '2026-10-10' },
        intervalDays: { alg: 1 },
      },
      subjectInputs: [{ ...MATHS, topics: [topic('alg'), topic('geo', { estimatedMastery: 20 }), topic('stat')] }],
      topicReviews: [review('stat', '2026-10-12', 1), review('stat', '2026-10-13', 2)],
      sessions: [done('2026-10-12'), session({ scheduledDate: '2026-10-19', topicId: 'geo' })],
    });

  test('the newest week has every section', () => {
    const r = buildWeeklyReport(stateful());
    assert.equal(r.context.builtLater, false);
    assert.equal(r.revision.gettingStronger?.length, 1);
    assert.ok(r.revision.needsAttention.some((t) => t.reason === 'weak'));
    assert.ok(r.nextWeek);
    assert.deepEqual(Object.keys(r.intervalDays), ['alg']);
  });
  test('an older week leaves out what depends on today, and says so', () => {
    const r = buildWeeklyReport({ ...stateful(), builtLater: true });
    assert.equal(r.context.builtLater, true);
    assert.equal(r.revision.gettingStronger, null);
    // Ratings from that week are history and stay; "weak" is today's state.
    assert.deepEqual(r.revision.needsAttention.map((t) => [t.topicName, t.reason]), [['Statistics', 'hard_ratings']]);
    assert.equal(r.nextWeek, null);
    assert.deepEqual(r.intervalDays, {});
    // What happened that week is still all there.
    assert.equal(r.studyTime.minutes, 30);
    assert.equal(r.adherence.finished, 1);
  });
});
