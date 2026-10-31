'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { Input } from '@/components/ui/Input';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ExamOverNotice } from '@/components/exam/ExamOverNotice';
import { api, ApiError } from '@/lib/api-client';
import { BufferWeekChoiceModal } from '@/components/plan/BufferWeekChoiceModal';
import {
  BufferWeekToggle,
  hasBufferRunway,
} from '@/components/plan/BufferWeekToggle';
import {
  MIN_SCHOOL_DAY_MINUTES,
  MIN_HOLIDAY_DAY_MINUTES,
} from '@/lib/utils/study-limits';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface Student {
  id: string;
  name: string;
  grade: string;
  studyDays: string[];
  schoolDayMinutes: number;
  holidayDayMinutes: number;
}

interface Exam {
  id: string;
  name: string;
  examDate: string;
  isPrimary: boolean;
}

interface StudentDetail {
  student: Student;
  exams: Exam[];
  currentExamId: string | null;
  currentExamOver: boolean;
  latestPlan: { id: string; useBufferWeek: boolean } | null;
}

const cardClass =
  'rounded-[32px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-8';

const pillBase =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60';
const pillBlack = `${pillBase} bg-black text-white hover:bg-black/80`;
const pillGrey = `${pillBase} bg-[#F0EFED] text-black hover:bg-[#E7E5E2]`;

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

