import type { Metadata, Viewport } from 'next';
import './globals.css';
import { OldBrowserNotice } from '@/components/ui/OldBrowserNotice';
import { PwaPrompts } from '@/components/pwa/PwaPrompts';
import { CAPTURE_INSTALL_PROMPT, PWA_THEME } from '@/lib/pwa/platform';

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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Here, not in metadata.icons: that would replace the favicon tag
            Next.js makes from app/icon.png. */}
        <link rel="apple-touch-icon" href="/icon.png" />
      </head>
      <body className="min-h-screen antialiased">
        <OldBrowserNotice />
        <script dangerouslySetInnerHTML={{ __html: CAPTURE_INSTALL_PROMPT }} />
        <PwaPrompts />
        {children}
      </body>
    </html>
  );
}
