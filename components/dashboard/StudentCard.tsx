'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import type { TodoStats } from '@/lib/types/todo';

export interface StudentSummary {
  id: string;
  name: string;
  grade: string;
  subjectsCount: number;
  examsCount: number;
  nextExam: { name: string; examDate: string } | null;
}

interface StudentCardProps {
  student: StudentSummary;
  stats: TodoStats | null;
  onDelete?: (student: StudentSummary) => void;
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function getDaysUntil(date: string) {
  const target = new Date(date);
  const now = new Date();
  target.setHours(0, 0, 0, 0);
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function StudentCard({ student: s, stats, onDelete }: StudentCardProps) {
  const daysUntilExam = s.nextExam ? getDaysUntil(s.nextExam.examDate) : null;
  const examPassed = daysUntilExam !== null && daysUntilExam < 0;
  const examToday = daysUntilExam === 0;
  // The exam is over from the start of its day (UTC). This is the same rule
  // the server uses to clear the plan, so the card and the pages agree.
  const examOver = s.nextExam
    ? new Date(`${s.nextExam.examDate}T00:00:00.000Z`).getTime() <= Date.now()
    : false;

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Student header */}
      <div className="border-b border-slate-100 px-5 py-5 sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-lg font-bold text-white shadow-sm">
              {initials(s.name)}
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-slate-900">
                {s.name}
              </h2>
              <div className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                <span>Grade {s.grade}</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>{s.subjectsCount} subjects</span>
              </div>
            </div>
          </div>
          {stats && stats.currentStreak > 0 && (
            <div className="hidden shrink-0 items-center gap-2 rounded-full bg-orange-50 px-3 py-1.5 text-sm font-semibold text-orange-700 sm:flex">
              <span>🔥</span> <span>{stats.currentStreak} day streak</span>
            </div>
          )}
        </div>
        {stats && stats.currentStreak > 0 && (
          <div className="mt-4 flex items-center gap-2 text-sm font-medium text-orange-700 sm:hidden">
            <span>🔥</span> <span>{stats.currentStreak} day streak</span>
          </div>
        )}
      </div>

      {/* Main dashboard area */}
      <div className="p-5 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Exam / progress */}
          <div className="rounded-2xl bg-indigo-50/70 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-indigo-950">
                  Study progress
                </p>
                <p className="mt-0.5 text-xs text-indigo-700/70">
                  Exams and preparation
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-indigo-600 shadow-sm">
                📚
              </div>
            </div>
            <div className="mb-4 flex gap-6">
              <div>
                <p className="text-xl font-bold text-slate-900">
                  {s.subjectsCount}
                </p>
                <p className="text-xs text-slate-500">Subjects</p>
              </div>
              <div>
                <p className="text-xl font-bold text-slate-900">
                  {s.examsCount}
                </p>
                <p className="text-xs text-slate-500">Exams tracked</p>
              </div>
            </div>
            {s.nextExam ? (
              <div className="mb-4 rounded-xl bg-white/80 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Next exam
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {s.nextExam.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {new Date(s.nextExam.examDate).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </p>
                {examPassed ? (
                  <p className="mt-2 text-xs font-medium text-amber-600">
                    ⚠ Exam date has passed
                  </p>
                ) : examToday ? (
                  <p className="mt-2 text-xs font-semibold text-red-600">
                    ● Exam is today
                  </p>
                ) : daysUntilExam !== null && daysUntilExam <= 14 ? (
                  <p className="mt-2 text-xs font-medium text-indigo-600">
                    {daysUntilExam} days to go
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mb-4 rounded-xl bg-white/80 p-3">
                <p className="text-xs text-slate-400">
                  No upcoming exam scheduled.
                </p>
              </div>
            )}
            {examOver && (
              <p className="mb-3 text-xs text-indigo-900/70">
                This exam is over, so its study plan has been cleared. Start the
                next exam cycle, or a new academic session if your child has
                moved on.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {examOver ? (
                <>
                  <Link href={`/students/${s.id}/new-exam`}>
                    <Button size="sm">Start new exam cycle</Button>
                  </Link>
                  <Link href={`/students/${s.id}/new-session`}>
                    <Button size="sm" variant="secondary">
                      Start a new academic session
                    </Button>
                  </Link>
                </>
              ) : (
                <Link href={`/students/${s.id}/plan`}>
                  <Button size="sm">View study plan</Button>
                </Link>
              )}
              <Link href={`/students/${s.id}/analysis`}>
                <Button size="sm" variant="secondary">
                  Analysis
                </Button>
              </Link>
            </div>
          </div>

          {/* Daily habits */}
          <div className="rounded-2xl bg-amber-50/70 p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-amber-950">
                  Today&apos;s habits
                </p>
                <p className="mt-0.5 text-xs text-amber-700/70">
                  Keep the momentum going
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-amber-600 shadow-sm">
                ✓
              </div>
            </div>
            <div className="mb-2 flex items-end justify-between">
              <span className="text-3xl font-bold text-slate-900">
                {stats ? `${stats.todayCompletionRate}%` : '—'}
              </span>
              {stats && (
                <span className="pb-1 text-xs font-medium text-slate-500">
                  completed today
                </span>
              )}
            </div>
            <div className="mb-5 h-2 overflow-hidden rounded-full bg-amber-100">
              {stats && (
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.max(0, stats.todayCompletionRate))}%`,
                  }}
                />
              )}
            </div>
            <p className="mb-4 text-sm leading-5 text-slate-600">
              {stats
                ? stats.todayCompletionRate === 100
                  ? 'Amazing! Everything planned for today is complete.'
                  : 'A little progress every day makes a big difference.'
                : 'Start tracking today’s study tasks.'}
            </p>
            <Link href={`/students/${s.id}/today`}>
              <Button size="sm" variant="secondary">
                Open today&apos;s list
              </Button>
            </Link>
          </div>

          {/* Brain challenge */}
          <div className="relative overflow-hidden rounded-2xl bg-violet-50/70 p-5">
            <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-violet-200/40" />
            <div className="relative">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-violet-950">
                    Brain Challenge
                  </p>
                  <p className="mt-0.5 text-xs text-violet-700/70">
                    Learn. Think. Have fun.
                  </p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-violet-600 shadow-sm">
                  🧠
                </div>
              </div>
              <div className="mb-5">
                <p className="text-2xl font-bold text-slate-900">
                  3 quick questions
                </p>
                <p className="mt-2 text-sm leading-5 text-slate-600">
                  A short daily challenge to keep curiosity and problem-solving
                  skills active.
                </p>
              </div>
              <Link href={`/students/${s.id}/daily-challenge`}>
                <Button size="sm" variant="secondary">
                  Play today&apos;s quiz
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Secondary actions */}
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">
              Need to update something?
            </p>
            <p className="text-xs text-slate-500">
              Log a test result, start a new exam cycle, or manage this child.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/students/${s.id}/add-test-marks`}>
              <Button size="sm" variant="ghost">
                Log a test
              </Button>
            </Link>
            {!examOver && (
              <Link href={`/students/${s.id}/new-exam`}>
                <Button size="sm" variant="ghost">
                  New exam cycle
                </Button>
              </Link>
            )}
            <Link href={`/students/${s.id}/settings`}>
              <Button size="sm" variant="ghost">
                Settings
              </Button>
            </Link>
            {onDelete && (
              <Button size="sm" variant="ghost" onClick={() => onDelete(s)}>
                <span className="text-red-600">Delete child</span>
              </Button>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
