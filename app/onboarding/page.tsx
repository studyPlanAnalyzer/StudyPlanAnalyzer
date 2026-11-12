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
import { academicYearText } from '@/lib/utils/academic-year';
import { suggestTopicsFor } from '@/lib/common-topics';
import { EXAM_NAMES, FIRST_EXAM_NAME, examNamesBefore } from '@/lib/exam-names';
import clsx from 'clsx';

// Setting up a child:
//  1. the child, and whether they've   4. subjects
//     had exams this year already      5. topics studied for earlier exams
//  2. revision days                       (only if they have)
//  3. the exam being prepared for      6. this exam's topics taught so far
// Topics are added as they're taught: these last steps only catch up on what
// has happened so far, and nothing is pre-ticked.

const STEP_LABELS = ['Add child', 'Revision days', 'Next exam', 'Subjects', 'Earlier topics', 'This exam'];
const TOTAL_STEPS = 6;
const EARLIER_STEP = 5;

const STEP_META: { title: string; description: string }[] = [
  { title: 'Tell us about your child.', description: 'Name, grade and school.' },
  {
    title: 'Weekends are for revision.',
    description:
      'Every day is a study day. Weekends have more time, so they are for revising topics from earlier exams.',
  },
  {
    title: "What's the next exam?",
    description: 'The study plan runs up to this exam.',
  },
  {
    title: 'Which subjects is your child studying?',
    description: 'Add each subject, its full marks and how much it weighs.',
  },
  {
    title: 'What was studied for earlier exams?',
    description:
      'Tick the topics your child has already studied this year, and for which exam. These come back on revision days with suggestions. You can also add them later.',
  },
  {
    title: 'What has been taught for this exam so far?',
    description:
      'Add any topics already taught for this exam. They start over the next few days, 4 a day. Nothing yet? Skip this and add topics as they are taught.',
  },
];

const toggleClass = (on: boolean) =>
  clsx(
    'inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold transition-all duration-200 active:scale-95 sm:text-base',
    on ? 'bg-black text-white' : 'bg-[#F0EFED] text-black hover:bg-[#E7E5E2]',
  );

type SelfRating = 'not_sure' | 'ok' | 'know_well';

interface TopicPick {
  name: string;
  selected: boolean;
  difficultyRating: number;
  /** Earlier topics: the exam it was studied for, and how well it's known. */
  examName: string;
  selfRating: SelfRating;
}

interface SubjectForm {
  name: string;
  fullMarks: number;
  examWeight: 'low' | 'medium' | 'high';
  earlier: TopicPick[];
  current: TopicPick[];
}

const OTHER = '__other__';
const AN_EARLIER_EXAM = 'An earlier exam';

function picksFor(subject: string, examName: string): TopicPick[] {
  return suggestTopicsFor(subject).map((name) => ({
    name,
    selected: false,
    difficultyRating: 2,
    examName,
    selfRating: 'not_sure',
  }));
}

