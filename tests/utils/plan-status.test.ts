import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  countStudyDays,
  formatRates,
  needWindowEnd,
  planLastDay,
  planStatus,
  planStatusShort,
  planStatusText,
} from '@/lib/utils/plan-status';

// The parent's status: the child's pace against what the next week of the
// plan lists. 2026-11-12 is a Thursday.

const ALL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NO_SAT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];

describe('Plan status: the window', () => {
  test('the plan ends the day before the exam, or at the buffer week while it is ahead', () => {
    assert.equal(planLastDay('2026-12-20', false, '2026-11-12'), '2026-12-19');
    assert.equal(planLastDay('2026-12-20', true, '2026-11-12'), '2026-12-13');
    assert.equal(planLastDay('2026-12-20', true, '2026-12-13'), '2026-12-19', 'in the buffer week: as the rebuild does');
  });

  test('a week from today, cut at the plan end', () => {
    assert.equal(needWindowEnd('2026-11-12', '2026-12-19'), '2026-11-18');
    assert.equal(needWindowEnd('2026-11-12', '2026-11-14'), '2026-11-14');
  });

  test('study days in it', () => {
    assert.equal(countStudyDays('2026-11-12', '2026-11-18', ALL), 7);
    assert.equal(countStudyDays('2026-11-12', '2026-11-18', NO_SAT), 6);
    assert.equal(countStudyDays('2026-11-14', '2026-11-14', NO_SAT), 0);
  });
});

describe('Plan status: pace against need', () => {
  test('no study day left: no status', () => {
    assert.equal(planStatus({ pace: 3, listed: 0, studyDays: 0, overdue: 0 }), null);
  });

  test('on track at or within 10% of the need', () => {
    const s = planStatus({ pace: 4.5, listed: 30, studyDays: 6, overdue: 0 })!;
    assert.equal(s.need, 5);
    assert.equal(s.kind, 'on_track');
    assert.equal(s.gap, 3);
  });

  test('behind below that, with how many topics this week would slip', () => {
    const s = planStatus({ pace: 3, listed: 60, studyDays: 6, overdue: 12 })!;
    assert.equal(s.kind, 'behind');
    assert.equal(s.need, 10);
    assert.equal(s.gap, 42);
  });

  test('no pace yet: getting started', () => {
    const s = planStatus({ pace: null, listed: 18, studyDays: 6, overdue: 0 })!;
    assert.equal(s.kind, 'new');
    assert.equal(s.gap, 0);
  });
});

describe('Plan status: the words', () => {
  test('rates read as whole numbers unless that would hide a difference', () => {
    assert.deepEqual(formatRates(3, 10), ['3', '10']);
    assert.deepEqual(formatRates(2.6, 3.2), ['2.6', '3.2']);
    assert.deepEqual(formatRates(4, 4), ['4', '4']);
  });

  test('behind: pace, need, the gap and what is overdue', () => {
    const s = planStatus({ pace: 3, listed: 60, studyDays: 6, overdue: 12 })!;
    const t = planStatusText(s, 'Arjun');
    assert.equal(t.headline, 'Falling behind');
    assert.deepEqual(t.lines, [
      'Arjun completes about 3 topics a study day. Staying on schedule this week needs about 10.',
      "At this pace, about 42 topics of the 60 due this week won't be done on time. Topics not done are listed again the next day, so a few more a day, or another study day in Settings, closes the gap.",
      "12 topics are overdue and first on today's list.",
    ]);
    assert.equal(planStatusShort(s), 'Falling behind · about 3 topics a day · 12 overdue');
  });

  test('on track: one line', () => {
    const s = planStatus({ pace: 5, listed: 30, studyDays: 6, overdue: 0 })!;
    assert.deepEqual(planStatusText(s, 'Arjun'), {
      headline: 'On track',
      lines: ['Arjun completes about 5 topics a study day. Staying on schedule this week needs about 5.'],
    });
    assert.equal(planStatusShort(s), 'On track · about 5 topics a day');
  });

  test('new: what the plan lists, and when the pace shows', () => {
    const s = planStatus({ pace: null, listed: 18, studyDays: 6, overdue: 1 })!;
    const t = planStatusText(s, 'Arjun');
    assert.equal(t.headline, 'Getting started');
    assert.match(t.lines[0], /pace shows after the first few study days/);
    assert.match(t.lines[0], /about 3 topics a study day/);
    assert.equal(t.lines[1], "1 topic is overdue and first on today's list.");
  });
});
