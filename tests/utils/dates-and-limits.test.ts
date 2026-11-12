import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  appDay,
  appDayStart,
  appToday,
  daysUntil,
  formatDay,
  formatInstantDay,
  fromDateString,
  isRealDateString,
  toDateString,
  todayKey,
} from '@/lib/utils/date-utils';
import {
  examDateProblem,
  studyDaysSchema,
} from '@/lib/validation';
import { isExamOver } from '@/lib/plan-expiry';
import { addMonths } from '@/lib/billing/state';
import { generateStudyPlan, type SubjectInput } from '@/lib/utils/plan-generator';

const inDays = (n: number) => toDateString(addDays(appToday(), n));

describe('the app day is the day in Nepal (UTC+5:45)', () => {
  test('a day starts at 18:15 UTC the evening before', () => {
    assert.equal(toDateString(appDay(new Date('2026-11-02T18:14:59Z'))), '2026-11-02');
    assert.equal(toDateString(appDay(new Date('2026-11-02T18:15:00Z'))), '2026-11-03');
    assert.equal(toDateString(appDay(new Date('2026-11-02T00:00:00Z'))), '2026-11-02');
  });
  test('appDayStart is midnight in Nepal', () => {
    assert.equal(appDayStart(fromDateString('2026-11-03')).toISOString(), '2026-11-02T18:15:00.000Z');
  });
  test('today and days until', () => {
    assert.equal(todayKey(), toDateString(appToday()));
    assert.equal(daysUntil(todayKey()), 0);
    assert.equal(daysUntil(inDays(1)), 1);
    assert.equal(daysUntil(inDays(-3)), -3);
  });
  test('an exam is over from the start of its day', () => {
    assert.equal(isExamOver(inDays(0)), true);
    assert.equal(isExamOver(inDays(-1)), true);
    assert.equal(isExamOver(inDays(1)), false);
  });
});

describe('real dates', () => {
  test('impossible dates are refused, not rolled over', () => {
    for (const s of ['2027-02-30', '2026-13-01', '2026-00-10', '2026-1-5', 'abc', ''])
      assert.equal(isRealDateString(s), false, s);
    for (const s of ['2028-02-29', '2026-12-31', '2026-01-01'])
      assert.equal(isRealDateString(s), true, s);
  });
});

describe('exam date rule', () => {
  test('after today, at most a year ahead', () => {
    assert.equal(examDateProblem(inDays(0)), 'Exam date must be in the future');
    assert.equal(examDateProblem(inDays(-1)), 'Exam date must be in the future');
    assert.equal(examDateProblem(inDays(1)), null);
    assert.equal(examDateProblem(inDays(365)), null);
    assert.equal(examDateProblem(inDays(366)), 'Exam date must be within a year from today');
    assert.equal(examDateProblem('9999-12-31'), 'Exam date must be within a year from today');
    assert.equal(examDateProblem('2027-02-30'), 'Use a real date (YYYY-MM-DD)');
  });
});

describe('study day limits', () => {
  test('only Sun..Sat, each once', () => {
    assert.deepEqual(studyDaysSchema.parse(['Mon', 'Mon', 'Sun']), ['Mon', 'Sun']);
    for (const bad of [['mon'], ['Funday'], []])
      assert.equal(studyDaysSchema.safeParse(bad).success, false, JSON.stringify(bad));
  });
});

describe('plan generator calendar', () => {
  const subject: SubjectInput = {
    id: 's1',
    name: 'Mathematics',
    examWeight: 'medium',
    marksHistory: { records: [{ percent: 40, fullMarks: 100 }] },
    topics: Array.from({ length: 6 }, (_, i) => ({
      id: `t${i}`,
      subjectId: 's1',
      difficultyRating: 2,
      estimatedMastery: null,
    })),
  };
  const ALL_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const start = fromDateString('2026-11-01');

  test('no session is scheduled on the exam day: the day before is the last', () => {
    const examDate = fromDateString('2026-11-05');
    // Topics taught on the 3rd and the 4th: learned the next day, the second
    // one's follow-up would fall on the exam day itself.
    const r = generateStudyPlan({
      examDate,
      studyDays: ALL_DAYS,
      subjects: [{
        ...subject,
        topics: subject.topics.map((t, i) => ({ ...t, learnFrom: i % 2 ? '2026-11-04' : '2026-11-03' })),
      }],
      startDate: start,
    });
    assert.ok(r.sessions.length > 0);
    assert.ok(r.sessions.every((s) => s.scheduledDate < '2026-11-05'));
    assert.equal(r.sessions.at(-1)!.scheduledDate, '2026-11-04');
  });

  test('a far-off exam never makes a schedule longer than a year', () => {
    const r = generateStudyPlan({
      examDate: fromDateString('2099-01-01'),
      studyDays: ALL_DAYS,
      subjects: [subject],
      startDate: start,
    });
    const last = r.sessions.at(-1)!.scheduledDate;
    assert.ok(last <= toDateString(addDays(start, 365)), last);
  });
});

