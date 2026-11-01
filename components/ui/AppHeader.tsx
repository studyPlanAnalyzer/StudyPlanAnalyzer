'use client';

import { useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';

import { ArrowLeftIcon, CloseIcon, MenuIcon } from './icons';

const CONTAINER = {
  wide: 'max-w-[1400px] px-5 sm:px-7 lg:px-0',
  narrow: 'max-w-[900px] px-5 sm:px-7',
};

// With a menu, `children` show from the breakpoint up and a hamburger below it.
const BREAKPOINT = {
  sm: { desktop: 'hidden sm:flex', mobile: 'sm:hidden' },
  lg: { desktop: 'hidden lg:flex', mobile: 'lg:hidden' },
  xl: { desktop: 'hidden xl:flex', mobile: 'xl:hidden' },
};

/** The dashboard's grey header pill (Log out, Back to …). */
export const headerPillClass =
  'flex h-12 items-center justify-center gap-2 rounded-full bg-[#F0EFED] px-5 text-sm font-semibold transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:px-6 sm:text-base';

/** A plain header link, like the dashboard's Admin link. */
export const headerLinkClass =
  'whitespace-nowrap rounded-full px-4 py-3 text-sm font-semibold transition hover:bg-black/5';

export interface MenuItem {
  href: string;
  label: string;
}

/**
 * The header every signed-in page shares: the brand on the left and the
 * page's actions on the right. Pass `menu` to fold the actions into a
 * hamburger below a breakpoint.
 */
export function AppHeader({
  width = 'wide',
  brandHref = '/dashboard',
  children,
  menu,
}: {
  width?: keyof typeof CONTAINER;
  brandHref?: string;
  children?: React.ReactNode;
  menu?: { items: MenuItem[]; breakpoint: keyof typeof BREAKPOINT };
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const bp = menu ? BREAKPOINT[menu.breakpoint] : null;

  return (
    <header className="relative z-30 bg-[#FAF9F6]">
      <div className={clsx('mx-auto flex items-center justify-between py-5', CONTAINER[width])}>
        <Link href={brandHref} className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-xl font-bold text-white sm:h-14 sm:w-14 sm:text-2xl">
            S
          </div>

          <span className="text-xl font-bold tracking-tight sm:text-2xl">
            StudyPlan Analyzer
          </span>
        </Link>

        {children && (
          <div className={clsx('items-center gap-2.5', bp ? bp.desktop : 'flex')}>
            {children}
          </div>
        )}

        {menu && bp && (
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className={clsx(
              'flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F0EFED] text-black transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:w-14',
              bp.mobile,
            )}
          >
            {menuOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        )}
      </div>

      {menu && bp && menuOpen && (
        <nav
          className={clsx(
            'absolute left-0 right-0 top-full mx-5 flex flex-col gap-1 rounded-[26px] bg-white p-3 shadow-2xl sm:mx-7',
            bp.mobile,
          )}
        >
          {menu.items.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="rounded-2xl px-4 py-3 text-sm font-semibold transition hover:bg-black/5 sm:text-base"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

/**
 * "← Back to …" header pill. `short` replaces the label on phones, so the
 * pill stays small next to the brand.
 */
export function BackLink({
  href,
  label,
  short,
  className,
}: {
  href: string;
  label: string;
  short?: string;
  className?: string;
}) {
  return (
    <Link href={href} className={clsx(headerPillClass, className)}>
      <ArrowLeftIcon />
      {short ? (
        <span>
          <span className="sm:hidden">{short}</span>
          <span className="hidden sm:inline">{label}</span>
        </span>
      ) : (
        <span>{label}</span>
      )}
    </Link>
  );
}
