'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { SkeletonCard } from '@/components/ui/Skeleton';
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

function EstimateSelect({
  value,
  onChange,
}: {
  value: Estimate;
  onChange: (value: Estimate) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-slate-700">
        Estimated confidence
      </label>
      <select
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value as Estimate)}
      >
        <option value="" disabled>
          Select…
        </option>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
    </div>
  );
}

export default function NewSessionPage({ params }: { params: { id: string } }) {
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
    const seen = new Set<string>();
    for (const s of newSubjects) {
      const key = s.name.trim().toLowerCase();
      if (seen.has(key))
        return `${s.name.trim()} is added twice. Each subject can only be listed once.`;
      seen.add(key);
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
        router.push(`/students/${studentId}/analysis`);
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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold text-indigo-700"
          >
            StudyPlan Analyzer
          </Link>
          <Link
            href={isDraft ? '/onboarding' : `/students/${params.id}/analysis`}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            {isDraft ? 'Back to setup' : 'Back to analysis'}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {!detail && !error && (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!detail && error && <ErrorMessage message={error} />}

        {detail &&
          (() => {
            const activeExam = detail.exams.find(
              (e) => e.isPrimary && e.examDate > todayDateString(),
            );
            if (activeExam) {
              return (
                <Card className="border-amber-200 bg-amber-50">
                  <h2 className="text-base font-semibold text-amber-900">
                    &ldquo;{activeExam.name}&rdquo; is still active
                  </h2>
                  <p className="mt-2 text-sm text-amber-800">
                    It doesn&apos;t end until{' '}
                    {new Date(activeExam.examDate).toLocaleDateString()}. A new
                    session can only start once the current exam is over.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Link href={`/students/${params.id}/analysis`}>
                      <Button size="sm">Go to analysis</Button>
                    </Link>
                  </div>
                </Card>
              );
            }

            // Starting a new session replaces everything: ask first. Nothing is
            // deleted until the form is finished and saved.
            if (!isDraft && !confirmed) {
              return (
                <Card className="border-red-200 bg-red-50">
                  <h2 className="text-base font-semibold text-red-900">
                    Start a new academic session?
                  </h2>
                  <p className="mt-2 text-sm text-red-800">
                    A new session is a fresh start, with new subjects, topics
                    and sub-topics. When you finish and save, all of{' '}
                    {detail.student.name}&apos;s current subjects
                    {detail.subjects.length > 0 &&
                      ` (${detail.subjects.map((s) => s.name).join(', ')})`}
                    , their topics, test history and study plans are permanently
                    deleted to make room for the new year.
                  </p>
                  <p className="mt-2 text-sm text-red-800">
                    Nothing is deleted until you save at the end. If you only
                    want the next exam for the same subjects, start a new exam
                    cycle instead.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" onClick={() => setConfirmed(true)}>
                      Continue
                    </Button>
                    <Link href={`/students/${params.id}/analysis`}>
                      <Button size="sm" variant="secondary">
                        Cancel
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            }

            return (
              <>
                <h1 className="mb-1 text-2xl font-semibold text-slate-900">
                  Start a new academic session with no previous exams
                </h1>
                <p className="mb-6 text-sm text-slate-500">
                  For {detail.student.name}. Add the new year&apos;s subjects
                  and topics. There are no marks yet, so give each subject a
                  rough confidence. It is only used until the first real marks
                  are added.
                </p>

                {!isDraft && (
                  <Card className="mb-6">
                    <h2 className="mb-4 text-base font-semibold text-slate-900">
                      Grade
                    </h2>
                    <Input
                      label="Grade for the new session (4–10)"
                      type="number"
                      min={4}
                      max={10}
                      className="w-40"
                      value={grade}
                      onChange={(e) => setGrade(e.target.value)}
                    />
                  </Card>
                )}

                <Card className="mb-6">
                  <h2 className="mb-4 text-base font-semibold text-slate-900">
                    First exam
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Exam name"
                      placeholder="e.g. First Term 2026"
                      value={examName}
                      onChange={(e) => setExamName(e.target.value)}
                    />
                    <Input
                      label="Exam date"
                      type="date"
                      value={examDate}
                      onChange={(e) => setExamDate(e.target.value)}
                    />
                  </div>
                </Card>

                <Card className="mb-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-900">
                      Add subjects
                    </h2>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        setNewSubjects((prev) => [
                          ...prev,
                          {
                            name: '',
                            examWeight: 'medium',
                            estimate: '',
                            topics: [],
                          },
                        ])
                      }
                    >
                      + Add subject
                    </Button>
                  </div>
                  {newSubjects.length === 0 && (
                    <p className="text-sm text-slate-400">
                      Add the subjects for this session.
                    </p>
                  )}
                  <div className="flex flex-col gap-3">
                    {newSubjects.map((s, i) => (
                      <div
                        key={i}
                        className="rounded-lg border border-slate-200 p-3"
                      >
                        <div className="flex flex-wrap items-end gap-3">
                          <Input
                            label="Subject"
                            className="min-w-[8rem] flex-1"
                            value={s.name}
                            onChange={(e) =>
                              updateNew(i, { name: e.target.value })
                            }
                            onBlur={() =>
                              updateNew(i, {
                                topics: suggestTopicsFor(s.name).map((t) => ({
                                  name: t,
                                  difficultyRating: 2,
                                  selected: true,
                                })),
                              })
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
                                updateNew(i, {
                                  examWeight: e.target.value as Level,
                                })
                              }
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
                          </div>
                          <EstimateSelect
                            value={s.estimate}
                            onChange={(v) => updateNew(i, { estimate: v })}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setNewSubjects((prev) =>
                                prev.filter((_, j) => j !== i),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>

                        {s.name.trim() && (
                          <div className="mt-3 border-t border-slate-100 pt-3">
                            <p className="mb-2 text-xs font-medium text-slate-500">
                              Topics for {s.name}
                            </p>
                            <div className="flex flex-col gap-2">
                              {s.topics.map((t, j) => (
                                <div
                                  key={j}
                                  className="flex items-center gap-3"
                                >
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
                                    className="h-4 w-4 rounded border-slate-300"
                                  />
                                  <span className="flex-1 text-sm text-slate-700">
                                    {t.name}
                                  </span>
                                  <select
                                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
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
                                  </select>
                                </div>
                              ))}
                              {s.topics.length === 0 && (
                                <p className="text-xs text-amber-600">
                                  No topics yet — this subject won&apos;t get
                                  any study sessions until you add at least one.
                                </p>
                              )}
                            </div>
                            <TopicInput
                              onAdd={(name) => addCustomTopic(i, name)}
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </Card>

                <ErrorMessage
                  message={error}
                  onRetry={canRetry ? handleSubmit : undefined}
                  retrying={isSubmitting}
                />

                <Button onClick={handleSubmit} isLoading={isSubmitting}>
                  Save and go to analysis
                </Button>
              </>
            );
          })()}
      </main>
    </div>
  );
}

function TopicInput({ onAdd }: { onAdd: (name: string) => void }) {
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
