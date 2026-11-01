'use client';

import { useEffect, useRef, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { subjectClashFor } from '@/lib/subject-name';
import { AddTopicInput } from '@/components/ui/AddTopicInput';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { Button, ButtonLink } from '@/components/ui/Button';
import { cardClass } from '@/components/ui/Card';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { Field, Select, fieldClass, fieldOnColourClass } from '@/components/ui/Field';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { PageTitle } from '@/components/ui/PageTitle';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Tag } from '@/components/ui/Tag';
import { api, ApiError } from '@/lib/api-client';
import { suggestTopicsFor } from '@/lib/common-topics';

type Level = 'low' | 'medium' | 'high';
type Estimate = Level | ''; // '' = not chosen yet

interface StudentDetail {
  student: { id: string; name: string; grade?: string };
  subjects: { id: string; name: string }[];
  topics: { id: string; subjectId: string }[];
  exams: { id: string; name: string; examDate: string; isPrimary: boolean }[];
  latestPlan?: { id: string } | null;
}

interface TopicForm {
  name: string;
  difficultyRating: number;
  selected: boolean;
}

interface NewSubject {
  name: string;
  examWeight: Level;
  estimate: Estimate;
  topics: TopicForm[];
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Design tokens                                                       */
/* ------------------------------------------------------------------ */

// Subject cards cycle through these colours. Topic rows sit on a white/55
// wash of the same colour, so each card stays one family.
const CARD_COLORS = [
  'bg-[#F7CC46]', // sunshine (same yellow as the dashboard)
  'bg-[#B1E6CD]', // mint
  'bg-[#A59DEB]', // lavender
  'bg-[#F2A99B]', // coral
  'bg-[#9ED0F2]', // sky
];

function EstimateSelect({
  value,
  onChange,
  className = '',
}: {
  value: Estimate;
  onChange: (value: Estimate) => void;
  className?: string;
}) {
  return (
    <Field label="Estimated confidence" className={className}>
      <Select
        onColour
        className="w-full"
        value={value}
        onChange={(e) => onChange(e.target.value as Estimate)}
      >
        <option value="" disabled>
          Select…
        </option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </Select>
    </Field>
  );
}

const PANEL = `${cardClass} p-4 sm:p-8`;

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function NewSessionPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState('');
  const [grade, setGrade] = useState('');
  // A new session replaces everything: the parent has to agree first.
  const [confirmed, setConfirmed] = useState(false);
  const [newSubjects, setNewSubjects] = useState<NewSubject[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canRetry, setCanRetry] = useState(false);

  // From onboarding ("no previous exams") the child isn't saved yet: the draft
  // is kept in sessionStorage and everything is saved together on submit.
  const isDraft = params.id === 'new';
  const draftStudent = useRef<Record<string, unknown> | null>(null);

  // Index of the subject card that was just added, so the page can scroll to
  // it and focus its name field.
  const lastAdded = useRef<number | null>(null);

  useEffect(() => {
    if (isDraft) {
      try {
        const raw = sessionStorage.getItem('newSessionDraft');
        draftStudent.current = raw ? JSON.parse(raw).student : null;
      } catch {
        draftStudent.current = null;
      }
      if (!draftStudent.current) {
        router.replace('/onboarding');
        return;
      }
      setDetail({
        student: { id: 'new', name: String(draftStudent.current.name) },
        subjects: [],
        topics: [],
        exams: [],
      });
      return;
    }
    api
      .get<StudentDetail>(`/api/students/${params.id}`)
      .then((data) => {
        setDetail(data);
        // A new year usually means the next grade; the parent can change it.
        const current = parseInt(data.student.grade ?? '', 10);
        if (!Number.isNaN(current)) setGrade(String(Math.min(10, current + 1)));
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError("Couldn't load this student. Please try refreshing.");
      });
  }, [params.id, router, isDraft]);