function CardTitle({
  emoji,
  tone,
  title,
  description,
}: {
  emoji: string;
  tone: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mb-6 flex items-start gap-4">
      <div
        className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] text-2xl ${tone}`}
      >
        {emoji}
      </div>

      <div className="min-w-0">
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
          {title}
        </h2>

        {description && (
          <p className="mt-1 text-sm leading-6 text-[#65615D] sm:text-base">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

export default function StudentSettingsPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [studyDays, setStudyDays] = useState<string[]>([]);
  const [schoolDayMinutes, setSchoolDayMinutes] = useState(45);
  const [holidayDayMinutes, setHolidayDayMinutes] = useState(90);
  const [examDate, setExamDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showBufferChoice, setShowBufferChoice] = useState(false);

  // Buffer-week choice when regenerating. null means untouched: nothing is
  // sent and the plan keeps the setting it already has.
  const [bufferChoice, setBufferChoice] = useState<boolean | null>(null);

  useEffect(() => {
    api
      .get<StudentDetail>(`/api/students/${params.id}`)
      .then((data) => {
        setDetail(data);
        setStudyDays(data.student.studyDays);
        setSchoolDayMinutes(data.student.schoolDayMinutes);
        setHolidayDayMinutes(data.student.holidayDayMinutes);
        const primaryExam = data.exams.find((e) => e.id === data.currentExamId);
        if (primaryExam) setExamDate(primaryExam.examDate);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError("Couldn't load settings. Please try refreshing.");
      });
  }, [params.id, router]);

  function toggleDay(day: string) {
    setStudyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  // Validates before opening either confirmation dialog, so the parent
  // sees the problem immediately instead of after clicking Continue.
  function handleSaveClick() {
    let problem: string | null = null;
    if (studyDays.length === 0) {
      problem = 'Select at least one study day.';
    } else if (schoolDayMinutes < MIN_SCHOOL_DAY_MINUTES) {
      problem = `School days need at least ${MIN_SCHOOL_DAY_MINUTES} minutes of study time.`;
    } else if (holidayDayMinutes < MIN_HOLIDAY_DAY_MINUTES) {
      problem = `Weekends and holidays need at least ${MIN_HOLIDAY_DAY_MINUTES} minutes (1.5 hours) of study time.`;
    }

    if (problem) {
      setError(problem);
      setMessage(null);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setError(null);
    if (detail?.latestPlan) setShowConfirm(true);
    else setShowBufferChoice(true);
  }

  async function handleSaveAndRegenerate(useBufferWeek?: boolean) {
    setShowConfirm(false);
    setShowBufferChoice(false);
    setError(null);
    setMessage(null);
    setIsSaving(true);
    try {
      // One request: the preferences, the exam date and the plan are saved
      // together, or not at all.
      const { planId } = await api.put<{ planId: string | null }>(
        `/api/students/${params.id}/settings`,
        {
          studyDays,
          schoolDayMinutes,
          holidayDayMinutes,
          examDate: examDate || undefined,
          useBufferWeek: detail?.latestPlan
            ? (bufferChoice ?? undefined)
            : (useBufferWeek ?? false),
        },
      );
      if (planId) {
        router.push(`/students/${params.id}/plan?planId=${planId}`);
        return;
      }
      setMessage(
        'Preferences saved. Add an exam before a plan can be generated.',
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save changes. Please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

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

          {/* HEADER ACTIONS */}
          <div className="flex items-center gap-2.5">
            <Link
              href={`/students/${params.id}/profile`}
              className="hidden h-14 items-center justify-center rounded-full px-5 text-base font-semibold transition hover:bg-black/5 sm:flex"
            >
              Profile
            </Link>

            <Link
              href={`/students/${params.id}/plan`}
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#F0EFED] px-5 text-sm font-semibold transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:px-6 sm:text-base"
            >
              <ArrowLeftIcon />
              <span>
                Back<span className="hidden sm:inline"> to plan</span>
              </span>
            </Link>
          </div>
        </div>
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
        {!detail && !error && (
          <div className="space-y-7">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* EXAM OVER */}
        {detail &&
          detail.currentExamOver &&
          (() => {
            const over = detail.exams.find(
              (e) => e.id === detail.currentExamId,
            );
            return over ? (
              <>
                <section className="mb-8 sm:mb-10">
                  <h1 className="dashboard-headline relative inline-block max-w-full text-[clamp(1.15rem,5.1vw,4rem)] font-extrabold leading-tight tracking-[-0.045em]">
                    {detail.student.name}&apos;s settings.
                  </h1>
                </section>

                <ExamOverNotice
                  studentId={params.id}
                  examName={over.name}
                  examDate={over.examDate}
                />
              </>
            ) : null;
          })()}

        {detail && !detail.currentExamOver && (
          <>
            {/* HERO SECTION */}
            <section className="mb-8 sm:mb-10">
              <h1 className="dashboard-headline relative inline-block max-w-full text-[clamp(1.15rem,5.1vw,4rem)] font-extrabold leading-tight tracking-[-0.045em]">
                {detail.student.name}&apos;s settings.
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
                Planning inputs. Name, grade and school are in the{' '}
                <Link
                  href={`/students/${params.id}/profile`}
                  className="font-semibold underline underline-offset-4 transition hover:text-black/60"
                >
                  student profile
                </Link>
                .
              </p>
            </section>

            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
              {/* STUDY AVAILABILITY */}
              <section className={cardClass}>
                <CardTitle
                  emoji="🗓️"
                  tone="bg-[#F7CC46]"
                  title="Study availability"
                  description="Pick the days and how long each one can be."
                />

                <p className="mb-3 text-xs font-bold uppercase tracking-wide">
                  Study days
                </p>

                <div className="mb-7 flex flex-wrap gap-2">
                  {ALL_DAYS.map((day) => (
                    <button
                      key={day}
                      type="button"
                      aria-pressed={studyDays.includes(day)}
                      onClick={() => toggleDay(day)}
                      className={clsx(
                        'rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-95 sm:text-base',
                        studyDays.includes(day)
                          ? 'bg-black text-white'
                          : 'bg-[#F0EFED] text-black hover:bg-[#E7E5E2]',
                      )}
                    >
                      {day}
                    </button>
                  ))}
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="Minutes on school days"
                    hint={`Minimum ${MIN_SCHOOL_DAY_MINUTES} minutes (45 minutes)`}
                    type="number"
                    min={MIN_SCHOOL_DAY_MINUTES}
                    value={schoolDayMinutes}
                    onChange={(e) =>
                      setSchoolDayMinutes(Number(e.target.value))
                    }
                  />
                  <Input
                    label="Minutes on weekends & holidays"
                    hint={`Minimum ${MIN_HOLIDAY_DAY_MINUTES} minutes (1.5 hours)`}
                    type="number"
                    min={MIN_HOLIDAY_DAY_MINUTES}
                    value={holidayDayMinutes}
                    onChange={(e) =>
                      setHolidayDayMinutes(Number(e.target.value))
                    }
                  />
                </div>
              </section>

              <div className="flex flex-col gap-6">
                {/* SUBJECTS, TOPICS AND MARKS */}
                <section className={cardClass}>
                  <CardTitle
                    emoji="📚"
                    tone="bg-[#a4e5c7]"
                    title="Subjects, topics and marks"
                    description="Change what the plan is built from, for example after moving up a class."
                  />

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/students/${params.id}/subjects`}
                      className={pillGrey}
                    >
                      Manage subjects &amp; topics
                    </Link>

                    <Link
                      href={`/students/${params.id}/tests`}
                      className={pillGrey}
                    >
                      Edit test marks
                    </Link>
                  </div>
                </section>

                {/* NEXT EXAM */}
                <section className={cardClass}>
                  <CardTitle emoji="🎯" tone="bg-[#a8acf0]" title="Next exam" />

                  <Input
                    label="Exam date"
                    type="date"
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                  />
                </section>
              </div>
            </div>

            {/* SUCCESS MESSAGE */}
            {message && (
              <div className="mt-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {message}
              </div>
            )}

            {/* SAVE */}
            <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:flex-row sm:items-center sm:justify-between">
              <p className="max-w-2xl text-sm leading-6 text-[#65615D] sm:text-base">
                {detail.latestPlan
                  ? 'Sessions already marked complete are kept; everything else is rebuilt from today.'
                  : 'This creates the first study plan for this exam, based on the settings above.'}
              </p>

              <button
                type="button"
                onClick={handleSaveClick}
                disabled={isSaving}
                className="inline-flex w-fit shrink-0 items-center justify-center gap-2 rounded-full bg-[#F7CC46] px-6 py-3.5 text-sm font-semibold text-black shadow-[0_5px_12px_rgba(0,0,0,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F0C33A] hover:shadow-[0_7px_16px_rgba(0,0,0,0.10)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:px-7 sm:py-4 sm:text-base"
              >
                {isSaving
                  ? 'Saving…'
                  : detail.latestPlan
                    ? 'Save & regenerate plan'
                    : 'Save & generate plan'}
              </button>
            </div>
          </>
        )}

        {/* REGENERATE CONFIRMATION MODAL */}
        {showConfirm && detail?.latestPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-[26px] bg-white p-6 shadow-2xl">
              <h2 className="mb-2 text-lg font-bold">
                Regenerate the study plan?
              </h2>

              <p className="mb-5 text-sm leading-6 text-[#65615D]">
                This will save your changes and rebuild the schedule around
                them. Sessions already marked complete stay as they are —
                everything else from today onward gets rescheduled.
              </p>

              <div className="mb-6">
                <BufferWeekToggle
                  checked={bufferChoice ?? detail.latestPlan.useBufferWeek}
                  onChange={setBufferChoice}
                  runwayOk={hasBufferRunway(examDate)}
                  disabled={isSaving}
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className={pillGrey}
                  onClick={() => setShowConfirm(false)}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className={pillBlack}
                  disabled={isSaving}
                  onClick={() => handleSaveAndRegenerate()}
                >
                  {isSaving ? 'Saving…' : 'Continue'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BUFFER WEEK MODAL (first plan) */}
        {showBufferChoice &&
          detail &&
          !detail.latestPlan &&
          (() => {
            const primaryExam = detail.exams.find(
              (e) => e.id === detail.currentExamId,
            );
            if (!primaryExam) return null;
            const daysUntilExam = Math.ceil(
              (new Date(primaryExam.examDate).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24),
            );
            return (
              <BufferWeekChoiceModal
                examDateLabel={new Date(
                  primaryExam.examDate,
                ).toLocaleDateString()}
                minimumRunwayOk={daysUntilExam > 7}
                onChoose={(useBufferWeek) =>
                  handleSaveAndRegenerate(useBufferWeek)
                }
                onCancel={() => setShowBufferChoice(false)}
              />
            );
          })()}
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
            className="flex flex-col items-center gap-1 py-3 text-black"
          >
            <span className="text-xl">●</span>
            <span className="text-[10px] font-bold">You</span>
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
