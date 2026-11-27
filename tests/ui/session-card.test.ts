import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SessionCard, type SessionItem } from '@/components/session/SessionCard';

const session = (overrides: Partial<SessionItem> = {}) =>
  ({
    id: 's1',
    status: 'planned',
    rating: null,
    sessionType: 'learn',
    durationMinutes: 20,
    scheduledDate: '2026-11-04',
    topicName: 'Grammar',
    subjectName: 'English',
    ...overrides,
  }) as SessionItem;

const render = (s: SessionItem) =>
  renderToStaticMarkup(
    createElement(SessionCard, { session: s, onComplete: () => {}, onSkip: () => {} }),
  );

describe('session card', () => {
  test('a required session asks for a rating', () => {
    const html = render(session());
    assert.match(html, /How did it go\?/);
    assert.match(html, /Mark completed/);
    assert.match(html, /Skip/);
  });

  test('every session is rated: there are no optional ones any more', () => {
    const html = render(session({ sessionType: 'practice' }));
    assert.match(html, /How did it go\?/);
    assert.doesNotMatch(html, /Free Choice|no rating needed|Mark done/);
  });
});

describe('session card: mastered topics', () => {
  test('a review of a mastered topic shows the badge and asks for a quick check', () => {
    const html = render(session({ sessionType: 'review', topicMastered: true, durationMinutes: 15 }));
    assert.match(html, /Mastered/);
    assert.match(html, /quick check/);
    assert.match(html, /rate it Hard/);
    assert.match(html, /How did it go\?/, 'a mastered review is still rated');
  });

  test('a topic that is not mastered shows no badge and the usual instruction', () => {
    const html = render(session({ sessionType: 'review' }));
    assert.doesNotMatch(html, /Mastered/);
    assert.match(html, /Quickly revisit the topic/);
  });
});

describe('session card: Needs practice topics', () => {
  test('a Needs practice topic shows the badge and says there is more time today', () => {
    const html = render(session({ sessionType: 'review', topicStruggling: true, durationMinutes: 20 }));
    assert.match(html, /Needs practice/);
    assert.match(html, /felt hard lately/);
    assert.doesNotMatch(html, /Mastered/);
    assert.match(html, /How did it go\?/);
  });

  test('a learn session on a Needs practice topic gets the same note', () => {
    const html = render(session({ sessionType: 'learn', topicStruggling: true }));
    assert.match(html, /Needs practice/);
    assert.match(html, /felt hard lately/);
  });
});
