'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { subjectClashFor } from '@/lib/subject-name';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api-client';
import { suggestTopicsFor } from '@/lib/common-topics';
import {
  MIN_SCHOOL_DAY_MINUTES,
  MIN_HOLIDAY_DAY_MINUTES,
} from '@/lib/utils/study-limits';
import clsx from 'clsx';

const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const STEP_LABELS = [
  'Add child',
  'Availability',
  'Next exam',
  'Subjects',
  'Enter marks',
  'Add topics',
];
const TOTAL_STEPS = 6;

const STEP_META: { title: string; description: string }[] = [
  {
    title: 'Tell us about your child.',
    description: 'Name, grade and school.',
  },
  {
    title: 'When can they study?',
    description: 'Pick the days and how long each one can be.',
  },
  {
    title: "What's the next exam?",
    description: "We'll build the study plan around this date.",
  },
  {
    title: 'Which subjects are being tested?',
    description: 'Add each subject, its full marks and how much it weighs.',
  },
  {
    title: 'Enter marks from the latest marksheet.',
    description: 'These show where each subject is starting from.',
  },
  {
    title: 'Which topics need focus?',
    description:
      "We've suggested common topics. Untick anything that isn't relevant and set a difficulty (1 = easy, 5 = hardest).",
  },
];

const selectClass =
  'rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10';

const pillBase =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';
const pillBlack = `${pillBase} bg-black text-white hover:bg-black/80`;
const pillGrey = `${pillBase} bg-[#F0EFED] text-black hover:bg-[#E7E5E2]`;
const pillWhiteDanger = `${pillBase} bg-white text-red-600 hover:bg-red-50`;

const primaryBtn =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#F7CC46] px-6 py-3.5 text-sm font-semibold text-black shadow-[0_5px_12px_rgba(0,0,0,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F0C33A] hover:shadow-[0_7px_16px_rgba(0,0,0,0.10)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:px-7 sm:py-4 sm:text-base';

interface SubjectForm {
  name: string;
  fullMarks: number;
  examWeight: 'low' | 'medium' | 'high';
  obtainedMarks: string;
  confidenceLevel: 'low' | 'medium' | 'high';
  topics: { name: string; difficultyRating: number; selected: boolean }[];
}

