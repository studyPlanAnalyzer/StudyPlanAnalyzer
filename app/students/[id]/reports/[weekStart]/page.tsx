'use client';

import { useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { WeeklyReportView } from '@/components/reports/WeeklyReportView';
import { api, ApiError, getErrorMessage } from '@/lib/api-client';
import { reportStrings } from '@/lib/reports/strings';
import type { WeeklyReportSnapshot } from '@/lib/reports/types';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { Notice } from '@/components/ui/Notice';

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
    <PageShell className="pb-24 sm:pb-8">
      <AppHeader width="narrow">
        <BackLink href={`/students/${params.id}/reports`} label={s.view.allReports} short="Back" />
      </AppHeader>

      <PageMain width="narrow">
        {!report && !error && (
          <div className="space-y-5">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}
        {error && (
          <Notice className="mb-6">{error}</Notice>
        )}
        {report && <WeeklyReportView report={report} />}
      </PageMain>
    </PageShell>
  );
}
