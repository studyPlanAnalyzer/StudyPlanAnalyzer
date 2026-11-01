'use client';

import { useEffect, useState, use } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ButtonLink, buttonClass } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { WeeklyPlanView, PlanWeek } from '@/components/plan/WeeklyPlanView';
import { api, ApiError } from '@/lib/api-client';
import { ExamOverNotice } from '@/components/exam/ExamOverNotice';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, headerLinkClass } from '@/components/ui/AppHeader';
import { Notice } from '@/components/ui/Notice';
import { PageTitle } from '@/components/ui/PageTitle';
import { Tag } from '@/components/ui/Tag';
import { cardClass } from '@/components/ui/Card';
import { StudentBottomNav } from '@/components/ui/StudentBottomNav';

interface PlanResponse {
  plan: {
    id: string;
    totalDays: number;
    averageDailyMinutes: number;
    weakFocusPercent: number;
    mediumFocusPercent: number;
    strongFocusPercent: number;
  };
  exam: { name: string; examDate: string } | null;
  student: { id: string; name: string };
  weeks: PlanWeek[];
  unscheduledTopics: { id: string; name: string; subjectName: string }[];
}

interface StudentDetail {
  latestPlan: { id: string } | null;
  exams: { id: string; name: string; examDate: string }[];
  currentExamId: string | null;
  currentExamOver: boolean;
}

