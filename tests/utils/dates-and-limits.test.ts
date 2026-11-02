import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  appDay,
  appDayStart,
  appToday,
  daysUntil,
  fromDateString,
  isRealDateString,
  toDateString,
  todayKey,
} from '@/lib/utils/date-utils';
import {
  examDateProblem,
  holidayDayMinutesSchema,
  schoolDayMinutesSchema,
  studyDaysSchema,
} from '@/lib/validation';
import { isExamOver } from '@/lib/plan-expiry';
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

describe('study day and minute limits', () => {
  test('only Sun..Sat, each once', () => {
    assert.deepEqual(studyDaysSchema.parse(['Mon', 'Mon', 'Sun']), ['Mon', 'Sun']);
    for (const bad of [['mon'], ['Funday'], []])
      assert.equal(studyDaysSchema.safeParse(bad).success, false, JSON.stringify(bad));
  });
  test('45-120 minutes on school days, 90-120 on holidays', () => {
    assert.equal(schoolDayMinutesSchema.safeParse(44).success, false);
    assert.equal(schoolDayMinutesSchema.safeParse(45).success, true);
    assert.equal(schoolDayMinutesSchema.safeParse(120).success, true);
    assert.equal(schoolDayMinutesSchema.safeParse(121).success, false);
    assert.equal(holidayDayMinutesSchema.safeParse(89).success, false);
    assert.equal(holidayDayMinutesSchema.safeParse(120).success, true);
    assert.equal(holidayDayMinutesSchema.safeParse(121).success, false);
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

  test('no session is scheduled on the exam day', () => {
    const examDate = fromDateString('2026-11-05');
    const r = generateStudyPlan({
      examDate,
      studyDays: ALL_DAYS,
      schoolDayMinutes: 120,
      holidayDayMinutes: 120,
      subjects: [subject],
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
      schoolDayMinutes: 45,
      holidayDayMinutes: 90,
      subjects: [subject],
      startDate: start,
    });
    const last = r.sessions.at(-1)!.scheduledDate;
    assert.ok(last <= toDateString(addDays(start, 365)), last);
  });
});
