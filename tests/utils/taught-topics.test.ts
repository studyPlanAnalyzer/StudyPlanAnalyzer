import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { taughtLeafCount, taughtTopicRows, taughtTopicSchema } from '@/lib/taught-topics';

// Topics taught so far, entered with sub-topics during setup.
const topics = [
  taughtTopicSchema.parse({ name: 'Algebra', subTopics: [{ name: 'Functions', difficultyRating: 3 }, { name: 'Indices' }] }),
  taughtTopicSchema.parse({ name: 'Sets', difficultyRating: 2 }),
].map((t) => ({ ...t, subjectId: 's' }));

describe('Taught topics with sub-topics', () => {
  test('the studied ones are the sub-topics, or a topic without any', () => {
    assert.equal(taughtLeafCount(topics), 3);
  });
  test('each sub-topic points at its topic; learn dates go to studied ones only, in order', () => {
    const rows = taughtTopicRows(topics, { examId: 'e', examName: 'First Terminal Examination' }, ['d1', 'd2', 'd3']);
    const algebra = rows.find((r) => r.name === 'Algebra')!;
    assert.deepEqual(
      rows.map((r) => [r.name, r.parentTopicId === algebra.id ? 'under Algebra' : r.parentTopicId, r.learnFrom, r.examName]),
      [
        ['Algebra', null, null, 'First Terminal Examination'],
        ['Functions', 'under Algebra', 'd1', 'First Terminal Examination'],
        ['Indices', 'under Algebra', 'd2', 'First Terminal Examination'],
        ['Sets', null, 'd3', 'First Terminal Examination'],
      ],
    );
  });
  test('a sub-topic name can be used once under its topic', () => {
    assert.equal(taughtTopicSchema.safeParse({ name: 'Algebra', subTopics: [{ name: 'Functions' }, { name: ' functions ' }] }).success, false);
  });
});
