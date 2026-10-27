'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
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

export default function TodayPage({ params }: { params: { id: string } }) {
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
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <Link
            href="/dashboard"
            className="text-base font-semibold text-indigo-700 sm:text-lg"
          >
            StudyPlan Analyzer
          </Link>

          {/* Laptop and up */}
          <Link
            href={`/students/${params.id}/plan`}
            className="hidden text-sm text-slate-500 hover:text-slate-800 lg:block"
          >
            Back to full plan
          </Link>

          {/* Phones and tablets: hamburger */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            {menuOpen ? (
              <svg
                className="h-6 w-6"
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
                className="h-6 w-6"
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
          <nav className="flex flex-col border-t border-slate-200 bg-white px-4 py-2 sm:px-6 lg:hidden">
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">
          Today&apos;s sessions
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </p>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {planUpdated && (
          <Card className="mb-6 border-indigo-200 bg-indigo-50">
            <p className="text-sm font-medium text-indigo-900">
              That&apos;s today done. The days ahead were updated based on how
              today went.
            </p>
            <Link
              href={`/students/${params.id}/plan`}
              className="mt-1 inline-block text-sm font-medium text-indigo-600"
            >
              See the updated plan
            </Link>
          </Card>
        )}

        <DailyTodoPanel studentId={params.id} />

        {sessions === null && (
          <div className="flex flex-col gap-3">
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
            title="Nothing scheduled today"
            description="Either there's no active plan yet, or today falls outside the study days you set."
            action={
              <Link
                href={`/students/${params.id}/plan`}
                className="text-sm font-medium text-indigo-600"
              >
                View the full plan
              </Link>
            }
          />
        )}

        {sessions !== null && sessions.length > 0 && (
          <>
            <Card className="mb-6">
              <p className="text-sm text-slate-500">
                {completedCount} of {sessions.length} sessions done
              </p>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all"
                  style={{
                    width: `${(completedCount / sessions.length) * 100}%`,
                  }}
                />
              </div>
            </Card>

            <div className="flex flex-col gap-3">
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
      </main>
    </div>
  );
}
