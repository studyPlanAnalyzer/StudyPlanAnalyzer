import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANOTHER_LOOK_AFTER_DAYS,
  agoText,
  isEarlierTopic,
  inFinalLook,
  revisionHeadings,
  revisionStanding,
  revisionWeakness,
  type EarlierTopic,
} from '@/lib/utils/revision';
import { isRevisionDay, revisionDays, sm2Days, spreadLearnFrom, tomorrowKey } from '@/lib/utils/revision-days';
import { EXAM_NAMES, examNamesBefore, nextExamName } from '@/lib/exam-names';

// Revising earlier-exam topics on revision days, and the days themselves.
// 2026-11-12 is a Thursday.

const TODAY = '2026-11-12';
const topic = (id: string, extra: Partial<EarlierTopic> = {}): EarlierTopic => ({
  id,
  name: id,
  subjectName: 'Science',
  examName: 'First Terminal Examination',
  weakness: 50,
  lastStudied: null,
  latest: null,
  backOnDailyList: false,
  standing: null,
  standingReason: null,
  ...extra,
});
const headingsOf = (topics: EarlierTopic[], finalLook = false) =>
  revisionHeadings(topics, TODAY, finalLook).map((h) => [h.heading, h.topics.map((t) => t.id)]);

describe('Which topics are from earlier exams', () => {
  test('tagged with another exam, or named after one from before joining', () => {
    assert.equal(isEarlierTopic({ examId: 'e1', examName: 'First Terminal Examination' }, 'e2'), true);
    assert.equal(isEarlierTopic({ examId: null, examName: 'First Terminal Examination' }, 'e2'), true);
    assert.equal(isEarlierTopic({ examId: 'e2', examName: 'Second Terminal Examination' }, 'e2'), false);
  });
  test('a topic with no exam tag at all is the current exam\'s, so it never drops off the list', () => {
    assert.equal(isEarlierTopic({ examId: null, examName: null }, 'e2'), false);
  });
});

describe('Revision headings', () => {
  test('each rating puts the topic under its heading, in the agreed order', () => {
    assert.deepEqual(
      headingsOf([
        topic('easy', { latest: { rating: 4, on: '2026-11-08' } }),
        topic('good', { latest: { rating: 3, on: '2026-11-08' } }),
        topic('fresh'),
        topic('hard', { latest: { rating: 2, on: '2026-11-08' } }),
        topic('again', { backOnDailyList: true, latest: { rating: 1, on: '2026-11-07' } }),
        topic('stale', { latest: { rating: 4, on: '2026-10-01' } }),
      ]),
      [
        ['hard', ['hard']],
        ['anotherLook', ['stale']],
        ['notYet', ['fresh']],
        ['revised', ['good']],
        ['easy', ['easy']],
        ['back', ['again']],
      ],
    );
  });

  test('not yet revised for this exam: by how it has gone so far', () => {
    assert.deepEqual(
      headingsOf([
        topic('known', { standing: 'known' }),
        topic('plain'),
        topic('needs', { standing: 'needs' }),
        topic('needsButRevised', { standing: 'needs', latest: { rating: 3, on: '2026-11-08' } }),
        topic('hard', { latest: { rating: 2, on: '2026-11-08' } }),
      ]),
      [
        ['hard', ['hard']],
        ['needs', ['needs']],
        ['notYet', ['plain']],
        ['known', ['known']],
        ['revised', ['needsButRevised']],
      ],
    );
  });

  test('needs it most: hard last time, marked not sure, low marks, or a hard topic', () => {
    const standing = (args: Partial<Parameters<typeof revisionStanding>[0]>) =>
      revisionStanding({ difficulty: 2, selfRating: null, ratings: [], lowMarks: false, ...args });
    assert.deepEqual(standing({ ratings: [4, 4, 2] }), { standing: 'needs', reason: 'Rated hard last time' });
    assert.deepEqual(standing({ ratings: [2, 3] }).standing, null, 'only the latest rating counts');
    assert.deepEqual(standing({ selfRating: 'not_sure' }), { standing: 'needs', reason: 'Marked not sure' });
    assert.deepEqual(standing({ lowMarks: true, selfRating: 'know_well' }), { standing: 'needs', reason: 'Low test marks' });
    assert.deepEqual(standing({ difficulty: 4 }), { standing: 'needs', reason: 'Difficulty 4' });
    assert.deepEqual(standing({ difficulty: 5, selfRating: 'know_well' }), { standing: 'known', reason: 'Marked know it well' });
    assert.deepEqual(standing({ ratings: [4, 4] }), { standing: 'known', reason: 'Always easy so far' });
    assert.deepEqual(standing({ selfRating: 'ok' }), { standing: null, reason: null });
  });

  test("the parent's mark counts only until the child rates the topic", () => {
    const standing = (selfRating: 'not_sure' | 'know_well', ratings: number[]) =>
      revisionStanding({ difficulty: 2, selfRating, ratings, lowMarks: false }).standing;
    assert.equal(standing('not_sure', []), 'needs');
    assert.equal(standing('not_sure', [3]), null);
    assert.equal(standing('know_well', [3]), null);
  });

  test(`Good or Easy comes back as "Time for another look" after ${ANOTHER_LOOK_AFTER_DAYS} days`, () => {
    assert.deepEqual(headingsOf([topic('a', { latest: { rating: 3, on: '2026-10-16' } })]), [['revised', ['a']]]); // 27 days
    assert.deepEqual(headingsOf([topic('a', { latest: { rating: 3, on: '2026-10-15' } })]), [['anotherLook', ['a']]]); // 28 days
  });

  test('Hard and not-yet-revised topics: the ones that need it most first', () => {
    assert.deepEqual(
      headingsOf([topic('ok', { weakness: 20 }), topic('weak', { weakness: 80 }), topic('mid', { weakness: 50 })]),
      [['notYet', ['weak', 'mid', 'ok']]],
    );
  });

  test('revised and easy topics: revised longest ago first', () => {
    assert.deepEqual(
      headingsOf([
        topic('recent', { latest: { rating: 4, on: '2026-11-10' } }),
        topic('older', { latest: { rating: 4, on: '2026-11-01' } }),
      ]),
      [['easy', ['older', 'recent']]],
    );
  });

  test('the final look lists everything together, studied longest ago first; Again stays on the daily list', () => {
    assert.deepEqual(
      headingsOf(
        [
          topic('hard', { lastStudied: '2026-11-08', latest: { rating: 2, on: '2026-11-08' } }),
          topic('never'),
          topic('old', { lastStudied: '2026-09-01' }),
          topic('again', { backOnDailyList: true }),
        ],
        true,
      ),
      [
        ['final', ['never', 'old', 'hard']],
        ['back', ['again']],
      ],
    );
  });

  test('the final look: the last 14 days before the plan stops', () => {
    assert.equal(inFinalLook('2026-11-12', '2026-11-25'), true); // 13 days left
    assert.equal(inFinalLook('2026-11-12', '2026-11-26'), false); // 14 days left
    assert.equal(inFinalLook('2026-11-12', '2026-11-12'), true);
    assert.equal(inFinalLook('2026-11-12', '2026-11-11'), false, 'after the plan stopped');
  });

  test('weakness: test marks and difficulty, plus Hard/Again history, plus the joiner\'s own sense', () => {
    assert.equal(revisionWeakness({ priority: 40, ratings: [], selfRating: null }), 40);
    assert.equal(revisionWeakness({ priority: 40, ratings: [2, 3, 1, 4], selfRating: null }), 55);
    assert.equal(revisionWeakness({ priority: 40, ratings: [], selfRating: 'not_sure' }), 55);
    assert.equal(revisionWeakness({ priority: 40, ratings: [], selfRating: 'know_well' }), 25);
  });

  test('dates in words', () => {
    assert.equal(agoText('2026-11-12', TODAY), 'today');
    assert.equal(agoText('2026-11-11', TODAY), 'yesterday');
    assert.equal(agoText('2026-11-09', TODAY), '3 days ago');
    assert.equal(agoText('2026-10-29', TODAY), '2 weeks ago');
  });
});

