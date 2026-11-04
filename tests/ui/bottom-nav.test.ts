import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StudentBottomNav } from '@/components/ui/StudentBottomNav';

const render = (props: Parameters<typeof StudentBottomNav>[0]) =>
  renderToStaticMarkup(createElement(StudentBottomNav, props));
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);

describe('bottom nav', () => {
  test('with no child, Home and Create are links and the rest are real buttons', () => {
    const html = render({ studentId: null, active: 'home', noChild: true });
    assert.deepEqual(hrefs(html), ['/dashboard', '/onboarding']);
    const buttons = html.match(/<button[^>]*>/g) ?? [];
    assert.equal(buttons.length, 3);
    for (const b of buttons) {
      assert.match(b, /type="button"/);
      assert.match(b, /aria-disabled="true"/);
      assert.doesNotMatch(b, /\sdisabled=/, 'a disabled button would ignore the tap');
      assert.match(b, /select-none/);
    }
    for (const label of ['Today', 'Quiz', 'You']) assert.ok(html.includes(`>${label}<`), label);
    assert.match(html, /role="status"/);
  });

  test('with a child, every tab is a link, as before', () => {
    const html = render({ studentId: 's1', active: 'plan' });
    assert.deepEqual(hrefs(html), [
      '/dashboard',
      '/students/s1/plan',
      '/students/s1/today',
      '/students/s1/daily-challenge',
      '/students/s1/settings',
    ]);
    assert.doesNotMatch(html, /<button/);
    assert.doesNotMatch(html, /aria-disabled/);
  });

  test('no message shows until a tap', () => {
    assert.doesNotMatch(render({ studentId: null, noChild: true }), /Add a child first/);
  });
});
