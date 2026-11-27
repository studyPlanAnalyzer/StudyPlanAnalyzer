import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { marksheetError, marksheetPayload, marksheetProblem, type MarkEntry } from '@/components/exam/MarksheetFields';

// Exam marksheets: only the topics an exam tested are filled in.
const entry = (key: string, fullMarks: string, obtainedMarks = ''): MarkEntry => ({
  key, subjectId: 's', subjectName: 'Maths', topicId: key, groupName: null, label: key,
  fullMarks, obtainedMarks, confidenceLevel: 'medium',
});

describe('Marksheet', () => {
  test('a blank “Out of” means not in this exam: no error, nothing saved', () => {
    const marks = [entry('algebra', '50', '30'), entry('geometry', ''), entry('sets', '0')];
    assert.equal(marksheetError(marks), null);
    assert.deepEqual(marksheetPayload(marks).map((m) => m.topicIds), [['algebra']]);
  });
  test('a filled-in “Out of” still needs a mark', () => {
    assert.match(marksheetError([entry('algebra', '50')])!, /Enter the marks obtained for Maths › algebra, out of 50/);
  });
  test('more obtained than the full marks names the row', () => {
    assert.deepEqual(marksheetProblem([entry('a', '20', '10'), entry('algebra', '18', '20')]), {
      key: 'algebra',
      message: 'Maths › algebra: 20 obtained is more than the 18 it\'s out of.',
    });
  });
});
