import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  academicYearLabel,
  academicYearOf,
  academicYearText,
  earlierExamChoices,
  earlierTopicsOfYear,
  topicAcademicYear,
} from '@/lib/utils/academic-year';

// The Nepali academic year, Baisakh to Chaitra (mid-April to mid-April).

const exams = [
  { id: 'third', name: 'Third Terminal Examination', examDate: '2026-11-20' },
  { id: 'final', name: 'Final Examination', examDate: '2027-03-25' },
];
const topic = (id: string, examId: string | null, examName: string | null, parentTopicId: string | null = null) => ({
  id,
  examId,
  examName,
  parentTopicId,
});

describe('Academic year', () => {
  test('from the date: a new year from mid-April', () => {
    assert.equal(academicYearOf('2026-11-12'), 2083);
    assert.equal(academicYearOf('2027-03-25'), 2083, 'the Final, in Chaitra, is the same year');
    assert.equal(academicYearOf('2026-04-13'), 2082);
    assert.equal(academicYearOf('2026-04-14'), 2083);
    assert.equal(academicYearOf('2026-01-01'), 2082);
  });

  test('labelled like 2082/83', () => {
    assert.equal(academicYearLabel(2082), '2082/83');
    assert.equal(academicYearLabel(2099), '2099/00');
    assert.equal(academicYearText('2026-11-12'), 'Academic year 2083/84');
    assert.equal(academicYearText(''), null);
  });

  test("a topic's year is its exam's; one from before joining is the year the child joined", () => {
    assert.equal(topicAcademicYear(topic('a', 'final', 'Final Examination'), exams), 2083);
    assert.equal(topicAcademicYear(topic('b', null, 'First Terminal Examination'), exams), 2083);
    assert.equal(topicAcademicYear(topic('c', null, null), exams), null);
    assert.equal(topicAcademicYear(topic('d', 'gone', 'Old exam'), exams), null);
  });
});

describe("The year's earlier exams", () => {
  test('joined at the Third Terminal: the two before it, then the app\'s own', () => {
    assert.deepEqual(
      earlierExamChoices(2083, exams.slice(0, 1)).map((c) => c.examName),
      ['First Terminal Examination', 'Second Terminal Examination', 'Third Terminal Examination'],
    );
    assert.deepEqual(earlierExamChoices(2084, exams), [], 'nothing in another year');
  });

  test('every topic listed for the year, grouped by exam, earliest first; parents left out', () => {
    const groups = earlierTopicsOfYear(
      2083,
      [
        topic('t1', 'third', 'Third Terminal Examination'),
        topic('f1', null, 'First Terminal Examination'),
        topic('s1', null, 'Second Terminal Examination'),
        topic('parent', null, 'First Terminal Examination'),
        topic('sub', null, 'First Terminal Examination', 'parent'),
        topic('untagged', null, null),
      ],
      exams,
    );
    assert.deepEqual(
      groups.map((g) => [g.examName, g.topics.map((t) => t.id)]),
      [
        ['First Terminal Examination', ['f1', 'sub']],
        ['Second Terminal Examination', ['s1']],
        ['Third Terminal Examination', ['t1']],
      ],
    );
  });

  test("last year's topics aren't this year's", () => {
    const old = [{ id: 'old', name: 'Final Examination', examDate: '2026-03-25' }, ...exams];
    assert.deepEqual(earlierTopicsOfYear(2083, [topic('x', 'old', 'Final Examination')], old), []);
  });
});
