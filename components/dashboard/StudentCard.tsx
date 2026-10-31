'use client';

import Link from 'next/link';
import type { TodoStats } from '@/lib/types/todo';
import type { BillingInfo } from '@/lib/billing/pricing';

export interface StudentSummary {
  id: string;
  name: string;
  grade: string;
  subjectsCount: number;
  examsCount: number;
  nextExam: { name: string; examDate: string } | null;
  billing?: BillingInfo;
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

// Small inline icons: no additional icon dependency required.

function BookIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8"
    >
      <path d="M12 7v14" />
      <path d="M3 5.5A2.5 2.5 0 0 1 5.5 3H12v18H5.5A2.5 2.5 0 0 0 3 23z" />
      <path d="M21 5.5A2.5 2.5 0 0 0 18.5 3H12v18h6.5a2.5 2.5 0 0 1 2.5 2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </svg>
  );
}

function BrainIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-8 w-8"
    >
      <path d="M12 4.5a3.5 3.5 0 0 0-6.5 1.8A4 4 0 0 0 4 13.5a4 4 0 0 0 3.5 6.3A3.5 3.5 0 0 0 12 18.5z" />
      <path d="M12 4.5a3.5 3.5 0 0 1 6.5 1.8A4 4 0 0 1 20 13.5a4 4 0 0 1-3.5 6.3A3.5 3.5 0 0 1 12 18.5z" />
      <path d="M8 9.5c2 0 2.5 1.5 2.5 2.5S10 14.5 8 14.5M16 9.5c-2 0-2.5 1.5-2.5 2.5s.5 2.5 2.5 2.5M12 4.5v14" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      <path d="m12 3 9 4.5-9 4.5-9-4.5z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </svg>
  );
}

function FlameIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7"
    >
      <path d="M12 22a7 7 0 0 0 7-7c0-3.5-2-5.5-4-7-1 3-2 3-2 3 0-4-2-7-5-9 0 4-1 6-3 9a7 7 0 0 0 7 11z" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h8" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="m19.4 15 .1.1 1.1.9-1.5 2.6-1.4-.6a8 8 0 0 1-1.7 1l-.2 1.5h-3l-.2-1.5a8 8 0 0 1-1.7-1l-1.4.6-1.5-2.6 1.1-.9a8 8 0 0 1 0-2l-1.1-.9 1.5-2.6 1.4.6a8 8 0 0 1 1.7-1l.2-1.5h3l.2 1.5a8 8 0 0 1 1.7 1l1.4-.6 1.5 2.6-1.1.9a8 8 0 0 1-.1 2z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      <path d="M3 6h18M8 6V4h8v2m3 0-1 15H6L5 6m4 4v7m6-7v7" />
    </svg>
  );
}

const pill =
  'inline-flex items-center justify-center gap-2 rounded-full bg-black px-5 py-2.5 text-sm font-bold text-white transition hover:bg-black/80 active:scale-95';

const managementButton =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#F0EFED] px-4 py-2.5 text-sm font-semibold text-black transition hover:bg-[#E5E3E0] active:scale-95';

const cardLabel =
  'inline-flex w-fit items-center rounded-full bg-black px-3 py-1.5 text-[11px] font-extrabold uppercase tracking-wide text-white';