const DEFAULT_SUBJECTS: SubjectForm[] = [
  'Mathematics',
  'Science',
  'English',
].map((name) => ({
  name,
  fullMarks: 100,
  examWeight: 'medium',
  obtainedMarks: '',
  confidenceLevel: 'medium',
  topics: suggestTopicsFor(name).map((t) => ({
    name: t,
    difficultyRating: 2,
    selected: true,
  })),
}));

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  // Step 1
  const [hadExams, setHadExams] = useState(true);
  const [child, setChild] = useState({ name: '', grade: '', schoolName: '' });
  // Step 2
  const [studyDays, setStudyDays] = useState<string[]>([
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sun',
  ]);
  const [schoolDayMinutes, setSchoolDayMinutes] = useState(
    MIN_SCHOOL_DAY_MINUTES,
  );
  const [holidayDayMinutes, setHolidayDayMinutes] = useState(90);
  // Step 3
  const [exam, setExam] = useState({ name: '', examDate: '' });
  // Steps 4-6
  const [subjects, setSubjects] = useState<SubjectForm[]>(DEFAULT_SUBJECTS);

  function toggleDay(day: string) {
    setStudyDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  }

  function addSubject() {
    setSubjects((prev) => [
      ...prev,
      {
        name: '',
        fullMarks: 100,
        examWeight: 'medium',
        obtainedMarks: '',
        confidenceLevel: 'medium',
        topics: [],
      },
    ]);
  }

  function updateSubject(index: number, patch: Partial<SubjectForm>) {
    setSubjects((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }

  function removeSubject(index: number) {
    setSubjects((prev) => prev.filter((_, i) => i !== index));
  }

  function refreshTopicSuggestions(index: number) {
    setSubjects((prev) =>
      prev.map((s, i) =>
        i === index
          ? {
              ...s,
              topics: suggestTopicsFor(s.name).map((t) => ({
                name: t,
                difficultyRating: 2,
                selected: true,
              })),
            }
          : s,
      ),
    );
  }

  function toggleTopic(subjectIndex: number, topicIndex: number) {
    setSubjects((prev) =>
      prev.map((s, i) =>
        i === subjectIndex
          ? {
              ...s,
              topics: s.topics.map((t, j) =>
                j === topicIndex ? { ...t, selected: !t.selected } : t,
              ),
            }
          : s,
      ),
    );
  }

  function setTopicDifficulty(
    subjectIndex: number,
    topicIndex: number,
    difficulty: number,
  ) {
    setSubjects((prev) =>
      prev.map((s, i) =>
        i === subjectIndex
          ? {
              ...s,
              topics: s.topics.map((t, j) =>
                j === topicIndex ? { ...t, difficultyRating: difficulty } : t,
              ),
            }
          : s,
      ),
    );
  }

  function addCustomTopic(subjectIndex: number, name: string) {
    if (!name.trim()) return;
    setSubjects((prev) =>
      prev.map((s, i) =>
        i === subjectIndex
          ? {
              ...s,
              topics: [
                ...s.topics,
                { name: name.trim(), difficultyRating: 2, selected: true },
              ],
            }
          : s,
      ),
    );
  }

  function validateStep(): string | null {
    if (step === 1) {
      if (!child.name.trim() || !child.schoolName.trim())
        return "Please enter the child's name and school name.";
      const grade = Number(child.grade);
      if (!Number.isInteger(grade) || grade < 4 || grade > 10)
        return 'Enter the grade as a number from 4 to 10.';
    }
    if (step === 2) {
      if (studyDays.length === 0) return 'Select at least one study day.';
      if (
        !Number.isInteger(schoolDayMinutes) ||
        !Number.isInteger(holidayDayMinutes) ||
        schoolDayMinutes <= 0 ||
        holidayDayMinutes <= 0
      )
        return 'Enter whole numbers of minutes for school days and holidays.';
      if (schoolDayMinutes < MIN_SCHOOL_DAY_MINUTES)
        return `School days need at least ${MIN_SCHOOL_DAY_MINUTES} minutes of study time.`;
      if (holidayDayMinutes < MIN_HOLIDAY_DAY_MINUTES)
        return `Weekends and holidays need at least ${MIN_HOLIDAY_DAY_MINUTES} minutes of study time.`;
    }
    if (step === 3) {
      if (!exam.name.trim() || !exam.examDate)
        return 'Please enter the exam name and date.';
      if (new Date(exam.examDate).getTime() <= Date.now())
        return 'Exam date must be in the future.';
    }
    if (step === 4) {
      if (subjects.length === 0 || subjects.some((s) => !s.name.trim()))
        return 'Add at least one named subject.';
      for (const [i, s] of subjects.entries()) {
        const clash = subjectClashFor(
          s.name,
          subjects.filter((_, j) => j < i).map((o) => o.name),
        );
        if (clash) return clash;
      }
    }
    if (step === 5) {
      for (const s of subjects) {
        const val = Number(s.obtainedMarks);
        if (
          s.obtainedMarks === '' ||
          Number.isNaN(val) ||
          val < 0 ||
          val > s.fullMarks
        ) {
          return `Enter valid marks for ${s.name} (0–${s.fullMarks}).`;
        }
      }
    }
    return null;
  }

  function goNext() {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      setCanRetry(false);
      return;
    }
    setError(null);
    setCanRetry(false);
    setStep((s) => Math.min(TOTAL_STEPS, s + 1));
  }

  function goBack() {
    setError(null);
    setCanRetry(false);
    setStep((s) => Math.max(1, s - 1));
  }

  const studentPayload = () => ({
    name: child.name.trim(),
    grade: child.grade.trim(),
    schoolName: child.schoolName.trim(),
    studyDays,
    schoolDayMinutes,
    holidayDayMinutes,
  });

  // "No previous exams": nothing is saved yet. The details are handed to the
  // new-session page, which saves the child and the rest in one go.
  function handleNewSession() {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      setCanRetry(false);
      return;
    }
    try {
      sessionStorage.setItem(
        'newSessionDraft',
        JSON.stringify({ student: studentPayload() }),
      );
    } catch {
      setError('Your browser blocked saving this step. Please try again.');
      return;
    }
    router.push('/students/new/new-session');
  }

  // Everything is saved in one request, so a failure leaves nothing behind
  // and retrying is always safe.
  async function handleFinish() {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      setCanRetry(false);
      return;
    }
    setError(null);
    setCanRetry(false);
    setIsSubmitting(true);

    try {
      const { studentId } = await api.post<{ studentId: string }>(
        '/api/onboarding',
        {
          student: studentPayload(),
          exam: { name: exam.name.trim(), examDate: exam.examDate },
          subjects: subjects.map((s) => ({
            name: s.name.trim(),
            fullMarks: s.fullMarks,
            examWeight: s.examWeight,
            obtainedMarks: Number(s.obtainedMarks),
            confidenceLevel: s.confidenceLevel,
            topics: s.topics
              .filter((t) => t.selected && t.name.trim())
              .map((t) => ({
                name: t.name.trim(),
                difficultyRating: t.difficultyRating,
              })),
          })),
        },
      );
      // The last step of setting up a new child is the payment.
      router.push(`/students/${studentId}/pay`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setCanRetry(err.retryable);
      } else {
        setError('Something went wrong while saving. Please try again.');
        setCanRetry(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const meta = STEP_META[step - 1];

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FAF9F6] pb-10 text-black">
      {/* HEADER */}
      <header className="relative z-30 bg-[#FAF9F6]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-5 py-5 sm:gap-6 sm:px-7 lg:px-0">
          {/* BRAND */}
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-3 sm:gap-4"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black text-xl font-bold text-white sm:h-14 sm:w-14 sm:text-2xl">
              S
            </div>

            <span className="truncate text-lg font-bold tracking-tight sm:text-2xl">
              StudyPlan Analyzer
            </span>
          </Link>

          {/* DASHBOARD - tablet and up */}
          <Link
            href="/dashboard"
            className="hidden h-14 items-center justify-center rounded-full bg-[#F0EFED] px-6 text-base font-semibold transition hover:bg-[#E7E5E2] active:scale-95 sm:flex"
          >
            Dashboard
          </Link>

          {/* HAMBURGER - phones */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#F0EFED] text-black transition hover:bg-[#E7E5E2] active:scale-95 sm:hidden"
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

        {/* Phones: dropdown menu */}
        {menuOpen && (
          <nav className="absolute left-0 right-0 top-full mx-5 flex flex-col gap-1 rounded-[26px] bg-white p-3 shadow-2xl sm:hidden">
            <Link
              href="/dashboard"
              onClick={() => setMenuOpen(false)}
              className="rounded-2xl px-4 py-3 text-sm font-semibold transition hover:bg-black/5"
            >
              ← Back to dashboard
            </Link>
          </nav>
        )}
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto w-full max-w-[1400px] px-5 pt-5 sm:px-7 sm:pt-8 lg:px-0">
        <div className="mx-auto max-w-4xl">
          {/* HERO SECTION */}
          <section className="mb-8 sm:mb-10">
            <span className="mb-5 inline-flex rounded-full bg-black px-5 py-2 text-xs font-bold uppercase tracking-wide text-white">
              Step {step} of {TOTAL_STEPS} · {STEP_LABELS[step - 1]}
            </span>

            <div>
              <h1
                key={step}
                className="dashboard-headline relative inline-block max-w-full text-[clamp(1.5rem,5.1vw,3.25rem)] font-extrabold leading-tight tracking-[-0.045em]"
              >
                {meta.title}
              </h1>
            </div>

            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
              {meta.description}
            </p>

            {/* PROGRESS */}
            <div className="mt-6 grid grid-cols-6 gap-2">
              {STEP_LABELS.map((label, i) => (
                <div key={label} className="min-w-0">
                  <div
                    className={clsx(
                      'h-2.5 rounded-full transition-colors',
                      i < step ? 'bg-black' : 'bg-[#E7E5E2]',
                    )}
                  />
                  <p
                    className={clsx(
                      'mt-2 hidden truncate text-xs sm:block',
                      i + 1 === step
                        ? 'font-bold text-black'
                        : 'font-semibold text-black/40',
                    )}
                  >
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* STEP CARD */}
          <div className="rounded-[32px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-8 lg:p-10">
            {step === 1 && (
              <div className="flex flex-col gap-5">
                <Input
                  label="Child's name"
                  value={child.name}
                  onChange={(e) => setChild({ ...child, name: e.target.value })}
                />

                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="Grade"
                    type="number"
                    min={4}
                    max={10}
                    placeholder="e.g. 9"
                    value={child.grade}
                    onChange={(e) =>
                      setChild({ ...child, grade: e.target.value })
                    }
                  />
                  <Input
                    label="School name"
                    value={child.schoolName}
                    onChange={(e) =>
                      setChild({ ...child, schoolName: e.target.value })
                    }
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <p className="text-xs font-bold uppercase tracking-wide">
                    Has this student already had exams this year?
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { label: 'Yes', value: true },
                      { label: 'No, new academic session', value: false },
                    ].map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        aria-pressed={hadExams === o.value}
                        onClick={() => setHadExams(o.value)}
                        className={clsx(
                          'rounded-full px-5 py-2.5 text-sm font-semibold transition-all duration-200 active:scale-95 sm:text-base',
                          hadExams === o.value
                            ? 'bg-black text-white'
                            : 'bg-[#F0EFED] text-black hover:bg-[#E7E5E2]',
                        )}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-6">
                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-wide">
                    Study days
                  </p>
                  <div className="flex flex-wrap gap-2">
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
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="Minutes available on school days"
                    hint={`Minimum ${MIN_SCHOOL_DAY_MINUTES} minutes (1 hour)`}
                    type="number"
                    min={MIN_SCHOOL_DAY_MINUTES}
                    value={schoolDayMinutes}
                    onChange={(e) =>
                      setSchoolDayMinutes(Number(e.target.value))
                    }
                  />
                  <Input
                    label="Minutes available on weekends & holidays"
                    hint={`Minimum ${MIN_HOLIDAY_DAY_MINUTES} minutes (1.5 hours)`}
                    type="number"
                    min={MIN_HOLIDAY_DAY_MINUTES}
                    value={holidayDayMinutes}
                    onChange={(e) =>
                      setHolidayDayMinutes(Number(e.target.value))
                    }
                  />
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="grid gap-5 sm:grid-cols-2">
                <Input
                  label="Exam name"
                  placeholder="e.g. Half-yearly 2026"
                  value={exam.name}
                  onChange={(e) => setExam({ ...exam, name: e.target.value })}
                />
                <Input
                  label="Exam date"
                  type="date"
                  value={exam.examDate}
                  onChange={(e) =>
                    setExam({ ...exam, examDate: e.target.value })
                  }
                />
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-4">
                {subjects.map((s, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-end gap-3 rounded-[26px] bg-[#F0EFED] p-5"
                  >
                    <Input
                      label="Subject"
                      className="min-w-[10rem] flex-1"
                      value={s.name}
                      onChange={(e) =>
                        updateSubject(i, { name: e.target.value })
                      }
                      onBlur={() => refreshTopicSuggestions(i)}
                    />
                    <Input
                      label="Full marks"
                      type="number"
                      className="w-28"
                      value={s.fullMarks}
                      onChange={(e) =>
                        updateSubject(i, { fullMarks: Number(e.target.value) })
                      }
                    />
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-black">
                        Exam weight
                      </label>
                      <select
                        className={selectClass}
                        value={s.examWeight}
                        onChange={(e) =>
                          updateSubject(i, {
                            examWeight: e.target
                              .value as SubjectForm['examWeight'],
                          })
                        }
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      className={pillWhiteDanger}
                      onClick={() => removeSubject(i)}
                    >
                      Remove
                    </button>
                    {(() => {
                      const clash = subjectClashFor(
                        s.name,
                        subjects.filter((_, j) => j !== i).map((o) => o.name),
                      );
                      return clash ? (
                        <p className="w-full text-sm font-medium text-red-700">
                          {clash}
                        </p>
                      ) : null;
                    })()}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addSubject}
                  className={`${pillGrey} self-start`}
                >
                  + Add subject
                </button>
              </div>
            )}

            {step === 5 && (
              <div className="flex flex-col gap-4">
                {subjects.map((s, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-end gap-3 rounded-[26px] bg-[#F0EFED] p-5"
                  >
                    <div className="min-w-[8rem] flex-1 self-center text-base font-extrabold tracking-tight sm:text-lg">
                      {s.name || 'Untitled'}
                    </div>
                    <Input
                      label={`Obtained (out of ${s.fullMarks})`}
                      type="number"
                      className="w-40"
                      value={s.obtainedMarks}
                      onChange={(e) =>
                        updateSubject(i, { obtainedMarks: e.target.value })
                      }
                    />
                    <div className="flex flex-col gap-1">
                      <label className="text-sm font-medium text-black">
                        Confidence
                      </label>
                      <select
                        className={selectClass}
                        value={s.confidenceLevel}
                        onChange={(e) =>
                          updateSubject(i, {
                            confidenceLevel: e.target
                              .value as SubjectForm['confidenceLevel'],
                          })
                        }
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {step === 6 && (
              <div className="flex flex-col gap-4">
                {subjects.map((s, i) => (
                  <div key={i} className="rounded-[26px] bg-[#F0EFED] p-5">
                    <p className="mb-4 text-base font-extrabold tracking-tight sm:text-lg">
                      {s.name || 'Untitled'}
                    </p>

                    <div className="flex flex-col gap-2">
                      {s.topics.map((t, j) => (
                        <div
                          key={j}
                          className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3"
                        >
                          <input
                            type="checkbox"
                            checked={t.selected}
                            onChange={() => toggleTopic(i, j)}
                            className="h-5 w-5 shrink-0 cursor-pointer accent-black"
                          />
                          <span className="min-w-0 flex-1 text-sm font-semibold sm:text-base">
                            {t.name}
                          </span>
                          <select
                            className={`${selectClass} !py-1.5 text-xs disabled:opacity-50`}
                            value={t.difficultyRating}
                            onChange={(e) =>
                              setTopicDifficulty(i, j, Number(e.target.value))
                            }
                            disabled={!t.selected}
                          >
                            {[1, 2, 3, 4, 5].map((d) => (
                              <option key={d} value={d}>
                                Difficulty {d}
                              </option>
                            ))}
                          </select>
                        </div>
                      ))}
                      {s.topics.length === 0 && (
                        <p className="text-sm text-[#65615D]">
                          No suggestions for this subject — add a topic below.
                        </p>
                      )}
                    </div>

                    <AddTopicRow onAdd={(name) => addCustomTopic(i, name)} />
                  </div>
                ))}
              </div>
            )}

            {/* ERROR */}
            {error && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                <span>{error}</span>

                {step === TOTAL_STEPS && canRetry && (
                  <button
                    type="button"
                    onClick={handleFinish}
                    disabled={isSubmitting}
                    className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 active:scale-95 disabled:opacity-50"
                  >
                    {isSubmitting ? 'Retrying…' : 'Try again'}
                  </button>
                )}
              </div>
            )}

            {/* NAVIGATION */}
            <div className="mt-8 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                disabled={step === 1}
                className={`${pillGrey} px-7 py-3.5 sm:py-4 sm:text-base`}
              >
                Back
              </button>

              {step === 2 && !hadExams ? (
                <button
                  type="button"
                  onClick={handleNewSession}
                  className={primaryBtn}
                >
                  Continue
                </button>
              ) : step < TOTAL_STEPS ? (
                <button type="button" onClick={goNext} className={primaryBtn}>
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={isSubmitting}
                  className={primaryBtn}
                >
                  {isSubmitting ? 'Saving…' : 'Finish setup'}
                </button>
              )}
            </div>
          </div>
        </div>
      </main>

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

function AddTopicRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="mt-4 flex gap-2">
      <input
        className="min-w-0 flex-1 rounded-full border border-black/15 bg-white px-5 py-3 text-sm outline-none transition placeholder:text-black/35 focus:border-black focus:ring-2 focus:ring-black/10"
        placeholder="Add a custom topic"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            onAdd(value);
            setValue('');
          }
        }}
      />
      <button
        type="button"
        className={pillBlack}
        onClick={() => {
          onAdd(value);
          setValue('');
        }}
      >
        Add
      </button>
    </div>
  );
}
