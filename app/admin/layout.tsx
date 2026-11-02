'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { api, ApiError } from '@/lib/api-client';
import { buttonClass } from '@/components/ui/Button';
import { AppLogo } from '@/components/ui/AppHeader';

interface Me {
  user: { id: string; name: string; isAdmin: boolean };
}

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/payments', label: 'Payments' },
  { href: '/admin/schools', label: 'Schools' },
  { href: '/admin/questions', label: 'Question bank' },
  { href: '/admin/daily-quiz', label: 'Daily quiz' },
  { href: '/admin/analytics', label: 'Analytics' },
  { href: '/admin/reports', label: 'Weekly reports' },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<'loading' | 'ok' | 'denied'>('loading');

  useEffect(() => {
    api
      .get<Me>('/api/auth/me')
      .then((data) => {
        if (data.user.isAdmin) {
          setStatus('ok');
        } else {
          setStatus('denied');
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setStatus('denied');
      });
  }, [router]);

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FAF9F6] text-sm text-[#8A8580]">
        Loading…
      </div>
    );
  }

  if (status === 'denied') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#FAF9F6] px-4 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-black">Admins only</h1>
        <p className="max-w-sm text-sm text-[#65615D]">
          This area is for managing the Daily Brain Challenge question bank and
          isn&apos;t available on your account.
        </p>
        <Link
          href="/dashboard"
          className={buttonClass('secondary', 'md', 'mt-2')}
        >
          Back to dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FAF9F6] text-black">
      <header className="border-b border-black/10 bg-[#FAF9F6]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <Link href="/admin" className="flex items-center gap-3 text-lg font-bold tracking-tight">
            <AppLogo className="h-10 w-10" />
            <span className="sr-only sm:not-sr-only">StudyPlan Analyzer · Admin</span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV_ITEMS.map((item) => {
              const isActive =
                item.href === '/admin'
                  ? pathname === '/admin'
                  : pathname?.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={clsx(
                    'rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-black text-white'
                      : 'text-black/70 hover:bg-[#F0EFED]',
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/dashboard"
              className="ml-1 rounded-full bg-[#F0EFED] px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-[#E7E5E2]"
            >
              Exit admin
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </div>
  );
}