export function StudentCard({ student: s, stats, onDelete }: StudentCardProps) {
  const billing = s.billing;

  const locked =
    !!billing && (billing.state === 'locked' || billing.state === 'unpaid');

  const daysUntilExam = s.nextExam ? getDaysUntil(s.nextExam.examDate) : null;

  const examPassed = daysUntilExam !== null && daysUntilExam < 0;

  const examToday = daysUntilExam === 0;

  const examOver = s.nextExam
    ? new Date(`${s.nextExam.examDate}T00:00:00.000Z`).getTime() <= Date.now()
    : false;

  const completion = stats
    ? Math.min(100, Math.max(0, stats.todayCompletionRate))
    : 0;

  const streak = stats?.currentStreak ?? 0;

  const paymentMessage = !billing
    ? null
    : billing.state === 'pending'
      ? 'Payment will be verified within 24 hours.'
      : billing.state === 'grace'
        ? `Payment due. The app locks on ${
            billing.graceEndsAt
              ? new Date(billing.graceEndsAt).toLocaleDateString()
              : 'soon'
          }.`
        : billing.paymentStatus === 'rejected'
          ? 'Payment not verified. Please pay again to unlock.'
          : locked
            ? 'Payment needed. Pay to unlock this child.'
            : null;

  return (
    <section className="mx-auto w-full max-w-[1400px] rounded-[30px] bg-white p-4 shadow-[0_12px_30px_rgba(0,0,0,0.12)] sm:p-6 md:p-7 lg:p-8">
      {/* Student header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-5 sm:mb-6">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-[66px] w-[66px] shrink-0 rotate-[-5deg] items-center justify-center rounded-[27px] bg-[#A5A9F0] text-3xl font-black text-black">
            {initials(s.name)}
          </div>

          <div className="min-w-0">
            <h2 className="truncate text-[25px] font-black leading-tight tracking-tight text-black sm:text-[29px]">
              {s.name}
            </h2>

            <p className="mt-1 text-sm font-medium text-[#65615D]">
              Grade {s.grade} · {s.subjectsCount} subjects
            </p>
          </div>
        </div>

        {/* Exam and streak statistics */}
        <div className="ml-auto flex items-center gap-5 sm:gap-8">
          <div className="flex items-center gap-2">
            <div className="text-[#A5A9F0]">
              <LayersIcon />
            </div>

            <div>
              <p className="text-xs text-[#65615D]">Exams</p>
              <p className="text-lg font-bold leading-tight text-black">
                {s.examsCount}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="text-[#F2A99F]">
              <FlameIcon />
            </div>

            <div>
              <p className="text-xs text-[#65615D]">Streak</p>
              <p className="text-lg font-bold leading-tight text-black">
                {streak} days
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Payment notification */}
      {paymentMessage && (
        <div className="mb-7 flex flex-col justify-between gap-3 rounded-full bg-[#F0EFED] px-5 py-3 sm:flex-row sm:items-center">
          <p className="text-sm font-medium text-black">⏳ {paymentMessage}</p>

          {billing?.due && (
            <Link
              href={`/students/${s.id}/pay`}
              className="inline-flex w-fit rounded-full bg-black px-5 py-2 text-xs font-bold text-white transition hover:bg-black/80"
            >
              {locked ? 'Pay to unlock' : 'Pay now'}
            </Link>
          )}
        </div>
      )}

      {/* Three main dashboard cards */}
      <div className="grid grid-cols-1 items-stretch gap-5 pb-7 md:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {/* STUDY PROGRESS - YELLOW */}
        <div className="group min-w-0 rounded-[25px] border-[6px] border-white bg-[#F7CC46] p-5 shadow-[0_12px_22px_rgba(0,0,0,0.13)] transition-transform duration-200 hover:-translate-y-1 hover:rotate-0 sm:p-6 lg:min-h-[450px] lg:rotate-[-1.2deg]">
          <div className="mb-7 flex items-center justify-between gap-3">
            <span className={cardLabel}>Study Progress</span>

            <div className="text-black">
              <BookIcon />
            </div>
          </div>

          <h3 className="mb-6 text-[25px] font-black leading-tight tracking-tight text-black sm:text-[27px]">
            Exams & prep
          </h3>

          <div className="mb-5 flex items-center gap-10">
            <div>
              <p className="text-4xl font-black leading-none text-black">
                {s.subjectsCount}
              </p>
              <p className="mt-1 text-sm font-medium text-black">Subjects</p>
            </div>

            <div>
              <p className="text-4xl font-black leading-none text-black">
                {s.examsCount}
              </p>
              <p className="mt-1 text-sm font-medium text-black">Exams</p>
            </div>
          </div>

          {/* Next exam */}
          <div className="mb-5 rounded-[23px] bg-[#FCE9B9] px-4 py-4">
            <p className="mb-1 text-[11px] font-extrabold uppercase tracking-wide text-black">
              Next exam
            </p>

            {s.nextExam ? (
              <>
                <p className="text-lg font-bold leading-tight text-black">
                  {s.nextExam.name}
                </p>

                <p className="mt-1 text-sm font-medium text-black/80">
                  {new Date(s.nextExam.examDate).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </p>

                <p className="mt-2 text-xs font-bold text-black">
                  {examPassed
                    ? 'Date passed'
                    : examToday
                      ? 'Exam today!'
                      : `${daysUntilExam} days remaining`}
                </p>
              </>
            ) : (
              <>
                <p className="text-base font-bold text-black">
                  No upcoming exam
                </p>
                <p className="mt-1 text-sm text-black/70">
                  Start planning your next exam.
                </p>
              </>
            )}
          </div>

          {/* Study actions */}
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/students/${s.id}/plan`} className={pill}>
              View plan
            </Link>

            <Link
              href={`/students/${s.id}/analysis`}
              className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-bold text-black transition hover:bg-black/5 active:scale-95"
            >
              Analysis
            </Link>
          </div>
        </div>

        {/* TODAY'S HABITS - MINT */}
        <div className="group min-w-0 rounded-[25px] border-[6px] border-white bg-[#9DDFC2] p-5 shadow-[0_12px_22px_rgba(0,0,0,0.13)] transition-transform duration-200 hover:-translate-y-1 hover:rotate-0 sm:p-6 lg:min-h-[450px] lg:rotate-[0.8deg]">
          <div className="mb-7 flex items-center justify-between gap-3">
            <span className={cardLabel}>Today&apos;s Habits</span>

            <div className="text-black">
              <CheckIcon />
            </div>
          </div>

          <h3 className="mb-7 max-w-[240px] text-[25px] font-black leading-tight tracking-tight text-black sm:text-[27px]">
            Keep the momentum
          </h3>

          {/* Completion percentage */}
          <div className="mb-1">
            <p className="text-[54px] font-black leading-none tracking-tight text-black">
              {stats ? `${stats.todayCompletionRate}%` : '—'}
            </p>
          </div>

          <div className="mb-3 mt-4 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-black">completed today</p>

            {stats && (
              <p className="text-sm font-extrabold text-black">{completion}%</p>
            )}
          </div>

          {/* Progress bar */}
          <div className="mb-6 h-3 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-black transition-all duration-500"
              style={{ width: `${completion}%` }}
            />
          </div>

          <p className="mb-6 text-sm leading-6 text-black">
            {stats
              ? stats.todayCompletionRate === 100
                ? 'Amazing! Everything planned for today is complete.'
                : 'A little progress every day makes a big difference.'
              : 'Start tracking your daily study tasks and build consistency.'}
          </p>

          <Link href={`/students/${s.id}/today`} className={pill}>
            Open today&apos;s list
          </Link>
        </div>

        {/* BRAIN CHALLENGE - LAVENDER */}
        <div className="group min-w-0 rounded-[25px] border-[6px] border-white bg-[#A5A9F0] p-5 shadow-[0_12px_22px_rgba(0,0,0,0.13)] transition-transform duration-200 hover:-translate-y-1 hover:rotate-0 sm:p-6 lg:min-h-[450px] lg:rotate-[-0.6deg]">
          <div className="mb-7 flex items-center justify-between gap-3">
            <span className={cardLabel}>Brain Challenge</span>

            <div className="text-black">
              <BrainIcon />
            </div>
          </div>

          <h3 className="mb-5 text-[25px] font-black leading-tight tracking-tight text-black sm:text-[27px]">
            3 quick questions
          </h3>

          <p className="mb-7 text-[15px] leading-6 text-black">
            A short daily challenge to keep curiosity and problem-solving
            active.
          </p>

          {/* Quiz information */}
          <div className="mb-2 flex items-center justify-between text-sm font-medium text-black">
            <span>3 questions</span>
            <span className="font-bold">~2 min</span>
          </div>

          <div className="mb-7 h-3 overflow-hidden rounded-full bg-black/10">
            <div className="h-full w-[3%] rounded-full bg-black" />
          </div>

          <Link href={`/students/${s.id}/daily-challenge`} className={pill}>
            Play today&apos;s quiz
          </Link>
        </div>
      </div>

      {/* MANAGEMENT SECTION */}
      <div className="flex flex-col gap-5 rounded-[27px] border-2 border-dashed border-[#DEDCD8] px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-bold tracking-tight text-black">
            Need to update something?
          </h3>

          <p className="mt-1 text-sm leading-5 text-[#65615D]">
            Log a test, start a new exam cycle, or manage this child.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/students/${s.id}/add-test-marks`}
            className={managementButton}
          >
            <FileIcon />
            Log a test
          </Link>

          <Link
            href={`/students/${s.id}/new-exam`}
            className={managementButton}
          >
            <ResetIcon />
            New exam cycle
          </Link>

          <Link
            href={`/students/${s.id}/settings`}
            className={managementButton}
          >
            <SettingsIcon />
            Settings
          </Link>

          {onDelete && (
            <button
              type="button"
              onClick={() => onDelete(s)}
              className="inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-red-600 transition hover:bg-red-50 active:scale-95"
            >
              <TrashIcon />
              Delete child
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
