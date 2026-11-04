// The service worker, as text, so app/sw.js/route.ts can stamp each build's
// version into it.
//
// It stores only public files that are the same for everyone: the offline
// page, the logo and Next.js's content-hashed build files. Nothing a signed-in
// person sees is ever written to a cache: the only cache.put below is behind
// the /_next/static/ check. Anything this worker doesn't call respondWith for
// (every /api/ request, including sign-in and token refresh, and Next.js's
// in-app page data) goes straight to the network as if it weren't installed.
//
// Updating: a new worker installs and then waits. It never takes over by
// itself, so an open page can't lose build files it still needs. It takes over
// once every window has closed, or when a parent taps Refresh in the update bar
// (components/pwa/PwaPrompts.tsx), which sends SKIP_WAITING. Waiting costs
// nothing: pages always come from the network, so people get a new deploy's
// pages on their next load either way.
export const OFFLINE_URL = '/offline.html';
export const CACHE_PREFIX = 'studyplan-';
export const SKIP_WAITING = 'SKIP_WAITING';

export function serviceWorkerScript(version: string): string {
  return `
const CACHE = ${JSON.stringify(CACHE_PREFIX + version)};
const CACHE_PREFIX = ${JSON.stringify(CACHE_PREFIX)};
const OFFLINE_URL = ${JSON.stringify(OFFLINE_URL)};
const ICONS = ['/icon.png', '/logo.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll(
        [OFFLINE_URL, ...ICONS].map(
          (url) => new Request(url, { cache: 'reload', credentials: 'omit' }),
        ),
      ),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === ${JSON.stringify(SKIP_WAITING)}) self.skipWaiting();
});

async function fromCacheOrNetwork(request, store) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (store && response.ok && response.type === 'basic') {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || request.headers.has('authorization')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    // Network only: the response is passed on, never stored. Redirects to
    // /login reach the browser as they do without a worker.
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error()),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(fromCacheOrNetwork(request, true));
  } else if (ICONS.includes(url.pathname)) {
    event.respondWith(fromCacheOrNetwork(request, false));
  }
});
`;
}