export default function PlanPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [overExam, setOverExam] = useState<{
    name: string;
    examDate: string;
  } | null>(null);

  useEffect(() => {
    async function showNoPlan(known?: StudentDetail) {
      const detail =
        known ?? (await api.get<StudentDetail>(`/api/students/${params.id}`));

      const exam = detail.exams.find((e) => e.id === detail.currentExamId);

      if (detail.currentExamOver && exam) {
        setOverExam(exam);
      }

      setNotFound(true);
    }

    async function load() {
      try {
        let planId = searchParams.get('planId');
        let detail: StudentDetail | undefined;

        if (!planId) {
          detail = await api.get<StudentDetail>(`/api/students/${params.id}`);

          planId = detail.latestPlan?.id ?? null;
        }

        if (!planId) {
          await showNoPlan(detail);
          return;
        }

        const [catchUp, first] = await Promise.all([
          api
            .post<{ updated?: boolean }>(`/api/plans/${planId}/catch-up`)
            .catch(() => undefined),

          api.get<PlanResponse>(`/api/plans/${planId}`),
        ]);

        const plan = catchUp?.updated
          ? await api.get<PlanResponse>(`/api/plans/${planId}`)
          : first;

        setData(plan);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }

        if (err instanceof ApiError && err.status === 404) {
          try {
            await showNoPlan();
            return;
          } catch {
            /* Fall through */
          }
        }

        setError("Couldn't load the study plan. Please try refreshing.");
      }
    }

    load();

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  const navItems = [
    { href: `/students/${params.id}/analysis`, label: 'Analysis' },
    { href: `/students/${params.id}/today`, label: 'Today' },
    {
      href: `/students/${params.id}/daily-challenge`,
      label: 'Daily Challenge',
    },
    { href: `/students/${params.id}/subjects`, label: 'Subjects' },
    { href: `/students/${params.id}/tests`, label: 'Test history' },
    { href: `/students/${params.id}/settings`, label: 'Settings' },
    {
      href: `/students/${params.id}/add-test-marks`,
      label: 'Log a test',
    },
    { href: `/students/${params.id}/new-exam`, label: 'New exam' },
  ];

  return (
    <PageShell withBottomNav>
      <AppHeader menu={{ items: navItems, breakpoint: 'xl' }}>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className={headerLinkClass}>
              {item.label}
            </Link>
          ))}
        </nav>
      </AppHeader>

      <PageMain>
        {/* ERROR MESSAGE */}
        {error && (
          <Notice className="mb-6">
            {error}
          </Notice>
        )}

        {/* LOADING STATE */}
        {!data && !notFound && !error && (
          <div className="space-y-7">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* EXAM OVER */}
        {notFound && overExam && (
          <ExamOverNotice
            studentId={params.id}
            examName={overExam.name}
            examDate={overExam.examDate}
          />
        )}

        {/* NO PLAN */}
        {notFound && !overExam && (
          <EmptyState
            title="No study plan yet"
            description="Generate a plan from the analysis page once marks and topics are in place."
            action={
              <ButtonLink href={`/students/${params.id}/analysis`}>
                Go to analysis
              </ButtonLink>
            }
          />
        )}

        {/* ACTUAL PLAN */}
        {data && (
          <>
            {/* HERO SECTION */}
            <section className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1">
                <PageTitle>
                  {data.student.name}&apos;s study plan.
                </PageTitle>

                {data.exam && (
                  <p className="mt-4 max-w-xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
                    Until {data.exam.name} on{' '}
                    {new Date(data.exam.examDate).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={`/students/${params.id}/today`}
                  className={buttonClass('yellow', 'lg', 'w-fit')}
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M7 4.5v15l12-7.5-12-7.5z"
                    />
                  </svg>
                  Start today&apos;s session
                </Link>

                <Link
                  href={`/students/${params.id}/settings`}
                  className={buttonClass('secondary', 'lg', 'w-fit')}
                >
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 6h16M7 12h10M10 18h4"
                    />
                    <circle cx="8" cy="6" r="1.5" fill="currentColor" />
                    <circle cx="16" cy="12" r="1.5" fill="currentColor" />
                    <circle cx="12" cy="18" r="1.5" fill="currentColor" />
                  </svg>
                  Adjust preferences
                </Link>
              </div>
            </section>

            {/* PLAN CONTENT CONTAINER */}
            <div className={`${cardClass} p-4 sm:p-7 lg:p-10`}>
              {/* SUMMARY CARDS */}
              <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr]">
                {/* Total days */}
                <div className="relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-[32px] bg-[#F7CC46] p-6 sm:p-8">
                  <div className="flex items-center justify-between">
                    <Tag className="px-5 py-2">TOTAL DAYS</Tag>

                    <svg
                      className="h-8 w-8 text-black/65"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <rect x="3" y="5" width="18" height="16" rx="2" />
                      <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
                    </svg>
                  </div>

                  <div>
                    <p className="text-5xl font-extrabold tracking-tight text-black sm:text-6xl">
                      {data.plan.totalDays}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-black/70">
                      days until exam
                    </p>
                  </div>
                </div>

                {/* Daily average */}
                <div className="relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-[32px] bg-[#a4e5c7] p-6 sm:p-8">
                  <div className="flex items-center justify-between">
                    <Tag className="px-5 py-2">DAILY AVG</Tag>

                    <svg
                      className="h-8 w-8 text-black/65"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <circle cx="12" cy="12" r="9" />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 7v5l3 2"
                      />
                    </svg>
                  </div>

                  <div>
                    <div className="flex items-baseline gap-1">
                      <p className="text-5xl font-extrabold tracking-tight text-black sm:text-6xl">
                        {data.plan.averageDailyMinutes}
                      </p>
                      <span className="text-lg font-bold text-black/60">
                        min
                      </span>
                    </div>

                    <p className="mt-1 text-sm font-semibold text-black/70">
                      per study day
                    </p>
                  </div>
                </div>

                {/* Focus split */}
                <div className="relative flex min-h-[220px] flex-col rounded-[32px] bg-[#a8acf0] p-6 sm:p-8">
                  <div className="mb-7 flex items-center justify-between">
                    <Tag className="px-5 py-2">FOCUS SPLIT</Tag>

                    <svg
                      className="h-8 w-8 text-black/65"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.8}
                    >
                      <circle cx="12" cy="12" r="9" />
                      <circle cx="12" cy="12" r="5" />
                      <circle cx="12" cy="12" r="1" />
                    </svg>
                  </div>

                  <div className="grid flex-1 grid-cols-3 gap-4">
                    {[
                      { label: 'Weak', value: data.plan.weakFocusPercent },
                      { label: 'Medium', value: data.plan.mediumFocusPercent },
                      { label: 'Strong', value: data.plan.strongFocusPercent },
                    ].map((item) => (
                      <div
                        key={item.label}
                        className="flex min-w-0 flex-col justify-end"
                      >
                        <p className="text-3xl font-extrabold tracking-tight text-black sm:text-4xl">
                          {item.value}%
                        </p>

                        <p className="mt-1 text-sm font-semibold text-black/65">
                          {item.label}
                        </p>

                        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/50">
                          <div
                            className="h-full rounded-full bg-black/75"
                            style={{
                              width: `${Math.min(100, Math.max(0, item.value))}%`,
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ADD TOPICS BANNER */}
              <div className="mb-10 flex flex-col gap-4 rounded-[26px] bg-[#F0EFED] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-6">
                <p className="text-sm font-semibold leading-6 text-black sm:text-base">
                  📚 New subject or topic taught this week? Add it and your plan
                  rebuilds as soon as you save.
                </p>

                <Link
                  href={`/students/${params.id}/subjects`}
                  className={buttonClass('primary', 'lg')}
                >
                  <span className="text-xl font-normal leading-none">+</span>
                  Add topics
                </Link>
              </div>

              {/* UNSCHEDULED TOPICS */}
              {data.unscheduledTopics.length > 0 && (
                <div className="mb-8 rounded-[26px] bg-[#fff5dc] p-5 sm:p-6">
                  <p className="text-sm font-bold text-[#805500]">
                    {data.unscheduledTopics.length} topic
                    {data.unscheduledTopics.length > 1 ? 's' : ''} couldn&apos;t
                    fit in this plan
                  </p>

                  <p className="mt-2 text-sm leading-6 text-[#88651d]">
                    There wasn&apos;t enough time before the exam to schedule
                    these, given the current daily minutes and study days.
                    Consider increasing daily minutes in Settings, or moving the
                    exam date out if possible.
                  </p>

                  <ul className="mt-4 flex flex-wrap gap-2">
                    {data.unscheduledTopics.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#805500]"
                      >
                        {t.name}
                        <span className="text-[#b28b3e]">
                          {' '}
                          · {t.subjectName}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* WEEKLY PLAN */}
              {data.weeks.length === 0 ? (
                <EmptyState
                  title="No sessions scheduled"
                  description="The plan didn't generate any sessions — try adding topics first, then regenerate."
                />
              ) : (
                <WeeklyPlanView weeks={data.weeks} />
              )}
            </div>
          </>
        )}
      </PageMain>

      <StudentBottomNav studentId={params.id} active="plan" />
    </PageShell>
  );
}