const newSubject = (name: string): SubjectForm => ({
  name,
  fullMarks: 100,
  examWeight: 'medium',
  earlier: picksFor(name, ''),
  // No suggestions here: the common topics are offered for earlier exams, and
  // this exam's topics are added as they're taught.
  current: [],
});

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [child, setChild] = useState({ name: '', grade: '', schoolName: '' });
  const [sundayRevision, setSundayRevision] = useState(true);
  // Already had exams this year (joining mid-year), or a new academic session.
  const [hadExams, setHadExams] = useState(true);
  const [examChoice, setExamChoice] = useState<string>(EXAM_NAMES[1]);
  const [customExamName, setCustomExamName] = useState('');
  const [examDate, setExamDate] = useState('');
  const [subjects, setSubjects] = useState<SubjectForm[]>(['Mathematics', 'Science', 'English'].map(newSubject));

  const examName = examChoice === OTHER ? customExamName.trim() : examChoice;
  // A new academic session has nothing from earlier exams: no earlier-topics step.
  const isFirstExam = !hadExams;
  const examOptions = hadExams ? [...EXAM_NAMES.slice(1), OTHER] : [FIRST_EXAM_NAME, OTHER];
  const earlierExamOptions =
    examChoice === OTHER ? [...EXAM_NAMES.slice(0, 3), AN_EARLIER_EXAM] : examNamesBefore(examChoice);
  function chooseHadExams(value: boolean) {
    setHadExams(value);
    setExamChoice(value ? EXAM_NAMES[1] : FIRST_EXAM_NAME);
  }
  const defaultEarlierExam = earlierExamOptions[earlierExamOptions.length - 1] ?? AN_EARLIER_EXAM;

  function updateSubject(index: number, patch: Partial<SubjectForm>) {
    setSubjects((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }
  function updatePick(index: number, list: 'earlier' | 'current', j: number, patch: Partial<TopicPick>) {
    setSubjects((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [list]: s[list].map((t, k) => (k === j ? { ...t, ...patch } : t)) } : s)),
    );
  }
  function addPick(index: number, list: 'earlier' | 'current', name: string) {
    if (!name.trim()) return;
    setSubjects((prev) =>
      prev.map((s, i) =>
        i === index
          ? {
              ...s,
              [list]: [
                ...s[list],
                { name: name.trim(), selected: true, difficultyRating: 2, examName: '', selfRating: 'not_sure' as const },
              ],
            }
          : s,
      ),
    );
  }
  function refreshSuggestions(index: number) {
    setSubjects((prev) =>
      prev.map((s, i) => (i === index ? { ...s, earlier: picksFor(s.name, '') } : s)),
    );
  }

  function validateStep(): string | null {
    if (step === 1) {
      if (!child.name.trim() || !child.schoolName.trim()) return "Please enter the child's name and school name.";
      if (child.schoolName.trim().length < 3) return 'Enter the full school name (at least 3 characters).';
      const grade = Number(child.grade);
      if (!Number.isInteger(grade) || grade < 4 || grade > 10)
        return 'The application is optimized for students from grade 4 to 10.';
    }
    if (step === 3) {
      if (!examName || !examDate) return 'Please choose the exam and its date.';
      const examDateError = examDateProblem(examDate);
      if (examDateError) return `${examDateError}.`;
    }
    if (step === 4) {
      if (subjects.length === 0 || subjects.some((s) => !s.name.trim())) return 'Add at least one named subject.';
      for (const [i, s] of subjects.entries()) {
        const clash = subjectClashFor(s.name, subjects.filter((_, j) => j < i).map((o) => o.name));
        if (clash) return clash;
        if (!Number.isInteger(s.fullMarks) || s.fullMarks < 1 || s.fullMarks > MAX_FULL_MARKS)
          return `Full marks for ${s.name} must be from 1 to ${MAX_FULL_MARKS}.`;
      }
    }
    return null;
  }

  function goNext() {
    const problem = validateStep();
    if (problem) {
      setError(problem);
      setCanRetry(false);
      return;
    }
    setError(null);
    setCanRetry(false);
    setStep((s) => (s + 1 === EARLIER_STEP && isFirstExam ? s + 2 : Math.min(TOTAL_STEPS, s + 1)));
  }

  function goBack() {
    setError(null);
    setCanRetry(false);
    setStep((s) => (s - 1 === EARLIER_STEP && isFirstExam ? s - 2 : Math.max(1, s - 1)));
  }

  // Everything is saved in one request, so a failure leaves nothing behind
  // and retrying is always safe.
  async function handleFinish() {
    setError(null);
    setCanRetry(false);
    setIsSubmitting(true);
    try {
      const { studentId } = await api.post<{ studentId: string }>('/api/onboarding', {
        student: {
          name: child.name.trim(),
          grade: child.grade.trim(),
          schoolName: child.schoolName.trim(),
          sundayRevision,
        },
        exam: { name: examName, examDate },
        subjects: subjects.map((s) => ({
          name: s.name.trim(),
          fullMarks: s.fullMarks,
          examWeight: s.examWeight,
          earlierTopics: isFirstExam
            ? []
            : s.earlier
                .filter((t) => t.selected && t.name.trim())
                .map((t) => ({
                  name: t.name.trim(),
                  examName: t.examName || defaultEarlierExam,
                  selfRating: t.selfRating,
                })),
          topics: s.current
            .filter((t) => t.selected && t.name.trim())
            .map((t) => ({ name: t.name.trim(), difficultyRating: t.difficultyRating })),
        })),
      });
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
  // The earlier-topics step only exists for a child who has had exams this year.
  const visibleSteps = STEP_LABELS.map((label, i) => ({ label, step: i + 1 })).filter(
    (v) => !isFirstExam || v.step !== EARLIER_STEP,
  );
  const position = visibleSteps.findIndex((v) => v.step === step) + 1;

  return (
    <PageShell className="pb-10">
      <AppHeader menu={{ breakpoint: 'sm', items: [{ href: '/dashboard', label: '← Back to dashboard' }] }}>
        <Link href="/dashboard" className={headerPillClass}>
          Dashboard
        </Link>
      </AppHeader>

      <PageMain>
        <div className="mx-auto max-w-4xl">
          <section className="mb-8 sm:mb-10">
            <Tag className="mb-5">
              Step {position} of {visibleSteps.length} · {STEP_LABELS[step - 1]}
            </Tag>
            <div>
              <PageTitle key={step} size="text-[clamp(1.5rem,5.1vw,3.25rem)]">
                {meta.title}
              </PageTitle>
            </div>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">{meta.description}</p>

            <div
              className="mt-6 grid gap-2"
              style={{ gridTemplateColumns: `repeat(${visibleSteps.length}, minmax(0, 1fr))` }}
            >
              {visibleSteps.map((v, i) => (
                <div key={v.label} className="min-w-0">
                  <div
                    className={clsx(
                      'h-2.5 rounded-full transition-colors',
                      i < position ? 'bg-black' : 'bg-[#E7E5E2]',
                    )}
                  />
                  <p
                    className={clsx(
                      'mt-2 hidden truncate text-sm sm:block',
                      v.step === step ? 'font-bold text-black' : 'font-semibold text-black/40',
                    )}
                  >
                    {v.label}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <div className="rounded-[32px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-8 lg:p-10">
            {step === 1 && (
              <div className="flex flex-col gap-5">
                <Input label="Child's name" value={child.name} onChange={(e) => setChild({ ...child, name: e.target.value })} />
                <div className="grid gap-5 sm:grid-cols-2">
                  <Input
                    label="Grade"
                    type="number"
                    min={4}
                    max={10}
                    placeholder="e.g. 9"
                    value={child.grade}
                    onChange={(e) => setChild({ ...child, grade: e.target.value })}
                  />
                  <Input
                    label="School name"
                    value={child.schoolName}
                    onChange={(e) => setChild({ ...child, schoolName: e.target.value })}
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
                        onClick={() => chooseHadExams(o.value)}
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
              <div className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F0EFED] p-4">
                  <div>
                    <p className="text-sm font-bold sm:text-base">Saturday</p>
                    <p className="text-sm text-[#65615D]">Always a revision day.</p>
                  </div>
                  <span className="inline-flex h-11 items-center rounded-full bg-black px-5 text-sm font-semibold text-white">
                    Revision day
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F0EFED] p-4">
                  <div>
                    <p className="text-sm font-bold sm:text-base">Sunday</p>
                    <p className="text-sm text-[#65615D]">A school day if your child&apos;s school is open on Sundays.</p>
                  </div>
                  <div className="flex gap-2">
                    {[
                      { label: 'Revision day', value: true },
                      { label: 'School day', value: false },
                    ].map((o) => (
                      <button
                        key={o.label}
                        type="button"
                        aria-pressed={sundayRevision === o.value}
                        onClick={() => setSundayRevision(o.value)}
                        className={toggleClass(sundayRevision === o.value)}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-sm leading-6 text-[#65615D]">
                  Revision days list no new work: your child revises topics from earlier exams, with suggestions.
                  In the first term of the year there is nothing to revise yet, so weekends follow the daily list.
                </p>
              </div>
            )}

            {step === 3 && (
              <div className="flex flex-col gap-5">
                <div className="flex flex-wrap gap-2">
                  {examOptions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={examChoice === name}
                      onClick={() => setExamChoice(name)}
                      className={toggleClass(examChoice === name)}
                    >
                      {name === OTHER ? 'Another name' : name}
                    </button>
                  ))}
                </div>
                <p className="text-sm text-[#65615D]">
                  {hadExams
                    ? 'Next, add the topics studied for the earlier exams this year: they come back on weekends for revision.'
                    : 'A new academic session: the first exam of the year, with nothing from earlier exams yet.'}
                </p>
                <div className="grid gap-5 sm:grid-cols-2">
                  {examChoice === OTHER && (
                    <Input
                      label="Exam name"
                      placeholder="e.g. Half-yearly Examination"
                      value={customExamName}
                      onChange={(e) => setCustomExamName(e.target.value)}
                    />
                  )}
                  <Input
                    label="Exam date"
                    type="date"
                    value={examDate}
                    hint={academicYearText(examDate) ?? undefined}
                    onChange={(e) => setExamDate(e.target.value)}
                  />
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="flex flex-col gap-4">
                {subjects.map((s, i) => (
                  <div key={i} className="flex flex-wrap items-end gap-3 rounded-[26px] bg-[#F0EFED] p-5">
                    <Input
                      label="Subject"
                      containerClassName="min-w-[10rem] flex-1"
                      value={s.name}
                      onChange={(e) => updateSubject(i, { name: e.target.value })}
                      onBlur={() => refreshSuggestions(i)}
                    />
                    <Input
                      label="Full marks"
                      type="number"
                      className="w-28"
                      min={1}
                      max={MAX_FULL_MARKS}
                      value={s.fullMarks}
                      onChange={(e) => updateSubject(i, { fullMarks: Number(e.target.value) })}
                    />
                    <Field label="Exam weight">
                      <Select
                        value={s.examWeight}
                        onChange={(e) => updateSubject(i, { examWeight: e.target.value as SubjectForm['examWeight'] })}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </Select>
                    </Field>
                    <button
                      type="button"
                      className={buttonClass('whiteDanger')}
                      onClick={() => setSubjects((prev) => prev.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                    {(() => {
                      const clash = subjectClashFor(s.name, subjects.filter((_, j) => j !== i).map((o) => o.name));
                      return clash ? <p className="w-full text-sm font-medium text-red-700">{clash}</p> : null;
                    })()}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setSubjects((prev) => [...prev, newSubject('')])}
                  className={buttonClass('secondary', 'md', 'self-start')}
                >
                  + Add subject
                </button>
              </div>
            )}

            {step === EARLIER_STEP && (
              <div className="flex flex-col gap-4">
                {subjects.map((s, i) => (
                  <div key={i} className="rounded-[26px] bg-[#F0EFED] p-5">
                    <p className="mb-4 text-base font-extrabold tracking-tight sm:text-lg">{s.name || 'Untitled'}</p>
                    <div className="flex flex-col gap-2">
                      {s.earlier.map((t, j) => (
                        <div key={j} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-white px-4 py-2">
                          <label className="flex min-h-11 min-w-[8rem] flex-1 cursor-pointer items-center gap-3">
                            <input
                              type="checkbox"
                              checked={t.selected}
                              onChange={() => updatePick(i, 'earlier', j, { selected: !t.selected })}
                              className="h-5 w-5 shrink-0 cursor-pointer accent-black"
                            />
                            <span className="min-w-0 flex-1 text-sm font-semibold sm:text-base">{t.name}</span>
                          </label>
                          {t.selected && (
                            <>
                              <Select
                                aria-label="Studied for"
                                className="w-[230px]"
                                value={t.examName || defaultEarlierExam}
                                onChange={(e) => updatePick(i, 'earlier', j, { examName: e.target.value })}
                              >
                                {earlierExamOptions.map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </Select>
                              <Select
                                aria-label="How well is it known?"
                                className="w-[170px]"
                                value={t.selfRating}
                                onChange={(e) => updatePick(i, 'earlier', j, { selfRating: e.target.value as SelfRating })}
                              >
                                <option value="not_sure">Not sure</option>
                                <option value="ok">OK</option>
                                <option value="know_well">Know it well</option>
                              </Select>
                            </>
                          )}
                        </div>
                      ))}
                      {s.earlier.length === 0 && (
                        <p className="text-sm text-[#65615D]">No suggestions for this subject — add a topic below.</p>
                      )}
                    </div>
                    <AddTopicInput className="mt-4" onAdd={(name) => addPick(i, 'earlier', name)} />
                  </div>
                ))}
              </div>
            )}

            {step === 6 && (
              <div className="flex flex-col gap-4">
                {subjects.map((s, i) => (
                  <div key={i} className="rounded-[26px] bg-[#F0EFED] p-5">
                    <p className="mb-4 text-base font-extrabold tracking-tight sm:text-lg">{s.name || 'Untitled'}</p>
                    <div className="flex flex-col gap-2">
                      {s.current.map((t, j) => (
                        <div key={j} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-white px-4 py-2">
                          <label className="flex min-h-11 min-w-[8rem] flex-1 cursor-pointer items-center gap-3">
                            <input
                              type="checkbox"
                              checked={t.selected}
                              onChange={() => updatePick(i, 'current', j, { selected: !t.selected })}
                              className="h-5 w-5 shrink-0 cursor-pointer accent-black"
                            />
                            <span className="min-w-0 flex-1 text-sm font-semibold sm:text-base">{t.name}</span>
                          </label>
                          <Select
                            className="w-[150px]"
                            value={t.difficultyRating}
                            onChange={(e) => updatePick(i, 'current', j, { difficultyRating: Number(e.target.value) })}
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
                      {s.current.length === 0 && (
                        <p className="text-sm text-[#65615D]">
                          Add the topics already studied for this exam, or add them later as they&apos;re taught.
                        </p>
                      )}
                    </div>
                    <AddTopicInput className="mt-4" onAdd={(name) => addPick(i, 'current', name)} />
                  </div>
                ))}
                <Notice tone="info">
                  Nothing taught yet? Leave this empty: add each topic on the Subjects page on the day
                  it&apos;s taught, and it comes onto the list the next day.
                </Notice>
              </div>
            )}

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

            <div className="mt-8 flex items-center justify-between gap-3">
              <button type="button" onClick={goBack} disabled={step === 1} className={buttonClass('secondary', 'lg')}>
                Back
              </button>
              {step < TOTAL_STEPS ? (
                <button type="button" onClick={goNext} className={buttonClass('yellow', 'lg')}>
                  Next
                </button>
              ) : (
                <button type="button" onClick={handleFinish} disabled={isSubmitting} className={buttonClass('yellow', 'lg')}>
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