describe('Revision days', () => {
  test('Saturday always; Sunday unless the school is open', () => {
    assert.deepEqual(revisionDays(true), ['Sat', 'Sun']);
    assert.deepEqual(revisionDays(false), ['Sat']);
    assert.equal(isRevisionDay('2026-11-14', false), true); // Saturday
    assert.equal(isRevisionDay('2026-11-15', false), false); // Sunday, a school day
    assert.equal(isRevisionDay('2026-11-15', true), true);
  });

  test('SM-2 runs every day until there are earlier topics, then not on revision days', () => {
    assert.equal(sm2Days(true, false).length, 7, 'first term: weekends follow SM-2 too');
    assert.deepEqual(sm2Days(true, true), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    assert.deepEqual(sm2Days(false, true), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  });

  test('a setup batch starts tomorrow, 4 a day, skipping days with no SM-2', () => {
    // Thursday the 12th: Fri 13 gets 4, then Mon 16 (Sat and Sun are revision days).
    assert.deepEqual(spreadLearnFrom(6, TODAY, ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']), [
      '2026-11-13', '2026-11-13', '2026-11-13', '2026-11-13', '2026-11-16', '2026-11-16',
    ]);
    assert.deepEqual(spreadLearnFrom(0, TODAY, ['Mon']), []);
    assert.equal(tomorrowKey(TODAY), '2026-11-13');
  });
});

describe('Exam names', () => {
  test('the four exams of the year, and what follows what', () => {
    assert.deepEqual(EXAM_NAMES, [
      'First Terminal Examination',
      'Second Terminal Examination',
      'Third Terminal Examination',
      'Final Examination',
    ]);
    assert.equal(nextExamName('First Terminal Examination'), 'Second Terminal Examination');
    assert.equal(nextExamName('Final Examination'), null);
    assert.equal(nextExamName('Half-yearly'), null);
    assert.deepEqual(examNamesBefore('Third Terminal Examination'), ['First Terminal Examination', 'Second Terminal Examination']);
    assert.deepEqual(examNamesBefore('First Terminal Examination'), []);
  });
});
