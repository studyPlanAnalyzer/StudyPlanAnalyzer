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

  async function handleLogout() {
    try {
      await api.post('/api/auth/logout');
      router.push('/login');
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't log you out. Please try again."));
    }
  }

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

  const studentCount = students?.length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-6">
          <Link href="/dashboard" className="group">
            <span className="text-lg font-semibold text-indigo-700">
              StudyPlan Analyzer
            </span>
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            {isAdmin && (
              <Link
                href="/admin"
                className="rounded-xl bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
              >
                Admin
              </Link>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              Log out
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
        {/* Welcome area */}
        <div className="mb-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="mb-2 text-sm font-medium text-indigo-600">
                Parent dashboard
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Your children
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500 sm:text-base">
                Keep track of study progress, daily habits, exams, and learning
                activities — all in one place.
              </p>
            </div>
            <Link href="/onboarding" className="shrink-0">
              <Button>+ Add new child</Button>
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {students === null && (
          <div className="space-y-6">
            <SkeletonCard /> <SkeletonCard />
          </div>
        )}

        {/* Empty state */}
        {students !== null && students.length === 0 && (
          <div className="rounded-3xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-2xl">
              🎓
            </div>
            <h2 className="text-xl font-semibold text-slate-900">
              Let&apos;s get started
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">
              Add your child to start tracking marks, planning exams, building
              daily study habits, and discovering their learning progress.
            </p>
            <div className="mt-6">
              <Link href="/onboarding">
                <Button>Add your first child</Button>
              </Link>
            </div>
          </div>
        )}

        {/* Students */}
        {students !== null && students.length > 0 && (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-sm font-medium text-slate-500">
                {studentCount === 1 ? '1 child' : `${studentCount} children`}
              </p>
            </div>
            <div className="flex flex-col gap-6">
              {students.map((s) => (
                <StudentCard
                  key={s.id}
                  student={s}
                  stats={statsByStudent[s.id] ?? null}
                  onDelete={openDelete}
                />
              ))}
            </div>
          </>
        )}
      </main>

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <Card className="w-full max-w-md">
            <h2 className="mb-2 text-base font-semibold text-red-700">
              Delete {deleteTarget.name} permanently?
            </h2>
            <p className="mb-3 text-sm text-slate-600">
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
            <div className="mt-5 flex justify-end gap-2">
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
                className="bg-red-600 hover:bg-red-700"
              >
                Delete permanently
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
