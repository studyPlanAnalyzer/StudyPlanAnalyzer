import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { generateStudyPlan } from '@/lib/utils/plan-generator';
import { fromDateString } from '@/lib/utils/date-utils';

// The buffer week: the plan stops the day before it starts.
const topic = (id: string, next: string) => ({
  id, subjectId: 's', difficultyRating: 2, estimatedMastery: null, latestConfidence: null, struggling: false,
  spacedState: { status: 'reviewing', nextReviewDate: next, repetitionCount: 2, lastSeenDate: '2027-01-01' },
});
const plan = (start: string) =>
  generateStudyPlan({
    examDate: fromDateString('2027-01-15'),
    scheduleEndDate: fromDateString('2027-01-08'), // the buffer week starts 8 Jan
    studyDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    startDate: fromDateString(start),
    subjects: [{ id: 's', name: 'S', examWeight: 'medium', marksHistory: { records: [], latestConfidence: null }, estimatedConfidence: null,
      topics: [topic('a', '2027-01-07'), topic('b', '2027-01-08'), topic('c', '2027-01-11')] }],
  } as never);

describe('Buffer week', () => {
  test("nothing is listed on the buffer week's first day or after it", () => {
    const days = plan('2027-01-04').sessions.map((s) => s.scheduledDate);
    assert.ok(days.length > 0);
    assert.ok(days.every((d) => d <= '2027-01-07'), days.join(', '));
  });
  test('a plan built inside the buffer week lists nothing', () => {
    assert.deepEqual(plan('2027-01-11').sessions, []);
  });
});
