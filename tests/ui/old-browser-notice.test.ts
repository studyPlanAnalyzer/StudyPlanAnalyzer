import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  BROWSER_PROBE,
  OldBrowserNotice,
  SHOW_NOTICE,
} from '@/components/ui/OldBrowserNotice';

describe('old browser notice', () => {
  test('starts hidden, with the probe before the script that reveals it', () => {
    const html = renderToStaticMarkup(createElement(OldBrowserNotice));
    assert.match(html, /<div id="old-browser-notice"[^>]*hidden/);
    assert.match(html, /iOS 16\.4 or newer/);
    const notice = html.indexOf('old-browser-notice');
    const probe = html.indexOf(BROWSER_PROBE);
    const show = html.indexOf(SHOW_NOTICE.slice(0, 20));
    assert.ok(notice < probe && probe < show);
  });

  test('the probe uses the syntax that needs Safari 16.4, and sets the flag', () => {
    assert.match(BROWSER_PROBE, /static\s*\{/);
    const w = {} as { __browserOk?: boolean };
    new Function('window', BROWSER_PROBE)(w);
    assert.equal(w.__browserOk, true);
  });

  test('the reveal script is old-style JavaScript that runs everywhere', () => {
    assert.doesNotMatch(SHOW_NOTICE, /=>|\bconst\b|\blet\b|\bclass\b|`/);
  });
});
