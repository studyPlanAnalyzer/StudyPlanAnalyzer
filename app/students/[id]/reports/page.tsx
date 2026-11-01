'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, ApiError, getErrorMessage } from '@/lib/api-client';
import { formatMinutes, formatWeekRange, reportStrings } from '@/lib/reports/strings';
import type { HeadlineKind } from '@/lib/reports/types';

interface ReportListItem {
  weekStart: string;
  weekEnd: string;
  headline: HeadlineKind;
  studyMinutes: number;
  builtLater: boolean;
  readAt: string | null;
}

function ArrowLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ReportsPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const s = reportStrings('en');
  const [data, setData] = useState<{ student: { id: string; name: string }; reports: ReportListItem[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Make any report that has become due, then read the list.
    api
      .post(`/api/students/${params.id}/reports/refresh`)
      .then(() =>
        api.get<{ student: { id: string; name: string }; reports: ReportListItem[] }>(
          `/api/students/${params.id}/reports`,
        ),
      )
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError(getErrorMessage(err));
      });
  }, [params.id, router]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FAF9F6] pb-24 text-black sm:pb-8">
      <header className="relative z-30 bg-[#FAF9F6]">
        <div className="mx-auto flex max-w-[900px] items-center justify-between gap-6 px-5 py-5 sm:px-7">
          <Link href="/dashboard" className="flex shrink-0 items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-xl font-bold text-white sm:h-14 sm:w-14 sm:text-2xl">
              S
            </div>
            <span className="text-xl font-bold tracking-tight sm:text-2xl">StudyPlan Analyzer</span>
          </Link>
          <Link
            href="/dashboard"
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#F0EFED] px-5 text-sm font-semibold transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:px-6 sm:text-base"
          >
            <ArrowLeftIcon />
            <span>
              Back<span className="hidden sm:inline"> to dashboard</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[900px] px-5 pt-5 sm:px-7 sm:pt-8">
        {!data && !error && (
          <div className="space-y-5">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {data && (
          <>
            <h1 className="text-3xl font-extrabold leading-tight tracking-[-0.045em] sm:text-4xl">
              {s.view.allReports}
            </h1>
            <p className="mt-2 text-sm text-[#65615D] sm:text-base">{data.student.name}</p>
            {data.reports.length === 0 ? (
              <div className="mt-6">
                <EmptyState title={s.view.noReports} description={s.view.noReportsBody} />
              </div>
            ) : (
              <ul className="mt-6 space-y-3">
                {data.reports.map((r) => (
                  <li key={r.weekStart}>
                    <Link
                      href={`/students/${params.id}/reports/${r.weekStart}`}
                      className="block rounded-[24px] bg-white p-5 shadow-[0_8px_24px_rgba(0,0,0,0.05)] transition hover:shadow-[0_10px_28px_rgba(0,0,0,0.09)]"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-[#8A8580]">
                          {formatWeekRange(r.weekStart, r.weekEnd)}
                        </span>
                        {!r.readAt && (
                          <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-semibold text-indigo-700">
                            {s.view.newBadge}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-semibold leading-6">{s.headline(r.headline, data.student.name)}</p>
                      <p className="mt-1 text-sm text-[#65615D]">
                        {s.label.studyTime}: {formatMinutes(r.studyMinutes)}
                        {r.builtLater && <span className="text-[#8A8580]"> · {s.view.builtLaterShort}</span>}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </main>
    </div>
  );
}
