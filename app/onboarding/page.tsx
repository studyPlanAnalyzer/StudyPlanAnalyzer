'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { subjectClashFor } from '@/lib/subject-name';
import { AddTopicInput } from '@/components/ui/AddTopicInput';
import { AppHeader, headerPillClass } from '@/components/ui/AppHeader';
import { buttonClass } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Notice } from '@/components/ui/Notice';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { PageTitle } from '@/components/ui/PageTitle';
import { Tag } from '@/components/ui/Tag';
import { api, ApiError } from '@/lib/api-client';
import { examDateProblem, MAX_FULL_MARKS } from '@/lib/validation';
import { suggestTopicsFor } from '@/lib/common-topics';
import {
  MIN_SCHOOL_DAY_MINUTES,
  MIN_HOLIDAY_DAY_MINUTES,
  MAX_DAILY_MINUTES,
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

// Yes/No and day toggles: black when chosen.
const toggleClass = (on: boolean) =>
  clsx(
    'inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold transition-all duration-200 active:scale-95 sm:text-base',
    on ? 'bg-black text-white' : 'bg-[#F0EFED] text-black hover:bg-[#E7E5E2]',
  );

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
      if (child.schoolName.trim().length < 3)
        return 'Enter the full school name (at least 3 characters).';
      const grade = Number(child.grade);
      if (!Number.isInteger(grade) || grade < 4 || grade > 10)
        return 'The application is optimized for students from grade 4 to 10.';
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
      if (
        schoolDayMinutes > MAX_DAILY_MINUTES ||
        holidayDayMinutes > MAX_DAILY_MINUTES
      )
        return `A day can have at most ${MAX_DAILY_MINUTES} minutes (2 hours) of study time.`;
    }
    if (step === 3) {
      if (!exam.name.trim() || !exam.examDate)
        return 'Please enter the exam name and date.';
      const examDateError = examDateProblem(exam.examDate);
      if (examDateError) return `${examDateError}.`;
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
        if (!Number.isInteger(s.fullMarks) || s.fullMarks < 1 || s.fullMarks > MAX_FULL_MARKS)
          return `Full marks for ${s.name} must be from 1 to ${MAX_FULL_MARKS}.`;
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
    <PageShell className="pb-10">
      <AppHeader
        menu={{
          breakpoint: 'sm',
          items: [{ href: '/dashboard', label: '← Back to dashboard' }],
        }}
      >
        <Link href="/dashboard" className={headerPillClass}>
          Dashboard
        </Link>
      </AppHeader>

      {/* MAIN CONTENT */}
      <PageMain>
        <div className="mx-auto max-w-4xl">
          {/* HERO SECTION */}
          <section className="mb-8 sm:mb-10">
            <Tag className="mb-5">
              Step {step} of {TOTAL_STEPS} · {STEP_LABELS[step - 1]}
            </Tag>

            <div>
              <PageTitle key={step} size="text-[clamp(1.5rem,5.1vw,3.25rem)]">
                {meta.title}
              </PageTitle>
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
                      'mt-2 hidden truncate text-sm sm:block',
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
                  <p className="text-sm font-bold uppercase tracking-wide">
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
                        className={toggleClass(hadExams === o.value)}
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
                  <p className="mb-3 text-sm font-bold uppercase tracking-wide">
                    Study days
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ALL_DAYS.map((day) => (
                      <button
                        key={day}
                        type="button"
                        aria-pressed={studyDays.includes(day)}
                        onClick={() => toggleDay(day)}
                        className={toggleClass(studyDays.includes(day))}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="Minutes available on school days"
                    hint={`Minimum ${MIN_SCHOOL_DAY_MINUTES} minutes`}
                    type="number"
                    min={MIN_SCHOOL_DAY_MINUTES}
                    max={MAX_DAILY_MINUTES}
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
                    max={MAX_DAILY_MINUTES}
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
                      containerClassName="min-w-[10rem] flex-1"
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
                      min={1}
                      max={MAX_FULL_MARKS}
                      value={s.fullMarks}
                      onChange={(e) =>
                        updateSubject(i, { fullMarks: Number(e.target.value) })
                      }
                    />
                    <Field label="Exam weight">
                      <Select
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
                      </Select>
                    </Field>
                    <button
                      type="button"
                      className={buttonClass('whiteDanger')}
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
                  className={buttonClass('secondary', 'md', 'self-start')}
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
                    <Field label="Confidence">
                      <Select
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
                      </Select>
                    </Field>
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
                          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-white px-4 py-2"
                        >
                          <label className="flex min-h-11 min-w-[8rem] flex-1 cursor-pointer items-center gap-3">
                            <input
                              type="checkbox"
                              checked={t.selected}
                              onChange={() => toggleTopic(i, j)}
                              className="h-5 w-5 shrink-0 cursor-pointer accent-black"
                            />
                            <span className="min-w-0 flex-1 text-sm font-semibold sm:text-base">
                              {t.name}
                            </span>
                          </label>
                          <Select
                            className="w-[150px]"
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
                          </Select>
                        </div>
                      ))}
                      {s.topics.length === 0 && (
                        <p className="text-sm text-[#65615D]">
                          No suggestions for this subject — add a topic below.
                        </p>
                      )}
                    </div>

                    <AddTopicInput
                      className="mt-4"
                      onAdd={(name) => addCustomTopic(i, name)}
                    />
                  </div>
                ))}
              </div>
            )}

            {/* ERROR */}
            {error && (
              <Notice className="mt-6 flex flex-wrap items-center justify-between gap-3">
                <span>{error}</span>

                {step === TOTAL_STEPS && canRetry && (
                  <button
                    type="button"
                    onClick={handleFinish}
                    disabled={isSubmitting}
                    className={buttonClass('white', 'md', 'text-red-700')}
                  >
                    {isSubmitting ? 'Retrying…' : 'Try again'}
                  </button>
                )}
              </Notice>
            )}

            {/* NAVIGATION */}
            <div className="mt-8 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={goBack}
                disabled={step === 1}
                className={buttonClass('secondary', 'lg')}
              >
                Back
              </button>

              {step === 2 && !hadExams ? (
                <button
                  type="button"
                  onClick={handleNewSession}
                  className={buttonClass('yellow', 'lg')}
                >
                  Continue
                </button>
              ) : step < TOTAL_STEPS ? (
                <button
                  type="button"
                  onClick={goNext}
                  className={buttonClass('yellow', 'lg')}
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinish}
                  disabled={isSubmitting}
                  className={buttonClass('yellow', 'lg')}
                >
                  {isSubmitting ? 'Saving…' : 'Finish setup'}
                </button>
              )}
            </div>
          </div>
        </div>
      </PageMain>
    </PageShell>
  );
}
