'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { subjectClashFor } from '@/lib/subject-name';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { StepIndicator } from '@/components/onboarding/StepIndicator';
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
      router.push(`/students/${studentId}/analysis`);
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

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <Card>
          <StepIndicator
            step={step}
            totalSteps={TOTAL_STEPS}
            labels={STEP_LABELS}
          />

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Tell us about your child
              </h2>
              <Input
                label="Child's name"
                value={child.name}
                onChange={(e) => setChild({ ...child, name: e.target.value })}
              />
              <Input
                label="Grade"
                type="number"
                min={4}
                max={10}
                placeholder="e.g 4-10"
                value={child.grade}
                onChange={(e) => setChild({ ...child, grade: e.target.value })}
              />
              <Input
                label="School name"
                value={child.schoolName}
                onChange={(e) =>
                  setChild({ ...child, schoolName: e.target.value })
                }
              />
              <div className="flex flex-col gap-2">
                <p className="text-sm font-medium text-slate-700">
                  Has this student already had exams this year?
                </p>
                <div className="flex gap-2">
                  {[
                    { label: 'Yes', value: true },
                    { label: 'No, new academic session', value: false },
                  ].map((o) => (
                    <Button
                      key={o.label}
                      type="button"
                      size="sm"
                      variant={hadExams === o.value ? 'primary' : 'secondary'}
                      onClick={() => setHadExams(o.value)}
                    >
                      {o.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-5">
              <h2 className="text-lg font-semibold text-slate-900">
                When can they study?
              </h2>
              <div>
                <p className="mb-2 text-sm font-medium text-slate-700">
                  Study days
                </p>
                <div className="flex flex-wrap gap-2">
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
              </div>
              <Input
                label="Minutes available on school days"
                hint={`Minimum ${MIN_SCHOOL_DAY_MINUTES} minutes (1 hour)`}
                type="number"
                min={MIN_SCHOOL_DAY_MINUTES}
                value={schoolDayMinutes}
                onChange={(e) => setSchoolDayMinutes(Number(e.target.value))}
              />
              <Input
                label="Minutes available on weekends & holidays"
                hint={`Minimum ${MIN_HOLIDAY_DAY_MINUTES} minutes (1.5 hours)`}
                type="number"
                min={MIN_HOLIDAY_DAY_MINUTES}
                value={holidayDayMinutes}
                onChange={(e) => setHolidayDayMinutes(Number(e.target.value))}
              />
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-900">
                What&apos;s the next exam?
              </h2>
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
                onChange={(e) => setExam({ ...exam, examDate: e.target.value })}
              />
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Which subjects are being tested?
              </h2>
              {subjects.map((s, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3"
                >
                  <Input
                    label="Subject"
                    className="min-w-[10rem] flex-1"
                    value={s.name}
                    onChange={(e) => updateSubject(i, { name: e.target.value })}
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
                    <label className="text-sm font-medium text-slate-700">
                      Exam weight
                    </label>
                    <select
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSubject(i)}
                  >
                    Remove
                  </Button>
                  {(() => {
                    const clash = subjectClashFor(
                      s.name,
                      subjects.filter((_, j) => j !== i).map((o) => o.name),
                    );
                    return clash ? (
                      <p className="w-full text-xs text-red-600">{clash}</p>
                    ) : null;
                  })()}
                </div>
              ))}
              <Button
                variant="secondary"
                size="sm"
                onClick={addSubject}
                className="self-start"
              >
                + Add subject
              </Button>
            </div>
          )}

          {step === 5 && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-semibold text-slate-900">
                Enter marks from the latest marksheet
              </h2>
              {subjects.map((s, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 p-3"
                >
                  <div className="min-w-[8rem] flex-1 text-sm font-medium text-slate-700">
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
                    <label className="text-sm font-medium text-slate-700">
                      Confidence
                    </label>
                    <select
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
            <div className="flex flex-col gap-5">
              <h2 className="text-lg font-semibold text-slate-900">
                Which topics need focus?
              </h2>
              <p className="text-sm text-slate-500">
                We&apos;ve suggested common topics. Untick anything that
                isn&apos;t relevant and set a difficulty (1 = easy, 5 =
                hardest).
              </p>
              {subjects.map((s, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-3">
                  <p className="mb-2 text-sm font-semibold text-slate-800">
                    {s.name || 'Untitled'}
                  </p>
                  <div className="flex flex-col gap-2">
                    {s.topics.map((t, j) => (
                      <div key={j} className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={t.selected}
                          onChange={() => toggleTopic(i, j)}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span className="flex-1 text-sm text-slate-700">
                          {t.name}
                        </span>
                        <select
                          className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
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
                      <p className="text-xs text-slate-400">
                        No suggestions for this subject — add a topic below.
                      </p>
                    )}
                  </div>
                  <AddTopicRow onAdd={(name) => addCustomTopic(i, name)} />
                </div>
              ))}
            </div>
          )}

          <ErrorMessage
            message={error}
            onRetry={
              step === TOTAL_STEPS && canRetry ? handleFinish : undefined
            }
            retrying={isSubmitting}
          />

          <div className="mt-8 flex justify-between">
            <Button variant="secondary" onClick={goBack} disabled={step === 1}>
              Back
            </Button>
            {step === 2 && !hadExams ? (
              <Button onClick={handleNewSession}>Continue</Button>
            ) : step < TOTAL_STEPS ? (
              <Button onClick={goNext}>Next</Button>
            ) : (
              <Button onClick={handleFinish} isLoading={isSubmitting}>
                Finish setup
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

function AddTopicRow({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="mt-3 flex gap-2">
      <input
        className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
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
      <Button
        type="button"
        size="sm"
        variant="secondary"
        onClick={() => {
          onAdd(value);
          setValue('');
        }}
      >
        Add
      </Button>
    </div>
  );
}
