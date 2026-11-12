'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { SessionCard, SessionItem } from '@/components/session/SessionCard';
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
import { RevisionPanel } from '@/components/revision/RevisionPanel';
import { ensurePlanId } from '@/lib/ensure-plan';

interface StudentDetail {
  latestPlan: { id: string } | null;
  exams: { id: string; name: string; examDate: string }[];
  currentExamId: string | null;
  currentExamOver: boolean;
}

interface PlanResponse {
  weeks: { days: { date: string; sessions: SessionItem[] }[] }[];
  today: { listed: number; done: number; revisionDay: boolean; bufferWeek: boolean };
}

/** Past this many topics, the list says to start from the top. */
const LONG_LIST = 10;

const isDone = (s: SessionItem) =>
  s.status === 'completed' || s.status === 'partly_completed';

export default function TodayPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [planId, setPlanId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [revisionDay, setRevisionDay] = useState(false);
  const [bufferWeek, setBufferWeek] = useState(false);
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
    setRevisionDay(plan.today.revisionDay && !plan.today.bufferWeek);
    setBufferWeek(plan.today.bufferWeek);
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
        const ensured = await ensurePlanId(params.id, detail);
        if (!ensured) {
          const exam = detail.exams.find((e) => e.id === detail.currentExamId);
          if (detail.currentExamOver && exam) setOverExam(exam);
          setSessions([]);
          return;
        }
        setPlanId(ensured);
        // Days that were left unfinished are treated as missed and the plan is
        // rebuilt from today. A failure here shouldn't block the page. The
        // plan is fetched at the same time as the check, and fetched again
        // only if the check actually rebuilt it, so what is shown is the same
        // as before but the usual case takes one round trip less.
        const pid = ensured;
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

  async function handleComplete(sessionId: string, rating: number) {
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

  const doneToday = (sessions ?? []).filter(isDone).length;

  // Shown in the phone/tablet hamburger menu. Laptops keep "Back to full plan".
  const menuItems = [
    { href: `/students/${params.id}/plan`, label: 'Back to full plan' },
    { href: `/students/${params.id}/analysis`, label: 'Analysis' },
    {
      href: `/students/${params.id}/daily-challenge`,
      label: 'Daily Challenge',
    },
    { href: `/students/${params.id}/revise`, label: 'Revise earlier topics' },
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
            {revisionDay ? 'Revision day.' : 'Today.'}
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

            {/* REVISION DAY: earlier-exam topics, no SM-2 sessions */}
            {sessions !== null && revisionDay && (
              <RevisionPanel studentId={params.id} weekendNote />
            )}

            {sessions !== null && !revisionDay && sessions.length === 0 && overExam && (
              <ExamOverNotice
                studentId={params.id}
                examName={overExam.name}
                examDate={overExam.examDate}
              />
            )}

            {sessions !== null && bufferWeek && sessions.length === 0 && (
              <EmptyState
                titleAs="h2"
                icon="🌿"
                title="The week before the exam is free"
                description="The buffer week is on: no study list and no revision suggestions this week. You can change this in Settings."
              />
            )}

            {sessions !== null && !revisionDay && !bufferWeek && sessions.length === 0 && !overExam && (
              <EmptyState
                titleAs="h2"
                icon="🌤️"
                title="Nothing to study today"
                description="Topics come onto the list the day after they're added. Add today's topics on the Subjects page, or revise earlier topics."
                action={
                  <Link
                    href={`/students/${params.id}/subjects`}
                    className={emptyStateActionClass}
                  >
                    Add today&apos;s topics
                  </Link>
                }
              />
            )}

            {sessions !== null && !revisionDay && sessions.length > 0 && (
              <>
                {/* PROGRESS */}
                <div
                  className={`mb-6 rounded-[32px] p-6 sm:p-8 ${doneToday === sessions.length ? 'bg-[#a4e5c7]' : 'bg-[#F7CC46]'}`}
                >
                  <Tag className="px-5 py-2">Today&apos;s list</Tag>
                  <div className="mt-6 flex items-baseline gap-2">
                    <p className="text-5xl font-extrabold tracking-tight sm:text-6xl">{doneToday}</p>
                    <p className="text-lg font-bold text-black/60">
                      of {sessions.length} topic{sessions.length === 1 ? '' : 's'} done
                    </p>
                  </div>
                  <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-white/50">
                    <div
                      className="h-full rounded-full bg-black/75 transition-all"
                      style={{ width: `${(doneToday / sessions.length) * 100}%` }}
                    />
                  </div>
                  {sessions.length > LONG_LIST && (
                    <p className="mt-4 text-sm leading-6 text-black/80">
                      A long list today. Start from the top: anything not done comes back
                      tomorrow, in its place.
                    </p>
                  )}
                </div>

                {/* SESSIONS, in the plan's order */}
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

                <p className="mt-8 text-sm text-[#65615D]">
                  Want to go over something from an earlier exam?{' '}
                  <Link href={`/students/${params.id}/revise`} className="font-semibold underline">
                    Revise earlier topics
                  </Link>
                </p>
              </>
            )}
          </div>
        </div>
      </PageMain>

      <StudentBottomNav studentId={params.id} active="today" />
    </PageShell>
  );
}
