import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { isStruggling, sortForFocus, topFocusTopics } from '@/lib/utils/topic-status';
import { generateStudyPlan, type SubjectInput } from '@/lib/utils/plan-generator';
import { fromDateString } from '@/lib/utils/date-utils';

// Ratings: 1 Again, 2 Hard, 3 Good, 4 Easy. Lists are newest first.
const AGAIN = 1, HARD = 2, GOOD = 3, EASY = 4;

describe('Struggling: Again or Hard on 2 of the last 3 ratings', () => {
  test('two of the last three are Hard or Again', () => {
    assert.equal(isStruggling([AGAIN, HARD, GOOD]), true);
    assert.equal(isStruggling([HARD, GOOD, AGAIN]), true);
    assert.equal(isStruggling([GOOD, HARD, HARD]), true);
  });

  test('two ratings are enough when both are Hard or Again; one Hard alone is not', () => {
    assert.equal(isStruggling([HARD, AGAIN]), true);
    assert.equal(isStruggling([HARD]), false);
    assert.equal(isStruggling([HARD, GOOD]), false);
    assert.equal(isStruggling([]), false);
  });

  test('only the last three count, so two good ratings in a row clear it', () => {
    // Good, Hard, Again (struggling), then Good, Good.
    assert.equal(isStruggling([AGAIN, HARD, GOOD]), true);
    assert.equal(isStruggling([GOOD, AGAIN, HARD, GOOD]), true);
    assert.equal(isStruggling([GOOD, GOOD, AGAIN, HARD, GOOD]), false);
  });

  test('a topic rated Easy three times (mastered) is never struggling', () => {
    assert.equal(isStruggling([EASY, EASY, EASY, HARD, AGAIN]), false);
  });
});

describe('Focus order: struggling first, mastered last, by priority within each', () => {
  const t = (id: string, priority: number, status: 'struggling' | 'mastered' | null = null) => ({
    id,
    priority,
    struggling: status === 'struggling',
    mastered: status === 'mastered',
  });
  const topics = [
    t('top', 90),
    t('mastered-top', 95, 'mastered'),
    t('mid', 60),
    t('struggling-low', 20, 'struggling'),
    t('struggling-mid', 40, 'struggling'),
    t('low', 10),
  ];

  test('sortForFocus orders the full list', () => {
    assert.deepEqual(sortForFocus(topics).map((x) => x.id), [
      'struggling-mid', 'struggling-low', 'top', 'mid', 'low', 'mastered-top',
    ]);
  });

  test('Top 3 to focus on: struggling topics first, never a mastered topic', () => {
    assert.deepEqual(topFocusTopics(topics).map((x) => x.id), ['struggling-mid', 'struggling-low', 'top']);
  });

  test('with no struggling topics, Top 3 is by priority, skipping mastered ones', () => {
    const calm = topics.filter((x) => !x.struggling);
    assert.deepEqual(topFocusTopics(calm).map((x) => x.id), ['top', 'mid', 'low']);
  });

  test('every topic mastered: nothing to focus on', () => {
    assert.deepEqual(topFocusTopics([t('a', 50, 'mastered'), t('b', 40, 'mastered')]), []);
  });

  test('the input list is not reordered', () => {
    const copy = [...topics];
    sortForFocus(topics);
    assert.deepEqual(topics, copy);
  });
});

describe('Plan generator: a struggling topic gets the next tier’s session lengths', () => {
  // estimatedMastery sets the tier: 85% Strong, 60% Medium, 30% Weak.
  function sessionsFor(mastery: number, struggling: boolean, state?: 'reviewing' | 'mastered') {
    const subject: SubjectInput = {
      id: 'sci',
      name: 'Science',
      examWeight: 'medium',
      marksHistory: { records: [], latestConfidence: null },
      topics: [
        {
          id: 't',
          subjectId: 'sci',
          difficultyRating: 2,
          estimatedMastery: mastery,
          struggling,
          spacedState: state
            ? { status: state, nextReviewDate: '2026-11-12', repetitionCount: 3 }
            : null,
        },
      ],
    };
    const plan = generateStudyPlan({
      examDate: fromDateString('2026-12-30'),
      studyDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      subjects: [subject],
      startDate: fromDateString('2026-11-10'),
    });
    return {
      sessions: plan.sessions
        .filter((s) => s.topicId === 't' && !s.isFiller)
        .map((s) => [s.sessionType, s.durationMinutes]),
      strongFocus: plan.strongFocusPercent,
    };
  }

  test('Strong topic: learn 20 / review 15, or 30 / 20 when struggling', () => {
    assert.deepEqual(sessionsFor(85, false).sessions, [['learn', 20], ['review', 15]]);
    assert.deepEqual(sessionsFor(85, true).sessions, [['learn', 30], ['review', 20]]);
  });

  test('Medium topic: 30 / 20, or 40 / 25 when struggling', () => {
    assert.deepEqual(sessionsFor(60, false).sessions, [['learn', 30], ['review', 20]]);
    assert.deepEqual(sessionsFor(60, true).sessions, [['learn', 40], ['review', 25]]);
  });

  test('Weak topic: already the longest, so no change', () => {
    assert.deepEqual(sessionsFor(30, true).sessions, sessionsFor(30, false).sessions);
  });

  test('a review on the ladder is longer too', () => {
    assert.deepEqual(sessionsFor(85, false, 'reviewing').sessions, [['review', 15]]);
    assert.deepEqual(sessionsFor(85, true, 'reviewing').sessions, [['review', 20]]);
  });

  test('the tier itself still comes from marks: the focus split does not move', () => {
    assert.equal(sessionsFor(85, true).strongFocus, 100);
  });
});
