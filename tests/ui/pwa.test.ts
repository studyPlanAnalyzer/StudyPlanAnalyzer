import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';

import manifest from '@/app/manifest';
import { proxy } from '@/proxy';
import { CAPTURE_INSTALL_PROMPT, isIosSafari, PWA_THEME } from '@/lib/pwa/platform';
import { serviceWorkerScript, OFFLINE_URL } from '@/lib/pwa/service-worker';

const ORIGIN = 'https://app.test';

/** Runs the worker's script against fakes, recording what it does. */
function loadWorker(cached: Record<string, string> = {}, online = true) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const puts: string[] = [];
  const deleted: string[] = [];
  const store = {
    put: async (r: { url: string }) => {
      puts.push(r.url);
    },
    addAll: async () => {},
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      handlers[type] = fn;
    },
    clients: { claim: async () => {} },
    skipWaiting: () => {},
  };
  const caches = {
    open: async () => store,
    match: async (r: string | { url: string }) => {
      const key = typeof r === 'string' ? r : new URL(r.url).pathname;
      return cached[key] ? new Response(cached[key]) : undefined;
    },
    keys: async () => ['studyplan-old', 'studyplan-v2', 'someone-elses'],
    delete: async (key: string) => {
      deleted.push(key);
      return true;
    },
  };
  const fetchFake = async () => {
    if (!online) throw new TypeError('Failed to fetch');
    return {
      ok: true,
      type: 'basic',
      text: async () => 'from network',
      clone() {
        return this;
      },
    };
  };
  new Function('self', 'caches', 'fetch', serviceWorkerScript('v2'))(
    self,
    caches,
    fetchFake,
  );

  /** What the worker answers with, or null if it left the request alone. */
  async function dispatch(
    path: string,
    { method = 'GET', mode = 'cors', auth = false, origin = ORIGIN } = {},
  ) {
    const answers: Promise<Response>[] = [];
    handlers.fetch({
      request: {
        url: origin + path,
        method,
        mode,
        headers: new Headers(auth ? { authorization: 'Bearer x' } : {}),
        clone() {
          return this;
        },
      },
      respondWith: (r: Promise<Response>) => {
        answers.push(r);
      },
    });
    return answers[0] ?? null;
  }
  return { handlers, puts, deleted, dispatch };
}

