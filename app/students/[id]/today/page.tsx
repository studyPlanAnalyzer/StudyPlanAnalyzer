'use client';

import { useEffect, useState, useCallback, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { SessionCard, SessionItem } from '@/components/session/SessionCard';
import { api, ApiError } from '@/lib/api-client';
import { DailyTodoPanel } from '@/components/todo/DailyTodoPanel';
import { ExamOverNotice } from '@/components/exam/ExamOverNotice';

interface StudentDetail {
  latestPlan: { id: string } | null;
  exams: { id: string; name: string; examDate: string }[];
  currentExamId: string | null;
  currentExamOver: boolean;
}

interface PlanResponse {
  weeks: { days: { date: string; sessions: SessionItem[] }[] }[];
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function ArrowLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

export default function TodayPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [planId, setPlanId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [planUpdated, setPlanUpdated] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
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

  const completedCount =
    sessions?.filter(
      (s) => s.status === 'completed' || s.status === 'partly_completed',
    ).length ?? 0;

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

          {/* Laptop and up */}
          <Link
            href={`/students/${params.id}/plan`}
            className="hidden h-14 items-center justify-center gap-2 rounded-full bg-[#F0EFED] px-6 text-base font-semibold transition hover:bg-[#E7E5E2] active:scale-95 lg:flex"
          >
            <ArrowLeftIcon />
            Back to full plan
          </Link>

          {/* Phones and tablets: hamburger */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F0EFED] text-black transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:w-14 lg:hidden"
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

        {/* Phones and tablets: dropdown menu */}
        {menuOpen && (
          <nav className="absolute left-0 right-0 top-full mx-5 flex flex-col gap-1 rounded-[26px] bg-white p-3 shadow-2xl sm:mx-7 lg:hidden">
            {menuItems.map((item) => (
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
        {/* HERO SECTION */}
        <section className="mb-8 sm:mb-10">
          <h1 className="dashboard-headline relative inline-block max-w-full text-[clamp(1.15rem,5.1vw,4rem)] font-extrabold leading-tight tracking-[-0.045em]">
            Today&apos;s sessions.
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </section>

        {/* ERROR MESSAGE */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* PLAN UPDATED NOTICE */}
        {planUpdated && (
          <div className="mb-6 rounded-[26px] bg-[#F0EFED] px-5 py-5 sm:px-8 sm:py-6">
            <p className="text-sm font-semibold leading-6 text-black sm:text-base">
              That&apos;s today done. The days ahead were updated based on how
              today went.
            </p>

            <Link
              href={`/students/${params.id}/plan`}
              className="mt-3 inline-flex rounded-full bg-black px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-black/80 active:scale-95"
            >
              See the updated plan
            </Link>
          </div>
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
              <div className="rounded-[32px] bg-white px-6 py-16 text-center shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:py-20">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[28px] bg-[#F7CC46] text-4xl">
                  🌤️
                </div>

                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  Nothing scheduled today
                </h2>

                <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#65615D] sm:text-base">
                  Either there&apos;s no active plan yet, or today falls outside
                  the study days you set.
                </p>

                <Link
                  href={`/students/${params.id}/plan`}
                  className="mt-7 inline-flex rounded-full bg-black px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-black/80 active:scale-95"
                >
                  View the full plan
                </Link>
              </div>
            )}

            {sessions !== null && sessions.length > 0 && (
              <>
                {/* PROGRESS CARD */}
                <div className="mb-6 rounded-[32px] bg-[#F7CC46] p-6 sm:p-8">
                  <span className="inline-flex rounded-full bg-black px-5 py-2 text-xs font-bold uppercase tracking-wide text-white">
                    Today&apos;s progress
                  </span>

                  <div className="mt-6 flex items-baseline gap-2">
                    <p className="text-5xl font-extrabold tracking-tight sm:text-6xl">
                      {completedCount}
                    </p>

                    <p className="text-lg font-bold text-black/60">
                      of {sessions.length} sessions done
                    </p>
                  </div>

                  <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-white/50">
                    <div
                      className="h-full rounded-full bg-black/75 transition-all"
                      style={{
                        width: `${(completedCount / sessions.length) * 100}%`,
                      }}
                    />
                  </div>
                </div>

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
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">＋</span>
            <span className="text-[10px] font-medium">Plan</span>
          </Link>

          <Link
            href={`/students/${params.id}/today`}
            className="flex flex-col items-center gap-1 py-3 text-black"
          >
            <span className="text-xl">ϟ</span>
            <span className="text-[10px] font-bold">Today</span>
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
