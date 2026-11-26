'use client';

import { useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { WeeklyReportView } from '@/components/reports/WeeklyReportView';
import { api, ApiError, getErrorMessage } from '@/lib/api-client';
import type { WeeklyReportSnapshot } from '@/lib/reports/types';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { StudentHeader } from '@/components/ui/StudentHeader';
import { Notice } from '@/components/ui/Notice';

export default function WeeklyReportPage(props: {
  params: Promise<{ id: string; weekStart: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();
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
      <StudentHeader studentId={params.id} width="narrow" />

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
