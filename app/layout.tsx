import type { Metadata } from 'next';
import './globals.css';
import { OldBrowserNotice } from '@/components/ui/OldBrowserNotice';

export const metadata: Metadata = {
  title: 'StudyPlan Analyzer',
  description:
    "Turn your child's exam results into a clear study plan until the next exam.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <OldBrowserNotice />
        {children}
      </body>
    </html>
  );
}
