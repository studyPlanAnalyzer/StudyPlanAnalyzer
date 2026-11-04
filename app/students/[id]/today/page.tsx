'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SkeletonCard } from '@/components/ui/Skeleton';
import {
  requiredProgress,
  SessionCard,
  SessionItem,
} from '@/components/session/SessionCard';
import { api, ApiError } from '@/lib/api-client';
import { formatDay, todayKey } from '@/lib/utils/date-utils';
import { DailyTodoPanel } from '@/components/todo/DailyTodoPanel';
import { ExamOverNotice } from '@/components/exam/ExamOverNotice';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { Notice } from '@/components/ui/Notice';
import { PageTitle } from '@/components/ui/PageTitle';
import { EmptyState, emptyStateActionClass } from '@/components/ui/EmptyState';
import { buttonClass } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { StudentBottomNav } from '@/components/ui/StudentBottomNav';

interface StudentDetail {
  latestPlan: { id: string } | null;
  exams: { id: string; name: string; examDate: string }[];
  currentExamId: string | null;
  currentExamOver: boolean;
}

interface PlanResponse {
  weeks: { days: { date: string; sessions: SessionItem[] }[] }[];
}

export default function TodayPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [planId, setPlanId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planUpdated, setPlanUpdated] = useState(false);
  // Set when there is no plan because the exam is over.
  const [overExam, setOverExam] = useState<{
    name: string;
    examDate: string;
  } | null>(null);

  const showToday = useCallback((plan: PlanResponse) => {
    const today = todayKey();
    const todaysSessions =
      plan.weeks.flatMap((w) => w.days).find((d) => d.date === today)
        ?.sessions ?? [];
    setSessions(todaysSessions);
  }, []);

  const loadSessions = useCallback(
    async (pid: string) => {
      showToday(await api.get<PlanResponse>(`/api/plans/${pid}`));
    },
    [showToday],
  );

  useEffect(() => {
    async function load() {
      try {
        const detail = await api.get<StudentDetail>(
          `/api/students/${params.id}`,
        );
        if (!detail.latestPlan) {
          const exam = detail.exams.find((e) => e.id === detail.currentExamId);
          if (detail.currentExamOver && exam) setOverExam(exam);
          setSessions([]);
          return;
        }
        setPlanId(detail.latestPlan.id);
        // Days that were left unfinished are treated as missed and the plan is
        // rebuilt from today. A failure here shouldn't block the page. The
        // plan is fetched at the same time as the check, and fetched again
        // only if the check actually rebuilt it, so what is shown is the same
        // as before but the usual case takes one round trip less.
        const pid = detail.latestPlan.id;
        const [catchUp, first] = await Promise.all([
          api
            .post<{ updated?: boolean }>(`/api/plans/${pid}/catch-up`)
            .catch(() => undefined),
          api.get<PlanResponse>(`/api/plans/${pid}`),
        ]);
        showToday(
          catchUp?.updated
            ? await api.get<PlanResponse>(`/api/plans/${pid}`)
            : first,
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError("Couldn't load today's sessions. Please try refreshing.");
      }
    }
    load();
  }, [params.id, router, showToday]);

  async function handleComplete(sessionId: string, rating?: number) {
    try {
      const res = (await api.put(`/api/sessions/${sessionId}`, {
        status: 'completed',
        rating,
      })) as unknown as { planUpdated?: boolean } | undefined;
      if (res?.planUpdated) setPlanUpdated(true);
      if (planId) await loadSessions(planId);
    } catch {
      setError("Couldn't save that session. Please try again.");
    }
  }

  async function handleSkip(sessionId: string) {
    try {
      const res = (await api.put(`/api/sessions/${sessionId}`, {
        status: 'skipped',
      })) as unknown as { planUpdated?: boolean } | undefined;
      if (res?.planUpdated) setPlanUpdated(true);
      if (planId) await loadSessions(planId);
    } catch {
      setError("Couldn't skip that session. Please try again.");
    }
  }

  const progress = requiredProgress(sessions ?? []);

  // Shown in the phone/tablet hamburger menu. Laptops keep "Back to full plan".
  const menuItems = [
    { href: `/students/${params.id}/plan`, label: 'Back to full plan' },
    { href: `/students/${params.id}/analysis`, label: 'Analysis' },
    {
      href: `/students/${params.id}/daily-challenge`,
      label: 'Daily Challenge',
    },
    { href: `/students/${params.id}/add-test-marks`, label: 'Log a test' },
  ];

  return (
    <PageShell withBottomNav>
      <AppHeader menu={{ items: menuItems, breakpoint: 'lg' }}>
        <BackLink href={`/students/${params.id}/plan`} label="Back to full plan" />
      </AppHeader>

      <PageMain>
        {/* HERO SECTION */}
        <section className="mb-8 sm:mb-10">
          <PageTitle>
            Today&apos;s sessions.
          </PageTitle>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
            {formatDay(
              todayKey(),
              { weekday: 'long', month: 'long', day: 'numeric' },
              'en-US',
            )}
          </p>
        </section>

        {/* ERROR MESSAGE */}
        {error && (
          <Notice className="mb-6">
            {error}
          </Notice>
        )}

        {/* PLAN UPDATED NOTICE */}
        {planUpdated && (
          <Notice tone="neutral" className="mb-6">
            <p className="text-sm font-semibold leading-6 text-black sm:text-base">
              That&apos;s today done. The days ahead were updated based on how
              today went.
            </p>

            <Link
              href={`/students/${params.id}/plan`}
              className={buttonClass('primary', 'lg', 'mt-3')}
            >
              See the updated plan
            </Link>
          </Notice>
        )}

        <div className="flex flex-col gap-6">
          {/* DAILY TO-DO */}
          <DailyTodoPanel studentId={params.id} />

          {/* SESSIONS */}
          <div className="min-w-0">
            {sessions === null && (
              <div className="space-y-7">
                <SkeletonCard />
                <SkeletonCard />
              </div>
            )}

            {sessions !== null && sessions.length === 0 && overExam && (
              <ExamOverNotice
                studentId={params.id}
                examName={overExam.name}
                examDate={overExam.examDate}
              />
            )}

            {sessions !== null && sessions.length === 0 && !overExam && (
              <EmptyState
                titleAs="h2"
                icon="🌤️"
                title="Nothing scheduled today"
                description="Either there's no active plan yet, or today falls outside the study days you set."
                action={
                  <Link
                    href={`/students/${params.id}/plan`}
                    className={emptyStateActionClass}
                  >
                    View the full plan
                  </Link>
                }
              />
            )}

            {sessions !== null && sessions.length > 0 && (
              <>
                {/* PROGRESS CARD: not shown on a day with only optional sessions */}
                {progress.total > 0 && (
                  <div className="mb-6 rounded-[32px] bg-[#F7CC46] p-6 sm:p-8">
                    <Tag className="px-5 py-2">Today&apos;s progress</Tag>

                    <div className="mt-6 flex items-baseline gap-2">
                      <p className="text-5xl font-extrabold tracking-tight sm:text-6xl">
                        {progress.done}
                      </p>

                      <p className="text-lg font-bold text-black/60">
                        of {progress.total} required sessions done
                      </p>
                    </div>

                    <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-white/50">
                      <div
                        className="h-full rounded-full bg-black/75 transition-all"
                        style={{
                          width: `${(progress.done / progress.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* SESSION CARDS */}
                <div className="flex flex-col gap-4">
                  {sessions.map((s) => (
                    <SessionCard
                      key={s.id}
                      session={s}
                      onComplete={(rating) => handleComplete(s.id, rating)}
                      onSkip={() => handleSkip(s.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </PageMain>

      <StudentBottomNav studentId={params.id} active="today" />
    </PageShell>
  );
}
