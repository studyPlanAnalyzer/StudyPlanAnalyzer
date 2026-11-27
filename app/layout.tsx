import type { Metadata, Viewport } from 'next';
import './globals.css';
import { OldBrowserNotice } from '@/components/ui/OldBrowserNotice';
import { PwaPrompts } from '@/components/pwa/PwaPrompts';
import { CAPTURE_INSTALL_PROMPT, PWA_THEME } from '@/lib/pwa/platform';
import { DevClock } from '@/components/dev/DevClock';
import { cookies } from 'next/headers';
import {
  DEV_CLOCK_COOKIE,
  DEV_CLOCK_ENABLED,
  DEV_CLOCK_MODE,
  installDevClock,
  readDevToday,
} from '@/lib/dev-clock';
import { appDay, toDateString } from '@/lib/utils/date-utils';

export const metadata: Metadata = {
  title: 'StudyPlan Analyzer',
  description:
    "Turn your child's exam results into a clear study plan until the next exam.",
  appleWebApp: {
    capable: true,
    title: 'StudyPlan',
    statusBarStyle: 'default',
  },
  // Next.js writes only the newer mobile-web-app-capable name for `capable`.
  other: { 'apple-mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  themeColor: PWA_THEME,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Development and previews only: the dev clock's fake day (lib/dev-clock.ts),
  // handed to the browser before any app code runs so both sides agree on
  // "today". On a preview it is this browser's cookie.
  if (DEV_CLOCK_ENABLED) installDevClock();
  const devToday =
    DEV_CLOCK_MODE === 'cookie'
      ? readDevToday((await cookies()).get(DEV_CLOCK_COOKIE)?.value ?? null)
      : DEV_CLOCK_ENABLED
        ? readDevToday()
        : null;
  return (
    <html lang="en">
      <head>
        {/* Here, not in metadata.icons: that would replace the favicon tag
            Next.js makes from app/icon.png. */}
        <link rel="apple-touch-icon" href="/icon.png" />
        {DEV_CLOCK_ENABLED && (
          <script
            dangerouslySetInnerHTML={{
              __html: `globalThis.__devToday=${JSON.stringify(devToday)};`,
            }}
          />
        )}
      </head>
      <body className="min-h-screen antialiased">
        <OldBrowserNotice />
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_INSTALL_PROMPT }} />
        <PwaPrompts />
        {children}
        {DEV_CLOCK_ENABLED && (
          <DevClock
            today={devToday ?? toDateString(appDay(new Date()))}
            realToday={toDateString(appDay(new Date()))}
            perBrowser={DEV_CLOCK_MODE === 'cookie'}
          />
        )}
      </body>
    </html>
  );
}