describe('service worker', () => {
  test('leaves API, cross-origin, write and Authorization requests alone', async () => {
    const w = loadWorker();
    for (const path of ['/api/auth/refresh', '/api/auth/me', '/api/students']) {
      assert.equal(await w.dispatch(path), null, path);
      assert.equal(await w.dispatch(path, { mode: 'navigate' }), null, path);
    }
    assert.equal(await w.dispatch('/dashboard', { mode: 'navigate', method: 'POST' }), null);
    assert.equal(await w.dispatch('/_next/static/a.js', { auth: true }), null);
    assert.equal(await w.dispatch('/gsi/client', { origin: 'https://accounts.google.com' }), null);
  });

  test("leaves Next.js's in-app page data and other public files alone", async () => {
    const w = loadWorker();
    assert.equal(await w.dispatch('/dashboard?_rsc=abc'), null);
    assert.equal(await w.dispatch('/login?_rsc=abc'), null);
    assert.equal(await w.dispatch('/payment-qr.png'), null);
  });

  test('pages come from the network and are never stored', async () => {
    const w = loadWorker();
    for (const path of ['/dashboard', '/login', '/students/1/today', '/account']) {
      const res = await (await w.dispatch(path, { mode: 'navigate' }))!;
      assert.equal(await res.text(), 'from network');
    }
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(w.puts, []);
  });

  test('a page that cannot be reached shows the offline page', async () => {
    const w = loadWorker({ [OFFLINE_URL]: 'offline page' }, false);
    const res = await (await w.dispatch('/dashboard', { mode: 'navigate' }))!;
    assert.equal(await res.text(), 'offline page');
  });

  test('stores only build files, and serves them from the cache after that', async () => {
    const w = loadWorker({ '/_next/static/old.js': 'cached' });
    const hit = await (await w.dispatch('/_next/static/old.js'))!;
    assert.equal(await hit.text(), 'cached');
    await (await w.dispatch('/_next/static/new.js'))!;
    await (await w.dispatch('/logo.png'))!;
    await new Promise((r) => setImmediate(r));
    assert.deepEqual(w.puts, [`${ORIGIN}/_next/static/new.js`]);
  });

  test('activating deletes older versions of its own cache only', async () => {
    const w = loadWorker();
    let done: Promise<unknown> = Promise.resolve();
    w.handlers.activate({ waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
    assert.deepEqual(w.deleted, ['studyplan-old']);
  });

  test('never takes over by itself: skipWaiting only follows a message', () => {
    const script = serviceWorkerScript('v2');
    assert.equal(script.match(/skipWaiting\(\)/g)?.length, 1);
    assert.match(script, /event\.data === "SKIP_WAITING"\) self\.skipWaiting\(\)/);
  });
});

describe('manifest', () => {
  test('is installable, standalone, and opens on the signed-in home', () => {
    const m = manifest();
    assert.equal(m.name, 'StudyPlan Analyzer');
    assert.equal(m.short_name, 'StudyPlan');
    assert.equal(m.start_url, '/dashboard');
    assert.equal(m.scope, '/');
    assert.equal(m.display, 'standalone');
  });

  test('the phone bars and splash use the cream page colour', () => {
    const m = manifest();
    assert.equal(m.theme_color, '#FAF9F6');
    assert.equal(m.background_color, '#FAF9F6');
    assert.equal(PWA_THEME, '#FAF9F6');
  });

  test('every icon is a real file', () => {
    for (const { src } of manifest().icons ?? []) {
      assert.ok(
        existsSync(`public${src}`) || existsSync(`app${src}`),
        `${src} does not exist`,
      );
    }
  });
});

describe('proxy and PWA files', () => {
  const signedOut = (path: string) => proxy(new NextRequest(`${ORIGIN}${path}`));

  test('lets signed-out requests for the PWA files through', () => {
    for (const path of ['/manifest.webmanifest', '/sw.js', OFFLINE_URL, '/icon.png', '/logo.png']) {
      assert.equal(signedOut(path).headers.get('x-middleware-next'), '1', path);
    }
  });

  test('still sends a signed-out visitor from the start page to /login', () => {
    const res = signedOut('/dashboard');
    assert.equal(res.status, 307);
    assert.equal(res.headers.get('location'), `${ORIGIN}/login?next=%2Fdashboard`);
  });
});

describe('content security policy', () => {
  test('allows the worker and manifest, and keeps every other rule', async () => {
    const config = require('../../next.config.js');
    const [{ headers }] = await config.headers();
    const csp: string = headers.find(
      (h: { key: string }) => h.key === 'Content-Security-Policy',
    ).value;
    for (const rule of [
      "worker-src 'self'",
      "manifest-src 'self'",
      "default-src 'self'",
      'script-src \'self\' \'unsafe-inline\'',
      'https://accounts.google.com/gsi/client',
      "connect-src 'self' https://accounts.google.com/gsi/",
      'frame-src https://accounts.google.com/gsi/',
      "frame-ancestors 'none'",
      "form-action 'self'",
      "object-src 'none'",
    ]) {
      assert.ok(csp.includes(rule), rule);
    }
  });
});

describe('install hints', () => {
  const SAFARI =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';

  test('recognises Safari on iPhone and iPad only', () => {
    assert.equal(isIosSafari(SAFARI, 'iPhone', 5), true);
    const ipad = SAFARI.replace('iPhone; CPU iPhone OS 17_5 like Mac OS X', 'Macintosh; Intel Mac OS X 10_15_7');
    assert.equal(isIosSafari(ipad, 'MacIntel', 5), true);
    assert.equal(isIosSafari(ipad, 'MacIntel', 0), false, 'desktop Safari');
  });

  test('not other iPhone browsers, or apps with a built-in browser', () => {
    const chrome = SAFARI.replace('Version/17.5', 'CriOS/126.0');
    assert.equal(isIosSafari(chrome, 'iPhone', 5), false);
    const fbApp = SAFARI.replace(' Version/17.5', '').replace(' Safari/604.1', ' [FBAN/FBIOS]');
    assert.equal(isIosSafari(fbApp, 'iPhone', 5), false);
    const android = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';
    assert.equal(isIosSafari(android, 'Linux armv8l', 5), false);
  });

  test('the early install-prompt script is old-style JavaScript that runs everywhere', () => {
    assert.doesNotMatch(CAPTURE_INSTALL_PROMPT, /=>|\bconst\b|\blet\b|\bclass\b|`/);
  });
});

test('the offline page stands alone: only the logo, no build files', () => {
  const html = readFileSync(`public${OFFLINE_URL}`, 'utf8');
  assert.doesNotMatch(html, /_next|<script/);
  assert.equal(html.match(/src="[^"]+"/g)?.join(), 'src="/logo.png"');
});
