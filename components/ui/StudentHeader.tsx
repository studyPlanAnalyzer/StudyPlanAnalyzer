'use client';

import { AppHeader } from './AppHeader';

/** Every page about one child, in menu order. */
export const STUDENT_PAGES = [
  { key: 'today', path: 'today', label: 'Today' },
  { key: 'plan', path: 'plan', label: 'Plan' },
  { key: 'revise', path: 'revise', label: 'Revise earlier topics' },
  { key: 'subjects', path: 'subjects', label: 'Subjects & topics' },
  { key: 'add-test-marks', path: 'add-test-marks', label: 'Log a test' },
  { key: 'tests', path: 'tests', label: 'Test history' },
  { key: 'analysis', path: 'analysis', label: 'Analysis' },
  { key: 'reports', path: 'reports', label: 'Reports' },
  { key: 'daily-challenge', path: 'daily-challenge', label: 'Daily Challenge' },
  { key: 'settings', path: 'settings', label: 'Settings' },
  { key: 'new-exam', path: 'new-exam', label: 'New exam cycle' },
] as const;

export type StudentPage = (typeof STUDENT_PAGES)[number]['key'];

/** The menu for a child's page: the dashboard, then every other page of theirs. */
export function studentMenuItems(studentId: string, current?: StudentPage) {
  return [
    { href: '/dashboard', label: 'All children' },
    ...STUDENT_PAGES.filter((p) => p.key !== current).map((p) => ({
      href: `/students/${studentId}/${p.path}`,
      label: p.label,
    })),
  ];
}

/**
 * The header for every page about one child: the brand, and a menu with
 * every other page of that child's, so any page is one tap away (adding a
 * topic taught today from Today, for example).
 */
export function StudentHeader({
  studentId,
  current,
  width,
}: {
  studentId: string;
  current?: StudentPage;
  width?: 'wide' | 'narrow';
}) {
  return (
    <AppHeader width={width} menu={{ items: studentMenuItems(studentId, current), breakpoint: 'always' }} />
  );
}
