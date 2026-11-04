'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Notice } from './Notice';

type Tab = 'home' | 'plan' | 'today' | 'quiz' | 'you';

/** The wording a parent with no child sees. Change it here. */
export const NO_CHILD_TAB_MESSAGE = 'Add a child first to use this';
export const NO_CHILD_HELPER = 'Add a child to unlock Today, Quiz and your progress.';

const MESSAGE_SECONDS = 4;

// select-none: long-pressing or tapping a tab never selects its text.
const item = 'flex select-none flex-col items-center gap-1 py-3';

function NavLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href} className={`${item} ${active ? 'text-black' : 'text-black/35'}`}>
      <span className="text-xl">{icon}</span>
      <span className={`text-[10px] ${active ? 'font-bold' : 'font-medium'}`}>{label}</span>
    </Link>
  );
}

// A real button, not text, so a tap is never read as text to search for
// (Chrome on Android offers "Tap to see search results" on plain text).
// aria-disabled, not disabled: a disabled button ignores taps, and a tap has to
// say why nothing happened. The label is dark enough to read (4.5:1 on white);
// the icon stays pale, which is what makes the tab look unavailable.
function Disabled({
  icon,
  label,
  onTap,
}: {
  icon: string;
  label: string;
  onTap: () => void;
}) {
  return (
    <button type="button" aria-disabled="true" onClick={onTap} className={`${item} w-full`}>
      <span className="text-xl text-black/20">{icon}</span>
      <span className="text-[10px] text-black/55">{label}</span>
    </button>
  );
}

/**
 * The phone navigation bar at the bottom of the dashboard and every child's
 * pages. Without a child yet, only Home and Create work. `studentId` is also
 * null while the dashboard is loading or if loading failed, so `noChild` says
 * the parent really has none: only then does a tap explain itself.
 */
export function StudentBottomNav({
  studentId,
  active,
  noChild = false,
}: {
  studentId: string | null;
  active?: Tab;
  noChild?: boolean;
}) {
  // Counts taps, so a second tap restarts the timer.
  const [taps, setTaps] = useState(0);
  const [message, setMessage] = useState(false);

  useEffect(() => {
    if (taps === 0) return;
    setMessage(true);
    const timer = setTimeout(() => setMessage(false), MESSAGE_SECONDS * 1000);
    return () => clearTimeout(timer);
  }, [taps]);

  const tapDisabled = () => {
    if (noChild) setTaps((t) => t + 1);
  };

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
      {/* Always in the page, so screen readers announce the message. */}
      <div role="status" className="pointer-events-none absolute inset-x-4 bottom-full mb-3 flex justify-center">
        {message && noChild && (
          <Notice tone="warning" className="font-medium shadow-2xl">
            {NO_CHILD_TAB_MESSAGE}
          </Notice>
        )}
      </div>

      <div className="mx-auto grid max-w-lg grid-cols-5">
        <NavLink href="/dashboard" icon="▦" label="Home" active={active === 'home'} />

        {studentId ? (
          <>
            <NavLink href={`/students/${studentId}/plan`} icon="＋" label="Plan" active={active === 'plan'} />
            <NavLink href={`/students/${studentId}/today`} icon="ϟ" label="Today" active={active === 'today'} />
            <NavLink href={`/students/${studentId}/daily-challenge`} icon="◧" label="Quiz" active={active === 'quiz'} />
            <NavLink href={`/students/${studentId}/settings`} icon="●" label="You" active={active === 'you'} />
          </>
        ) : (
          <>
            <NavLink href="/onboarding" icon="＋" label="Create" active={false} />
            <Disabled icon="ϟ" label="Today" onTap={tapDisabled} />
            <Disabled icon="◧" label="Quiz" onTap={tapDisabled} />
            <Disabled icon="●" label="You" onTap={tapDisabled} />
          </>
        )}
      </div>
    </nav>
  );
}
