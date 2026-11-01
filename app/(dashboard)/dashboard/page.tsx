'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AppHeader, headerLinkClass, headerPillClass } from '@/components/ui/AppHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { EmptyState, emptyStateActionClass } from '@/components/ui/EmptyState';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Notice } from '@/components/ui/Notice';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { PageTitle } from '@/components/ui/PageTitle';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { StudentBottomNav } from '@/components/ui/StudentBottomNav';

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
    <PageShell withBottomNav>
      <AppHeader>
        {isAdmin && (
          <Link href="/admin" className={`hidden sm:block ${headerLinkClass}`}>
            Admin
          </Link>
        )}

        <button type="button" onClick={handleLogout} className={headerPillClass}>
          <LogoutIcon />
          <span>Log out</span>
        </button>
      </AppHeader>

      <PageMain>
        {/* HERO SECTION */}
        <section className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <PageTitle nowrap>Study smarter, not longer.</PageTitle>

            <p className="mt-4 max-w-xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
              Study progress, daily habits, exams and learning — all in one
              place.
            </p>
          </div>

          <ButtonLink href="/onboarding" variant="yellow" size="lg" className="w-fit">
            <span className="text-xl font-normal">+</span>
            Add new child
          </ButtonLink>
        </section>

        {error && (
          <Notice className="mb-6">{error}</Notice>
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
          <EmptyState
            titleAs="h2"
            title="Your learning journey starts here."
            description="Add your first child to start tracking study plans, exam results and daily learning habits."
            action={
              <Link href="/onboarding" className={emptyStateActionClass}>
                + Add your first child
              </Link>
            }
          />
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
      </PageMain>

      <StudentBottomNav studentId={firstStudent?.id ?? null} active="home" />

      {/* DELETE CONFIRMATION MODAL */}
      {deleteTarget && (
        <Modal className="max-w-md">
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
              variant="danger"
              onClick={handleDelete}
              isLoading={isDeleting}
              disabled={!deleteNameMatches || isDeleting}
            >
              Delete permanently
            </Button>
          </div>
        </Modal>
      )}
    </PageShell>
  );
}
