import Link from 'next/link';

type Tab = 'home' | 'plan' | 'today' | 'quiz' | 'you';

const item = 'flex flex-col items-center gap-1 py-3';

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

function Disabled({ icon, label }: { icon: string; label: string }) {
  return (
    <div className={`${item} text-black/20`}>
      <span className="text-xl">{icon}</span>
      <span className="text-[10px]">{label}</span>
    </div>
  );
}

/**
 * The phone navigation bar at the bottom of the dashboard and every child's
 * pages. Without a child yet, only Home and Create work.
 */
export function StudentBottomNav({
  studentId,
  active,
}: {
  studentId: string | null;
  active?: Tab;
}) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
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
            <Disabled icon="ϟ" label="Today" />
            <Disabled icon="◧" label="Quiz" />
            <Disabled icon="●" label="You" />
          </>
        )}
      </div>
    </nav>
  );
}
