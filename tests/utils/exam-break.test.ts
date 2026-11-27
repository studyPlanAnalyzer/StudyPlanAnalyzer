import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { breakReminder, breakReminderText } from '@/lib/utils/exam-break';

describe('Exam break: reminders', () => {
  test('nothing in the first 2 weeks after the exam', () => {
    assert.equal(breakReminder('2026-12-10', '2026-12-10'), null);
    assert.equal(breakReminder('2026-12-10', '2026-12-23'), null); // day 13
  });

  test('a gentle reminder from 2 weeks', () => {
    assert.deepEqual(breakReminder('2026-12-10', '2026-12-24'), { stage: 'gentle', weeks: 2 });
    assert.deepEqual(breakReminder('2026-12-10', '2026-12-30'), { stage: 'gentle', weeks: 2 }); // day 20
  });

  test('a firmer warning from 3 weeks, counting the weeks', () => {
    assert.deepEqual(breakReminder('2026-12-10', '2026-12-31'), { stage: 'firm', weeks: 3 });
    assert.deepEqual(breakReminder('2026-12-10', '2027-01-14'), { stage: 'firm', weeks: 5 });
  });

  test('the words', () => {
    assert.equal(
      breakReminderText({ stage: 'gentle', weeks: 2 }),
      "It's been 2 weeks since the exam. Time to start studying again.",
    );
    assert.equal(
      breakReminderText({ stage: 'firm', weeks: 4 }),
      "It's been 4 weeks since the exam. Topics are fading, so start the next exam cycle.",
    );
  });
});
