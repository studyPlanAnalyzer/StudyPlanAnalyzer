import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateStudyPlan, type SubjectInput } from '@/lib/utils/plan-generator';
import { addDays, appToday } from '@/lib/utils/date-utils';

test('the plan has no optional sessions, and its focus split counts every listed session', () => {
  const subject: SubjectInput = {
    id: 'maths',
    name: 'Maths',
    examWeight: 'medium',
    marksHistory: { records: [], latestConfidence: null },
    estimatedConfidence: 'low', // every topic is weak
    topics: [1, 2, 3].map((n) => ({
      id: `t${n}`,
      subjectId: 'maths',
      difficultyRating: 2,
      estimatedMastery: null,
      spacedState: null,
    })),
  };
  const plan = generateStudyPlan({
    examDate: addDays(appToday(), 30),
    studyDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    subjects: [subject],
    startDate: appToday(),
  });
  assert.ok(!plan.sessions.some((s) => s.isFiller), 'no minutes budget, so nothing to fill');
  assert.equal(plan.weakFocusPercent, 100);
  assert.equal(plan.mediumFocusPercent, 0);
  assert.equal(plan.strongFocusPercent, 0);
});
