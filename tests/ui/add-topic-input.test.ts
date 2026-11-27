import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { duplicateMessage } from '@/components/ui/AddTopicInput';

// Adding a custom topic in onboarding: only names the parent can see, or
// has already added, count as duplicates.
describe('Adding a custom topic', () => {
  test('a name already in the list shown is refused, whatever its case and spacing', () => {
    assert.match(duplicateMessage(' trigonometry ', ['Algebra', 'Trigonometry'])!, /already in the list/);
  });
  test('a new academic session: no earlier topics, so nothing hidden counts', () => {
    assert.equal(duplicateMessage('Trigonometry', [], []), null);
  });
  test('a topic added on the other step is refused with where it is', () => {
    const elsewhere = [{ names: ['Trigonometry'], message: (n: string) => `“${n}” is already added as an earlier topic.` }];
    assert.equal(duplicateMessage('Trigonometry', [], elsewhere), '“Trigonometry” is already added as an earlier topic.');
  });
});
