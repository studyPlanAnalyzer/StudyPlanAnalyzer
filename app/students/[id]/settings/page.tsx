'use client';

import { useEffect, useState, use } from 'react';
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
import { cardClass } from '@/components/ui/Card';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, BackLink, headerLinkClass } from '@/components/ui/AppHeader';
import { Notice } from '@/components/ui/Notice';
import { PageTitle } from '@/components/ui/PageTitle';
import { buttonClass } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { StudentBottomNav } from '@/components/ui/StudentBottomNav';

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

const sectionCard = `${cardClass} p-6 sm:p-8`;

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

export default function StudentSettingsPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = use(props.params);
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
    <PageShell withBottomNav>
      <AppHeader>
        <Link
          href={`/students/${params.id}/profile`}
          className={`hidden sm:flex ${headerLinkClass}`}
        >
          Profile
        </Link>
        <BackLink href={`/students/${params.id}/plan`} label="Back to plan" short="Back" />
      </AppHeader>

      <PageMain>
        {/* ERROR MESSAGE */}
        {error && (
          <Notice className="mb-6">
            {error}
          </Notice>
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
                  <PageTitle>
                    {detail.student.name}&apos;s settings.
                  </PageTitle>
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
              <PageTitle>
                {detail.student.name}&apos;s settings.
              </PageTitle>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
                Planning inputs. Name, grade and school are in the{' '}
                <Link
                  href={`/students/${params.id}/profile`}
                  className="-my-3.5 inline-block py-3.5 font-semibold underline underline-offset-4 transition hover:text-black/60"
                >
                  student profile
                </Link>
                .
              </p>
            </section>

            <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
              {/* STUDY AVAILABILITY */}
              <section className={sectionCard}>
                <CardTitle
                  emoji="🗓️"
                  tone="bg-[#F7CC46]"
                  title="Study availability"
                  description="Pick the days and how long each one can be."
                />

                <p className="mb-3 text-sm font-bold uppercase tracking-wide">
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
                        'inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold transition-all duration-200 active:scale-95 sm:text-base',
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
                <section className={sectionCard}>
                  <CardTitle
                    emoji="📚"
                    tone="bg-[#a4e5c7]"
                    title="Subjects, topics and marks"
                    description="Change what the plan is built from, for example after moving up a class."
                  />

                  <div className="flex flex-wrap gap-3">
                    <Link
                      href={`/students/${params.id}/subjects`}
                      className={buttonClass('secondary')}
                    >
                      Manage subjects &amp; topics
                    </Link>

                    <Link
                      href={`/students/${params.id}/tests`}
                      className={buttonClass('secondary')}
                    >
                      Edit test marks
                    </Link>
                  </div>
                </section>

                {/* NEXT EXAM */}
                <section className={sectionCard}>
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
              <Notice tone="success" className="mt-6">
                {message}
              </Notice>
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
                className={buttonClass('yellow', 'lg', 'w-fit')}
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
          <Modal className="max-w-md">
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

              <div className="flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className={buttonClass('secondary')}
                  onClick={() => setShowConfirm(false)}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className={buttonClass('primary')}
                  disabled={isSaving}
                  onClick={() => handleSaveAndRegenerate()}
                >
                  {isSaving ? 'Saving…' : 'Continue'}
                </button>
              </div>
          </Modal>
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
      </PageMain>

      <StudentBottomNav studentId={params.id} active="you" />
    </PageShell>
  );
}
