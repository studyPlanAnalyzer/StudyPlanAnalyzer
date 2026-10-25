'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold text-indigo-700"
          >
            StudyPlan Analyzer
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <Link
              href={`/students/${params.id}/plan`}
              className="hover:text-slate-800"
            >
              Plan
            </Link>
            <Link
              href={`/students/${params.id}/profile`}
              className="hover:text-slate-800"
            >
              Profile
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {!detail && (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {detail &&
          detail.currentExamOver &&
          (() => {
            const over = detail.exams.find(
              (e) => e.id === detail.currentExamId,
            );
            return over ? (
              <>
                <h1 className="mb-4 text-2xl font-semibold text-slate-900">
                  {detail.student.name}&apos;s settings
                </h1>
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
            <h1 className="mb-1 text-2xl font-semibold text-slate-900">
              {detail.student.name}&apos;s settings
            </h1>
            <p className="mb-6 text-sm text-slate-500">
              Planning inputs. Name, grade and school are in the{' '}
              <Link
                href={`/students/${params.id}/profile`}
                className="text-indigo-600 hover:underline"
              >
                student profile
              </Link>
              .
            </p>

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            <Card className="mb-6">
              <h2 className="mb-4 text-base font-semibold text-slate-900">
                Study availability
              </h2>

              <p className="mb-2 text-sm font-medium text-slate-700">
                Study days
              </p>
              <div className="mb-5 flex flex-wrap gap-2">
                {ALL_DAYS.map((day) => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => toggleDay(day)}
                    className={clsx(
                      'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                      studyDays.includes(day)
                        ? 'border-indigo-600 bg-indigo-600 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50',
                    )}
                  >
                    {day}
                  </button>
                ))}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Minutes on school days"
                  hint={`Minimum ${MIN_SCHOOL_DAY_MINUTES} minutes (45 minutes)`}
                  type="number"
                  min={MIN_SCHOOL_DAY_MINUTES}
                  value={schoolDayMinutes}
                  onChange={(e) => setSchoolDayMinutes(Number(e.target.value))}
                />
                <Input
                  label="Minutes on weekends & holidays"
                  hint={`Minimum ${MIN_HOLIDAY_DAY_MINUTES} minutes (1.5 hours)`}
                  type="number"
                  min={MIN_HOLIDAY_DAY_MINUTES}
                  value={holidayDayMinutes}
                  onChange={(e) => setHolidayDayMinutes(Number(e.target.value))}
                />
              </div>
            </Card>

            <Card className="mb-6">
              <h2 className="mb-1 text-base font-semibold text-slate-900">
                Subjects, topics and marks
              </h2>
              <p className="mb-4 text-sm text-slate-500">
                Change what the plan is built from, for example after moving up
                a class.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link href={`/students/${params.id}/subjects`}>
                  <Button variant="secondary" size="sm">
                    Manage subjects &amp; topics
                  </Button>
                </Link>
                <Link href={`/students/${params.id}/tests`}>
                  <Button variant="secondary" size="sm">
                    Edit test marks
                  </Button>
                </Link>
              </div>
            </Card>

            <Card className="mb-6">
              <h2 className="mb-4 text-base font-semibold text-slate-900">
                Next exam
              </h2>
              <Input
                label="Exam date"
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
              />
            </Card>

            {message && (
              <p className="mb-4 text-sm text-green-600">{message}</p>
            )}

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleSaveClick} isLoading={isSaving}>
                {detail.latestPlan
                  ? 'Save & regenerate plan'
                  : 'Save & generate plan'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {detail.latestPlan
                ? 'Sessions already marked complete are kept; everything else is rebuilt from today.'
                : 'This creates the first study plan for this exam, based on the settings above.'}
            </p>
          </>
        )}

        {showConfirm && detail?.latestPlan && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
            <Card className="w-full max-w-sm">
              <h2 className="mb-2 text-base font-semibold text-slate-900">
                Regenerate the study plan?
              </h2>
              <p className="mb-4 text-sm text-slate-600">
                This will save your changes and rebuild the schedule around
                them. Sessions already marked complete stay as they are —
                everything else from today onward gets rescheduled.
              </p>
              <div className="mb-4">
                <BufferWeekToggle
                  checked={bufferChoice ?? detail.latestPlan.useBufferWeek}
                  onChange={setBufferChoice}
                  runwayOk={hasBufferRunway(examDate)}
                  disabled={isSaving}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setShowConfirm(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleSaveAndRegenerate()}
                  isLoading={isSaving}
                >
                  Continue
                </Button>
              </div>
            </Card>
          </div>
        )}

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
    </div>
  );
}
