'use client';

import { useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { WeeklyReportView } from '@/components/reports/WeeklyReportView';
import { api, ApiError, getErrorMessage } from '@/lib/api-client';
import { reportStrings } from '@/lib/reports/strings';
import type { WeeklyReportSnapshot } from '@/lib/reports/types';

function ArrowLeftIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function WeeklyReportPage(props: {
  params: Promise<{ id: string; weekStart: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();
  const s = reportStrings('en');
  const [report, setReport] = useState<WeeklyReportSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const markedRead = useRef(false);

  useEffect(() => {
    // Make any report that has become due, then read this one.
    api
      .post(`/api/students/${params.id}/reports/refresh`)
      .then(() =>
        api.get<{ report: WeeklyReportSnapshot; readAt: string | null }>(
          `/api/students/${params.id}/reports/${params.weekStart}`,
        ),
      )
      .then((d) => {
        setReport(d.report);
        // Opening the report clears the dashboard notice (once).
        if (!d.readAt && !markedRead.current) {
          markedRead.current = true;
          api.post(`/api/students/${params.id}/reports/${params.weekStart}/read`).catch(() => {});
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError(getErrorMessage(err));
      });
  }, [params.id, params.weekStart, router]);

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
            href={`/students/${params.id}/reports`}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#F0EFED] px-5 text-sm font-semibold transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:px-6 sm:text-base"
          >
            <ArrowLeftIcon />
            <span>
              <span className="sm:hidden">Back</span>
              <span className="hidden sm:inline">{s.view.allReports}</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[900px] px-5 pt-5 sm:px-7 sm:pt-8">
        {!report && !error && (
          <div className="space-y-5">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {report && <WeeklyReportView report={report} />}
      </main>
    </div>
  );
}
