'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';

import {
  StudentCard,
  StudentSummary,
} from '@/components/dashboard/StudentCard';

import { api, ApiError, getErrorMessage } from '@/lib/api-client';
import type { TodoStats } from '@/lib/types/todo';

function LogoutIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
      <path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" />
    </svg>
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [students, setStudents] = useState<StudentSummary[] | null>(null);

  const [statsByStudent, setStatsByStudent] = useState<
    Record<string, TodoStats>
  >({});

  const [error, setError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Delete-child flow
  const [deleteTarget, setDeleteTarget] = useState<StudentSummary | null>(null);

  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Fetch students and statistics
  useEffect(() => {
    api
      .get<{ students: StudentSummary[] }>('/api/students')
      .then(async (data) => {
        setStudents(data.students);

        const entries = await Promise.all(
          data.students.map(async (s) => {
            try {
              const stats = await api.get<TodoStats>(
                `/api/students/${s.id}/todos/stats`,
              );

              return [s.id, stats] as const;
            } catch {
              return null;
            }
          }),
        );

        setStatsByStudent(
          Object.fromEntries(
            entries.filter((e): e is [string, TodoStats] => e !== null),
          ),
        );
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }

        setError(
          err instanceof ApiError && err.retryable
            ? err.message
            : "Couldn't load your children. Please try refreshing.",
        );
      });

    api
      .get<{ user: { isAdmin: boolean } }>('/api/auth/me')
      .then((data) => setIsAdmin(data.user.isAdmin))
      .catch(() => setIsAdmin(false));
  }, [router]);

  // Logout
  async function handleLogout() {
    try {
      await api.post('/api/auth/logout');
      router.push('/login');
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't log you out. Please try again."));
    }
  }

  // Delete-child flow
  function openDelete(student: StudentSummary) {
    setDeleteTarget(student);
    setDeleteConfirmText('');
    setDeleteError(null);
  }

  function closeDelete() {
    if (isDeleting) return;
    setDeleteTarget(null);
  }

  const deleteNameMatches =
    !!deleteTarget &&
    deleteConfirmText.trim().toLowerCase() ===
      deleteTarget.name.trim().toLowerCase();

  async function handleDelete() {
    if (!deleteTarget || !deleteNameMatches) return;

    const target = deleteTarget;

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await api.delete(`/api/students/${target.id}`);

      setStudents((prev) => prev?.filter((s) => s.id !== target.id) ?? prev);

      setStatsByStudent((prev) => {
        const next = { ...prev };
        delete next[target.id];
        return next;
      });

      setDeleteTarget(null);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError
          ? err.message
          : "Couldn't delete this child. Please try again.",
      );
    } finally {
      setIsDeleting(false);
    }
  }

  const firstStudent = students?.[0];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FAF9F6] pb-24 text-black sm:pb-8">
      {/* HEADER */}
      <header className="relative z-30 bg-[#FAF9F6]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-5 sm:px-7 lg:px-0">
          {/* BRAND */}
          <Link href="/dashboard" className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-xl font-bold text-white sm:h-14 sm:w-14 sm:text-2xl">
              S
            </div>

            <span className="text-xl font-bold tracking-tight sm:text-2xl">
              StudyPlan Analyzer
            </span>
          </Link>

          {/* HEADER ACTIONS */}
          <div className="flex items-center gap-2.5">
            {isAdmin && (
              <Link
                href="/admin"
                className="hidden rounded-full px-4 py-3 text-sm font-semibold transition hover:bg-black/5 sm:block"
              >
                Admin
              </Link>
            )}

            <button
              type="button"
              onClick={handleLogout}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#F0EFED] px-5 text-sm font-semibold transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:px-6 sm:text-base"
            >
              <LogoutIcon />
              <span>Log out</span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto w-full max-w-[1400px] px-5 pt-5 sm:px-7 sm:pt-8 lg:px-0">
        {/* HERO SECTION */}
        <section className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            {/* ANIMATED HEADLINE */}
            <h1 className="dashboard-headline relative inline-block whitespace-nowrap text-[clamp(1.15rem,5.1vw,4rem)] font-extrabold leading-tight tracking-[-0.045em]">
              Study smarter, not longer.
            </h1>

            <p className="mt-4 max-w-xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
              Study progress, daily habits, exams and learning — all in one
              place.
            </p>
          </div>

          {/* ADD CHILD BUTTON */}
          <Link
            href="/onboarding"
            className="inline-flex w-fit shrink-0 items-center justify-center gap-2 rounded-full bg-[#F7CC46] px-6 py-3.5 text-sm font-semibold text-black shadow-[0_5px_12px_rgba(0,0,0,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F0C33A] hover:shadow-[0_7px_16px_rgba(0,0,0,0.10)] active:scale-95 sm:px-7 sm:py-4 sm:text-base"
          >
            <span className="text-xl font-normal">+</span>
            Add new child
          </Link>
        </section>

        {/* ERROR MESSAGE */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* LOADING STATE */}
        {students === null && (
          <div className="space-y-7">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* EMPTY STATE */}
        {students !== null && students.length === 0 && (
          <div className="rounded-[32px] bg-white px-6 py-16 text-center shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:py-20">
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[28px] bg-[#F7CC46] text-4xl">
              🎓
            </div>

            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Your learning journey starts here.
            </h2>

            <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#65615D] sm:text-base">
              Add your first child to start tracking study plans, exam results
              and daily learning habits.
            </p>

            <Link
              href="/onboarding"
              className="mt-7 inline-flex rounded-full bg-black px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-black/80"
            >
              + Add your first child
            </Link>
          </div>
        )}

        {/* STUDENT DASHBOARDS */}
        {students !== null && students.length > 0 && (
          <section>
            <div className="flex flex-col gap-8">
              {students.map((student) => (
                <StudentCard
                  key={student.id}
                  student={student}
                  stats={statsByStudent[student.id] ?? null}
                  onDelete={openDelete}
                />
              ))}
            </div>
          </section>
        )}
      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          <Link
            href="/dashboard"
            className="flex flex-col items-center gap-1 py-3 text-black"
          >
            <span className="text-xl">▦</span>
            <span className="text-[10px] font-bold">Home</span>
          </Link>

          {firstStudent ? (
            <>
              <Link
                href={`/students/${firstStudent.id}/plan`}
                className="flex flex-col items-center gap-1 py-3 text-black/35"
              >
                <span className="text-xl">＋</span>
                <span className="text-[10px] font-medium">Plan</span>
              </Link>

              <Link
                href={`/students/${firstStudent.id}/today`}
                className="flex flex-col items-center gap-1 py-3 text-black/35"
              >
                <span className="text-xl">ϟ</span>
                <span className="text-[10px] font-medium">Today</span>
              </Link>

              <Link
                href={`/students/${firstStudent.id}/daily-challenge`}
                className="flex flex-col items-center gap-1 py-3 text-black/35"
              >
                <span className="text-xl">◧</span>
                <span className="text-[10px] font-medium">Quiz</span>
              </Link>

              <Link
                href={`/students/${firstStudent.id}/settings`}
                className="flex flex-col items-center gap-1 py-3 text-black/35"
              >
                <span className="text-xl">●</span>
                <span className="text-[10px] font-medium">You</span>
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/onboarding"
                className="flex flex-col items-center gap-1 py-3 text-black/35"
              >
                <span className="text-xl">＋</span>
                <span className="text-[10px] font-medium">Create</span>
              </Link>

              <div className="flex flex-col items-center gap-1 py-3 text-black/20">
                <span className="text-xl">ϟ</span>
                <span className="text-[10px]">Today</span>
              </div>

              <div className="flex flex-col items-center gap-1 py-3 text-black/20">
                <span className="text-xl">◧</span>
                <span className="text-[10px]">Quiz</span>
              </div>

              <div className="flex flex-col items-center gap-1 py-3 text-black/20">
                <span className="text-xl">●</span>
                <span className="text-[10px]">You</span>
              </div>
            </>
          )}
        </div>
      </nav>

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md !rounded-[26px] !border-0 !bg-white !p-6 !shadow-2xl">
            <h2 className="mb-2 text-lg font-bold text-red-700">
              Delete {deleteTarget.name} permanently?
            </h2>

            <p className="mb-4 text-sm leading-6 text-slate-600">
              This permanently deletes all of {deleteTarget.name}&apos;s data:
              study plans, completed sessions, test marks, subjects, topics,
              analysis, daily challenge history and to-dos. There is no way to
              recover it. You can add a new child afterwards.
            </p>

            <Input
              label={`Type "${deleteTarget.name}" to confirm`}
              value={deleteConfirmText}
              disabled={isDeleting}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
            />

            {deleteError && (
              <p className="mt-3 text-sm text-red-600">{deleteError}</p>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="secondary"
                onClick={closeDelete}
                disabled={isDeleting}
              >
                Cancel
              </Button>

              <Button
                onClick={handleDelete}
                isLoading={isDeleting}
                disabled={!deleteNameMatches || isDeleting}
                className="!bg-red-600 hover:!bg-red-700"
              >
                Delete permanently
              </Button>
            </div>
          </Card>
        </div>
      )}

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