  // After a subject is added, bring its card into view and focus the name
  // field, so the parent never has to hunt for it.
  useEffect(() => {
    const i = lastAdded.current;
    if (i === null) return;
    lastAdded.current = null;
    const card = document.getElementById(`new-subject-${i}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card
      .querySelector<HTMLInputElement>('input')
      ?.focus({ preventScroll: true });
  }, [newSubjects.length]);

  function addSubject() {
    lastAdded.current = newSubjects.length;
    setNewSubjects((prev) => [
      ...prev,
      {
        name: '',
        examWeight: 'medium',
        estimate: '',
        topics: [],
      },
    ]);
  }

  function updateNew(index: number, patch: Partial<NewSubject>) {
    setNewSubjects((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }

  function updateTopics(index: number, fn: (t: TopicForm[]) => TopicForm[]) {
    setNewSubjects((prev) =>
      prev.map((s, i) => (i === index ? { ...s, topics: fn(s.topics) } : s)),
    );
  }

  function addCustomTopic(index: number, name: string) {
    if (!name.trim()) return;
    updateTopics(index, (t) => [
      ...t,
      { name: name.trim(), difficultyRating: 2, selected: true },
    ]);
  }

  function validate(): string | null {
    const g = Number(grade);
    if (!isDraft && (!Number.isInteger(g) || g < 4 || g > 10))
      return 'Enter the grade as a whole number from 4 to 10.';
    if (!examName.trim() || !examDate) return 'Enter the exam name and date.';
    if (new Date(examDate).getTime() <= Date.now())
      return 'Exam date must be in the future.';
    if (newSubjects.some((s) => !s.name.trim()))
      return 'Every new subject needs a name.';
    if (newSubjects.length === 0) return 'Add at least one subject.';
    // Each subject is listed once.
    for (const [i, s] of newSubjects.entries()) {
      const clash = subjectClashFor(
        s.name,
        newSubjects.filter((_, j) => j < i).map((o) => o.name),
      );
      if (clash) return clash;
    }
    // Every subject needs an estimate here, since there are no marks to go on.
    for (const s of newSubjects) {
      if (!s.estimate) return `Choose an estimated confidence for ${s.name}.`;
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setCanRetry(false);
      return;
    }
    // The new session replaces everything the child has: confirm once more.
    if (
      !isDraft &&
      !window.confirm(
        `Start the new session? This permanently deletes all of ${detail?.student.name}'s current subjects, topics, test history and study plans, and replaces them with what you entered here. This can't be undone.`,
      )
    )
      return;
    setError(null);
    setCanRetry(false);
    setIsSubmitting(true);

    try {
      if (isDraft) {
        const { studentId } = await api.post<{ studentId: string }>(
          '/api/onboarding',
          {
            student: draftStudent.current,
            exam: { name: examName.trim(), examDate },
            subjects: newSubjects.map((s) => ({
              name: s.name.trim(),
              examWeight: s.examWeight,
              estimatedConfidence: s.estimate,
              topics: s.topics
                .filter((t) => t.selected && t.name.trim())
                .map((t) => ({
                  name: t.name.trim(),
                  difficultyRating: t.difficultyRating,
                })),
            })),
          },
        );
        sessionStorage.removeItem('newSessionDraft');
        // A new child: the last step is the payment.
        router.push(`/students/${studentId}/pay`);
        return;
      }

      // One request: the old session is cleared and the new exam, subjects,
      // topics and estimates are saved, together or not at all.
      await api.post(`/api/students/${params.id}/new-session`, {
        grade: String(Number(grade)),
        exam: { name: examName.trim(), examDate },
        subjects: newSubjects.map((s) => ({
          name: s.name.trim(),
          examWeight: s.examWeight,
          estimatedConfidence: s.estimate,
          topics: s.topics
            .filter((t) => t.selected && t.name.trim())
            .map((t) => ({
              name: t.name.trim(),
              difficultyRating: t.difficultyRating,
            })),
        })),
      });

      router.push(`/students/${params.id}/analysis`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setCanRetry(err.retryable);
      } else {
        setError(
          "Couldn't save the new session. Nothing was saved — please try again.",
        );
        setCanRetry(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <PageShell className="pb-16 sm:pb-8">
      <AppHeader>
        <BackLink
          href={isDraft ? '/onboarding' : `/students/${params.id}/analysis`}
          label={isDraft ? 'Back to setup' : 'Back to analysis'}
        />
      </AppHeader>

      <PageMain>
        {!detail && !error && (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!detail && error && <ErrorMessage message={error} className="mb-5" />}

        {detail &&
          (() => {
            const activeExam = detail.exams.find(
              (e) => e.isPrimary && e.examDate > todayDateString(),
            );
            if (activeExam) {
              return (
                <div className={PANEL}>
                  <div className="rounded-[28px] border-2 border-dashed border-[#F7CC46] bg-[#fdf4d8] p-4 sm:p-5">
                    <h2 className="text-2xl font-bold tracking-tight text-black sm:text-3xl">
                      &ldquo;{activeExam.name}&rdquo; is still active
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-black sm:text-base">
                      It doesn&apos;t end until{' '}
                      {new Date(activeExam.examDate).toLocaleDateString()}. A
                      new session can only start once the current exam is over.
                    </p>
                    <div className="mt-4 flex gap-2">
                      <ButtonLink href={`/students/${params.id}/analysis`}>
                        Go to analysis
                      </ButtonLink>
                    </div>
                  </div>
                </div>
              );
            }

            // Starting a new session replaces everything: ask first. Nothing is
            // deleted until the form is finished and saved.
            if (!isDraft && !confirmed) {
              return (
                <div className={PANEL}>
                  <div className="rounded-[28px] border-2 border-dashed border-red-300 bg-red-50 p-4 sm:p-5">
                    <h2 className="text-2xl font-bold tracking-tight text-red-900 sm:text-3xl">
                      Start a new academic session?
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-red-800 sm:text-base">
                      A new session is a fresh start, with new subjects, topics
                      and sub-topics. When you finish and save, all of{' '}
                      {detail.student.name}&apos;s current subjects
                      {detail.subjects.length > 0 &&
                        ` (${detail.subjects.map((s) => s.name).join(', ')})`}
                      , their topics, test history and study plans are
                      permanently deleted to make room for the new year.
                    </p>
                    <p className="mt-2 text-sm leading-6 text-red-800 sm:text-base">
                      Nothing is deleted until you save at the end. If you only
                      want the next exam for the same subjects, start a new exam
                      cycle instead.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button onClick={() => setConfirmed(true)}>
                        Continue
                      </Button>
                      <ButtonLink
                        variant="white"
                        href={`/students/${params.id}/analysis`}
                      >
                        Cancel
                      </ButtonLink>
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <>
                {/* HERO SECTION */}
                <section className="mb-8 sm:mb-10">
                  <PageTitle size="text-[clamp(1.5rem,4.2vw,3.25rem)]">
                    Start a new academic session with no previous exams
                  </PageTitle>

                  <p className="mt-4 max-w-xl text-sm leading-7 text-black sm:text-base lg:text-lg">
                    For {detail.student.name}. Add the new year&apos;s subjects
                    and topics. There are no marks yet, so give each subject a
                    rough confidence. It is only used until the first real marks
                    are added.
                  </p>
                </section>

                <div className={PANEL}>
                  {!isDraft && (
                    <div className="mb-5 rounded-[28px] border-2 border-dashed border-[#d6d4cd] bg-white p-4 sm:p-5">
                      <Tag>Grade</Tag>
                      <div className="mt-4">
                        <Field
                          label="Grade for the new session (4–10)"
                          className="w-full sm:w-[190px]"
                        >
                          <input
                            type="number"
                            min={4}
                            max={10}
                            className={fieldClass}
                            value={grade}
                            onChange={(e) => setGrade(e.target.value)}
                          />
                        </Field>
                      </div>
                    </div>
                  )}

                  <div className="rounded-[28px] border-2 border-dashed border-[#d6d4cd] bg-white p-4 sm:p-5">
                    <Tag>First exam</Tag>
                    <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
                      <Field label="Exam name" className="min-w-0">
                        <input
                          className={fieldClass}
                          placeholder="e.g. First Term 2026"
                          value={examName}
                          onChange={(e) => setExamName(e.target.value)}
                        />
                      </Field>
                      <Field label="Exam date" className="min-w-0">
                        <input
                          type="date"
                          className={fieldClass}
                          value={examDate}
                          onChange={(e) => setExamDate(e.target.value)}
                        />
                      </Field>
                    </div>
                  </div>

                  {/* SUBJECTS */}
                  <div className="mb-5 mt-8">
                    <h2 className="text-2xl font-bold tracking-tight text-black sm:text-3xl">
                      Add subjects
                    </h2>
                  </div>

                  {newSubjects.length === 0 && (
                    <div className="rounded-[28px] bg-[#f4f3ee] p-5">
                      <p className="text-sm leading-6 text-[#65615D] sm:text-base">
                        Add the subjects for this session.
                      </p>
                    </div>
                  )}

                  <div className="flex flex-col gap-5">
                    {newSubjects.map((s, i) => {
                      const clash = subjectClashFor(
                        s.name,
                        newSubjects
                          .filter((_, j) => j !== i)
                          .map((o) => o.name),
                      );
                      return (
                        <div
                          key={i}
                          id={`new-subject-${i}`}
                          className={`scroll-mt-24 rounded-[2rem] p-4 sm:p-7 ${CARD_COLORS[i % CARD_COLORS.length]}`}
                        >
                          <Tag>Subject {i + 1}</Tag>
                          <div className="mt-4 flex flex-wrap items-end gap-3">
                            <Field
                              label="Subject"
                              className="min-w-[10rem] flex-1"
                            >
                              <input
                                className={fieldOnColourClass}
                                value={s.name}
                                onChange={(e) =>
                                  updateNew(i, { name: e.target.value })
                                }
                                onBlur={() =>
                                  updateNew(i, {
                                    topics: suggestTopicsFor(s.name).map(
                                      (t) => ({
                                        name: t,
                                        difficultyRating: 2,
                                        selected: true,
                                      }),
                                    ),
                                  })
                                }
                              />
                            </Field>
                            <Field
                              label="Exam weight"
                              className="w-full sm:w-[150px]"
                            >
                              <Select
                                onColour
                                className="w-full"
                                value={s.examWeight}
                                onChange={(e) =>
                                  updateNew(i, {
                                    examWeight: e.target.value as Level,
                                  })
                                }
                              >
                                <option value="low">Low</option>
                                <option value="medium">Medium</option>
                                <option value="high">High</option>
                              </Select>
                            </Field>
                            <EstimateSelect
                              className="w-full sm:w-[190px]"
                              value={s.estimate}
                              onChange={(v) => updateNew(i, { estimate: v })}
                            />
                            <Button
                              variant="white"
                              onClick={() =>
                                setNewSubjects((prev) =>
                                  prev.filter((_, j) => j !== i),
                                )
                              }
                            >
                              Remove
                            </Button>
                            {clash && (
                              <p className="w-full text-sm font-semibold text-red-700">
                                {clash}
                              </p>
                            )}
                          </div>

                          {s.name.trim() && (
                            <div className="mt-6 rounded-3xl bg-white/[0.55] p-3 sm:p-3.5">
                              <p className="mb-3 text-base font-bold text-black">
                                Topics for {s.name}
                              </p>
                              <div className="flex flex-col gap-2">
                                {s.topics.map((t, j) => (
                                  <div
                                    key={j}
                                    className="flex flex-wrap items-center gap-x-3 gap-y-1"
                                  >
                                    <label className="flex min-h-11 min-w-[8rem] flex-1 cursor-pointer items-center gap-3">
                                      <input
                                        type="checkbox"
                                        checked={t.selected}
                                        onChange={() =>
                                          updateTopics(i, (ts) =>
                                            ts.map((x, k) =>
                                              k === j
                                                ? { ...x, selected: !x.selected }
                                                : x,
                                            ),
                                          )
                                        }
                                        className="h-5 w-5 shrink-0 cursor-pointer accent-black"
                                      />
                                      <span className="min-w-0 flex-1 text-sm font-semibold text-black">
                                        {t.name}
                                      </span>
                                    </label>
                                    <Select
                                      onColour
                                      className="w-[150px]"
                                      value={t.difficultyRating}
                                      onChange={(e) =>
                                        updateTopics(i, (ts) =>
                                          ts.map((x, k) =>
                                            k === j
                                              ? {
                                                  ...x,
                                                  difficultyRating: Number(
                                                    e.target.value,
                                                  ),
                                                }
                                              : x,
                                          ),
                                        )
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
                                  <p className="text-sm font-semibold leading-6 text-black">
                                    No topics yet — this subject won&apos;t get
                                    any study sessions until you add at least
                                    one.
                                  </p>
                                )}
                              </div>
                              <AddTopicInput
                                className="mt-3"
                                onAdd={(name) => addCustomTopic(i, name)}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Always directly under the last subject, so adding the
                      next one never means scrolling back up. */}
                  <div className="mt-5">
                    <Button variant="yellow" onClick={addSubject}>
                      {newSubjects.length === 0
                        ? '+ Add subject'
                        : '+ Add another subject'}
                    </Button>
                  </div>
                </div>

                <ErrorMessage
                  message={error}
                  onRetry={canRetry ? handleSubmit : undefined}
                  retrying={isSubmitting}
                />

                {/* ACTION */}
                <div className="mt-8">
                  <Button
                    variant="yellow"
                    size="lg"
                    onClick={handleSubmit}
                    isLoading={isSubmitting}
                  >
                    Save and go to analysis
                  </Button>
                </div>
              </>
            );
          })()}
      </PageMain>
    </PageShell>
  );
}
