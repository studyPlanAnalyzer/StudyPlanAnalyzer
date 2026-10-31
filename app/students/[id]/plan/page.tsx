'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { WeeklyPlanView, PlanWeek } from '@/components/plan/WeeklyPlanView';
import { api, ApiError } from '@/lib/api-client';
import { ExamOverNotice } from '@/components/exam/ExamOverNotice';

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

export default function PlanPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
    <div className="min-h-screen overflow-x-hidden bg-[#FAF9F6] pb-24 text-black sm:pb-8">
      {/* HEADER */}
      <header className="relative z-30 bg-[#FAF9F6]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-5 py-5 sm:px-7 lg:px-0">
          {/* BRAND */}
          <Link href="/dashboard" className="flex shrink-0 items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-xl font-bold text-white sm:h-14 sm:w-14 sm:text-2xl">
              S
            </div>

            <span className="text-xl font-bold tracking-tight sm:text-2xl">
              StudyPlan Analyzer
            </span>
          </Link>

          {/* Desktop and laptop navigation */}
          <nav className="hidden flex-1 items-center justify-end gap-1 xl:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="whitespace-nowrap rounded-full px-4 py-3 text-sm font-semibold transition hover:bg-black/5"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Hamburger - tablet and mobile */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F0EFED] text-black transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:w-14 xl:hidden"
          >
            {menuOpen ? (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 6l12 12M18 6L6 18"
                />
              </svg>
            ) : (
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Mobile and tablet dropdown */}
        {menuOpen && (
          <nav className="absolute left-0 right-0 top-full mx-5 flex flex-col gap-1 rounded-[26px] bg-white p-3 shadow-2xl sm:mx-7 xl:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
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

      {/* MAIN CONTENT */}
      <main className="mx-auto w-full max-w-[1400px] px-5 pt-5 sm:px-7 sm:pt-8 lg:px-0">
        {/* ERROR MESSAGE */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
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
              <Link href={`/students/${params.id}/analysis`}>
                <Button>Go to analysis</Button>
              </Link>
            }
          />
        )}

        {/* ACTUAL PLAN */}
        {data && (
          <>
            {/* HERO SECTION */}
            <section className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1">
                {/* ANIMATED HEADLINE */}
                <h1 className="dashboard-headline relative inline-block max-w-full text-[clamp(1.15rem,5.1vw,4rem)] font-extrabold leading-tight tracking-[-0.045em]">
                  {data.student.name}&apos;s study plan.
                </h1>

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
                  className="inline-flex w-fit shrink-0 items-center justify-center gap-2 rounded-full bg-[#F7CC46] px-6 py-3.5 text-sm font-semibold text-black shadow-[0_5px_12px_rgba(0,0,0,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F0C33A] hover:shadow-[0_7px_16px_rgba(0,0,0,0.10)] active:scale-95 sm:px-7 sm:py-4 sm:text-base"
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
                  className="inline-flex w-fit shrink-0 items-center justify-center gap-2 rounded-full bg-[#F0EFED] px-6 py-3.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-[#E7E5E2] active:scale-95 sm:px-7 sm:py-4 sm:text-base"
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
            <div className="rounded-[32px] bg-white p-4 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-7 lg:p-10">
              {/* SUMMARY CARDS */}
              <div className="mb-8 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr]">
                {/* Total days */}
                <div className="relative flex min-h-[220px] flex-col justify-between overflow-hidden rounded-[32px] bg-[#F7CC46] p-6 sm:p-8">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-black px-5 py-2 text-xs font-bold tracking-wide text-white">
                      TOTAL DAYS
                    </span>

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
                    <span className="rounded-full bg-black px-5 py-2 text-xs font-bold tracking-wide text-white">
                      DAILY AVG
                    </span>

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
                    <span className="rounded-full bg-black px-5 py-2 text-xs font-bold tracking-wide text-white">
                      FOCUS SPLIT
                    </span>

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
                  className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-black px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-black/80"
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
                        className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-[#805500]"
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
      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          <Link
            href="/dashboard"
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">▦</span>
            <span className="text-[10px] font-medium">Home</span>
          </Link>

          <Link
            href={`/students/${params.id}/plan`}
            className="flex flex-col items-center gap-1 py-3 text-black"
          >
            <span className="text-xl">＋</span>
            <span className="text-[10px] font-bold">Plan</span>
          </Link>

          <Link
            href={`/students/${params.id}/today`}
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">ϟ</span>
            <span className="text-[10px] font-medium">Today</span>
          </Link>

          <Link
            href={`/students/${params.id}/daily-challenge`}
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">◧</span>
            <span className="text-[10px] font-medium">Quiz</span>
          </Link>

          <Link
            href={`/students/${params.id}/settings`}
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">●</span>
            <span className="text-[10px] font-medium">You</span>
          </Link>
        </div>
      </nav>

      {/* HEADLINE ANIMATION */}
      <style jsx global>{`
        @keyframes headline-enter {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes underline-draw {
          from {
            transform: scaleX(0);
          }
          to {
            transform: scaleX(1);
          }
        }

        .dashboard-headline {
          animation: headline-enter 700ms ease-out both;
        }

        .dashboard-headline::after {
          content: '';
          position: absolute;
          left: 0;
          bottom: -5px;
          width: 100%;
          height: 3px;
          border-radius: 999px;
          background: #f7cc46;
          transform: scaleX(0);
          transform-origin: left;
          animation: underline-draw 900ms 400ms ease-out forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .dashboard-headline,
          .dashboard-headline::after {
            animation: none;
            opacity: 1;
            transform: none;
          }

          .dashboard-headline::after {
            transform: scaleX(1);
          }
        }
      `}</style>
    </div>
  );
}