// These hold whatever time zone the machine runs in (the suite is also run
// with TZ=America/Los_Angeles and TZ=Asia/Kathmandu).
describe('dates read the same on every device and server', () => {
  test('a calendar day is shown as that day', () => {
    assert.equal(formatDay('2026-12-15', { day: 'numeric', month: 'short' }, 'en-US'), 'Dec 15');
    assert.equal(formatDay('2026-01-01', { year: 'numeric' }, 'en-US'), '2026');
  });
  test('a stored moment is shown as its date in Nepal', () => {
    // 19:00 UTC on 2 Nov is 00:45 on 3 Nov in Nepal.
    assert.equal(formatInstantDay('2026-11-02T19:00:00Z', { day: 'numeric', month: 'short' }, 'en-US'), 'Nov 3');
    assert.equal(formatInstantDay('2026-11-02T18:00:00Z', { day: 'numeric', month: 'short' }, 'en-US'), 'Nov 2');
  });
  test('paid periods add months as the calendar runs in Nepal', () => {
    // 31 Jan 01:00 in Nepal (30 Jan 19:15 UTC) -> 28 Feb 01:00 in Nepal.
    assert.equal(addMonths(new Date('2026-01-30T19:15:00Z'), 1).toISOString(), '2026-02-27T19:15:00.000Z');
    assert.equal(addMonths(new Date('2026-01-31T10:00:00Z'), 1).toISOString(), '2026-02-28T10:00:00.000Z');
    assert.equal(addMonths(new Date('2027-11-30T10:00:00Z'), 3).toISOString(), '2028-02-29T10:00:00.000Z');
  });
});

describe('topic suggestions', () => {
  test('only from 3 characters on', async () => {
    const { suggestTopicsFor } = await import('@/lib/common-topics');
    assert.deepEqual(suggestTopicsFor(''), []);
    assert.deepEqual(suggestTopicsFor('a'), []);
    assert.deepEqual(suggestTopicsFor('ma'), []);
    assert.equal(suggestTopicsFor('Mathematics').length, 7);
    assert.equal(suggestTopicsFor('maths').length, 7);
    assert.equal(suggestTopicsFor('Nepali').length, 3);
  });
});

describe('billing state of a payment being checked', () => {
  test('pending stays usable whatever its date; a paid period still gets grace, then locks', async () => {
    const { billingStateOf, canUse } = await import('@/lib/billing/state');
    const now = new Date('2026-11-10T00:00:00Z');
    const daysAgo = (n: number) => new Date(now.getTime() - n * 864e5);
    assert.equal(billingStateOf(daysAgo(30), 'pending', now), 'pending');
    assert.equal(billingStateOf(null, 'pending', now), 'pending');
    assert.equal(canUse(billingStateOf(daysAgo(30), 'pending', now)), true);
    assert.equal(billingStateOf(daysAgo(1), 'verified', now), 'grace');
    assert.equal(billingStateOf(daysAgo(3), 'verified', now), 'locked');
    assert.equal(billingStateOf(null, 'none', now), 'unpaid');
  });
});

describe('device labels', () => {
  test('browser and device type from the User-Agent', async () => {
    const { deviceLabel } = await import('@/lib/auth/device');
    assert.equal(deviceLabel(null), 'Unknown device');
    assert.equal(deviceLabel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36 Edg/120.0'), 'Edge on Windows');
    assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile Safari/604.1'), 'Chrome on iPhone');
    assert.equal(deviceLabel('Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 SamsungBrowser/23.0 Chrome/115.0 Mobile Safari/537.36'), 'Samsung Internet on Android');
    assert.equal(deviceLabel('Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'), 'Firefox on Linux');
  });
});
