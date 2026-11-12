'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, ApiError, getErrorMessage } from '@/lib/api-client';
import { formatMinutes, formatWeekRange, reportStrings } from '@/lib/reports/strings';
import type { HeadlineKind } from '@/lib/reports/types';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { Notice } from '@/components/ui/Notice';
import { PageTitle } from '@/components/ui/PageTitle';
import { cardClass } from '@/components/ui/Card';

interface ReportListItem {
  weekStart: string;
  weekEnd: string;
  headline: HeadlineKind;
  /** Version 3 reports. */
  topicsDone: number | null;
  /** Version 2 reports. */
  studyMinutes: number | null;
  builtLater: boolean;
  readAt: string | null;
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
    <PageShell className="pb-24 sm:pb-8">
      <AppHeader width="narrow">
        <BackLink href="/dashboard" label="Back to dashboard" short="Back" />
      </AppHeader>

      <PageMain width="narrow">
        {!data && !error && (
          <div className="space-y-5">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}
        {error && (
          <Notice className="mb-6">{error}</Notice>
        )}
        {data && (
          <>
            <PageTitle size="text-3xl sm:text-4xl">{s.view.allReports}</PageTitle>
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
                      className={`${cardClass} block p-5 transition hover:shadow-[0_12px_30px_rgba(0,0,0,0.10)]`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-[#8A8580]">
                          {formatWeekRange(r.weekStart, r.weekEnd)}
                        </span>
                        {!r.readAt && (
                          <span className="rounded-full bg-[#EEF0FF] px-3 py-1 text-sm font-semibold text-black">
                            {s.view.newBadge}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 font-semibold leading-6">{s.headline(r.headline, data.student.name)}</p>
                      <p className="mt-1 text-sm text-[#65615D]">
                        {r.topicsDone !== null
                          ? `${s.label.topicsDone}: ${r.topicsDone}`
                          : `${s.label.studyTime}: ${formatMinutes(r.studyMinutes ?? 0)}`}
                        {r.builtLater && <span className="text-[#8A8580]"> · {s.view.builtLaterShort}</span>}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </PageMain>
    </PageShell>
  );
}
