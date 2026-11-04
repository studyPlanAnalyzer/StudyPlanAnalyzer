import { serviceWorkerScript } from '@/lib/pwa/service-worker';

// A browser installs a new service worker only when this file's bytes change,
// so it carries the build's version (next.config.js), and every deploy reaches
// installed apps. no-cache: always checked against the server, never assumed
// fresh, which is why this is rendered per request and not prerendered.
export const dynamic = 'force-dynamic';

export function GET() {
  return new Response(serviceWorkerScript(process.env.SW_BUILD_VERSION ?? 'dev'), {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}
