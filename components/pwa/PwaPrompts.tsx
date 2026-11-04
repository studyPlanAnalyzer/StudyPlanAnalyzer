'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { INSTALL_DISMISSED_KEY, isIosSafari } from '@/lib/pwa/platform';
import { SKIP_WAITING } from '@/lib/pwa/service-worker';

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<unknown>;
}
declare global {
  interface Window {
    __installPrompt?: InstallPromptEvent;
  }
}

function dismissedBefore(): boolean {
  try {
    return localStorage.getItem(INSTALL_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    localStorage.setItem(INSTALL_DISMISSED_KEY, '1');
  } catch {
    // Private mode: it comes back next visit, which is harmless.
  }
}

function Bar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-2 bg-[#FCE9B9] px-5 py-2.5 text-sm font-medium text-black">
      {children}
    </div>
  );
}

/**
 * Registers the service worker and shows one slim bar at the very top of the
 * page when there is something to offer: an update, the Android install button
 * or the iPhone hint. Nothing shows on a child's pages (/students/...), so a
 * bar can't interrupt a study session, and nothing ever reloads a page until a
 * parent taps Refresh.
 */
export function PwaPrompts() {
  const pathname = usePathname();
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const [iosHint, setIosHint] = useState(false);
  const refreshRequested = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const sw = navigator.serviceWorker;

    // A worker left behind by trying a production build on this machine would
    // keep serving old files to `next dev`.
    if (process.env.NODE_ENV !== 'production') {
      sw.getRegistrations().then((all) => all.forEach((r) => r.unregister()));
      return;
    }

    const onControllerChange = () => {
      if (refreshRequested.current) window.location.reload();
    };
    sw.addEventListener('controllerchange', onControllerChange);

    // With no current controller this is the first install, not an update.
    const watch = (worker: ServiceWorker | null) => {
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && sw.controller) setWaiting(worker);
      });
    };

    let registration: ServiceWorkerRegistration | undefined;
    sw.register('/sw.js', { updateViaCache: 'none' })
      .then((reg) => {
        registration = reg;
        if (reg.waiting && sw.controller) setWaiting(reg.waiting);
        watch(reg.installing);
        reg.addEventListener('updatefound', () => watch(reg.installing));
      })
      .catch(() => {
        // The app works the same without it, just with no offline page.
      });

    // An installed app is often resumed for days without a page load.
    const onVisible = () => {
      if (document.visibilityState === 'visible') registration?.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      sw.removeEventListener('controllerchange', onControllerChange);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  useEffect(() => {
    const installed =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as { standalone?: boolean }).standalone === true;
    if (installed || dismissedBefore()) return;

    const onReady = () => setInstallEvent(window.__installPrompt ?? null);
    const onInstalled = () => setInstallEvent(null);
    onReady();
    window.addEventListener('installpromptready', onReady);
    window.addEventListener('appinstalled', onInstalled);
    setIosHint(isIosSafari(navigator.userAgent, navigator.platform, navigator.maxTouchPoints));

    return () => {
      window.removeEventListener('installpromptready', onReady);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    rememberDismissed();
    setInstallEvent(null);
    setIosHint(false);
  };

  const install = async () => {
    const event = installEvent;
    if (!event) return;
    setInstallEvent(null); // Each event can only be used once.
    window.__installPrompt = undefined;
    await event.prompt();
    await event.userChoice;
  };

  if (pathname.startsWith('/students/')) return null;

  if (waiting)
    return (
      <Bar>
        <span>A new version of StudyPlan is ready.</span>
        <Button
          size="sm"
          onClick={() => {
            refreshRequested.current = true;
            waiting.postMessage(SKIP_WAITING);
          }}
        >
          Refresh
        </Button>
      </Bar>
    );

  if (installEvent)
    return (
      <Bar>
        <Button size="sm" onClick={install}>
          Install app
        </Button>
        <Button size="sm" variant="ghost" onClick={dismiss}>
          Not now
        </Button>
      </Bar>
    );

  if (iosHint)
    return (
      <Bar>
        <span>Tap Share, then Add to Home Screen</span>
        <Button size="sm" variant="ghost" onClick={dismiss} aria-label="Dismiss hint">
          Got it
        </Button>
      </Bar>
    );

  return null;
}
