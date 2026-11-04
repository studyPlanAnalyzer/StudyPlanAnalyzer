import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  OPTIONAL_NOTE,
  requiredProgress,
  SessionCard,
  type SessionItem,
} from '@/components/session/SessionCard';
import { sessionBadge } from '@/components/plan/WeeklyPlanView';

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

  test('an optional session has nothing to rate and says why', () => {
    const html = render(session({ sessionType: 'practice', isFiller: true }));
    assert.doesNotMatch(html, /How did it go\?/);
    assert.doesNotMatch(html, /Again|Hard|Good|Easy/);
    assert.match(html, /no rating needed/);
    assert.match(html, /any other subject/);
    assert.match(html, /isn&#x27;t part of the review schedule/);
    assert.match(OPTIONAL_NOTE, /review schedule/);
    assert.match(html, /Mark done/);
    assert.doesNotMatch(html, /Skip/, 'skipping an optional session does nothing');
    assert.doesNotMatch(html, /without looking at notes/, 'that line is for required sessions');
    assert.doesNotMatch(html, /<button[^>]*\sdisabled=/, 'done needs no rating first');
    assert.doesNotMatch(html, /log what you studied/);
  });
});

describe("today's progress", () => {
  test('counts required sessions only', () => {
    assert.deepEqual(
      requiredProgress([
        session({ status: 'completed' }),
        session({ status: 'planned', isFiller: true, sessionType: 'practice' }),
      ]),
      { done: 1, total: 1 },
    );
  });

  test('a finished optional session adds nothing, and partly done counts', () => {
    assert.deepEqual(
      requiredProgress([
        session({ status: 'partly_completed' }),
        session({ status: 'planned' }),
        session({ status: 'completed', isFiller: true, sessionType: 'practice' }),
      ]),
      { done: 1, total: 2 },
    );
  });

  test('a day with only optional sessions has nothing to count', () => {
    assert.deepEqual(
      requiredProgress([session({ isFiller: true, sessionType: 'practice' })]),
      { done: 0, total: 0 },
    );
  });
});

describe('week view status badge', () => {
  const TODAY = '2026-11-04';
  const YESTERDAY = '2026-11-03';

  test('an optional session nobody did reads Not done, in a neutral colour', () => {
    const skipped = sessionBadge({ status: 'skipped', isFiller: true }, YESTERDAY, TODAY);
    assert.equal(skipped.label, 'Not done');
    assert.doesNotMatch(skipped.className, /fee2e2/);
    const leftPlanned = sessionBadge({ status: 'planned', isFiller: true }, YESTERDAY, TODAY);
    assert.equal(leftPlanned.label, 'Not done');
  });

  test("today's and later optional sessions are still just planned", () => {
    assert.equal(sessionBadge({ status: 'planned', isFiller: true }, TODAY, TODAY).label, 'Planned');
    assert.equal(sessionBadge({ status: 'planned', isFiller: true }, '2026-11-05', TODAY).label, 'Planned');
  });

  test('a required session that was missed still reads a red Skipped', () => {
    const badge = sessionBadge({ status: 'skipped', isFiller: false }, YESTERDAY, TODAY);
    assert.equal(badge.label, 'Skipped');
    assert.match(badge.className, /fee2e2/);
  });

  test('a finished optional session reads Completed', () => {
    assert.equal(sessionBadge({ status: 'completed', isFiller: true }, YESTERDAY, TODAY).label, 'Completed');
  });
});
