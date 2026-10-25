'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { ErrorMessage } from '@/components/ui/ErrorMessage';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api-client';
import { suggestTopicsFor } from '@/lib/common-topics';

interface Subject {
  id: string;
  name: string;
  fullMarks: number;
  examWeight: 'low' | 'medium' | 'high';
}

interface Topic {
  id: string;
  name: string;
  subjectId: string;
  parentTopicId: string | null;
}

interface StudentDetail {
  student: { id: string; name: string };
  subjects: Subject[];
  topics: Topic[];
  exams: { id: string; name: string; examDate: string; isPrimary: boolean }[];
  latestPlan?: { id: string } | null;
}

// One row of the marksheet: the LOWEST level of the hierarchy, which is what
// analysis and plans work on. That is a sub-topic, a topic that has no
// sub-topics, or (for a subject with no topics yet) the subject itself.
interface MarkEntry {
  key: string; // topic id, or the subject id for a subject with no topics
  subjectId: string;
  subjectName: string;
  topicId: string | null;
  groupName: string | null; // the parent topic of a sub-topic
  label: string;
  fullMarks: string; // 0 = not in this exam, nothing is saved for it
  obtainedMarks: string;
  confidenceLevel: 'low' | 'medium' | 'high';
}

function buildMarkEntries(subjects: Subject[], topics: Topic[]): MarkEntry[] {
  const entries: MarkEntry[] = [];
  for (const s of subjects) {
    const own = topics.filter((t) => t.subjectId === s.id);
    const parentIds = new Set(own.map((t) => t.parentTopicId).filter(Boolean));
    const base = {
      subjectId: s.id,
      subjectName: s.name,
      fullMarks: '',
      obtainedMarks: '',
      confidenceLevel: 'medium' as const,
    };
    if (own.length === 0) {
      entries.push({
        ...base,
        key: s.id,
        topicId: null,
        groupName: null,
        label: s.name,
      });
      continue;
    }
    for (const top of own.filter((t) => !t.parentTopicId)) {
      if (parentIds.has(top.id)) {
        for (const sub of own.filter((t) => t.parentTopicId === top.id)) {
          entries.push({
            ...base,
            key: sub.id,
            topicId: sub.id,
            groupName: top.name,
            label: sub.name,
          });
        }
      } else {
        entries.push({
          ...base,
          key: top.id,
          topicId: top.id,
          groupName: null,
          label: top.name,
        });
      }
    }
  }
  return entries;
}

function entryPath(m: MarkEntry): string {
  if (!m.topicId) return m.label;
  return m.groupName
    ? `${m.subjectName} › ${m.groupName} › ${m.label}`
    : `${m.subjectName} › ${m.label}`;
}

interface NewSubjectEntry {
  name: string;
  fullMarks: number;
  examWeight: 'low' | 'medium' | 'high';
  obtainedMarks: string;
  confidenceLevel: 'low' | 'medium' | 'high';
  topics: { name: string; difficultyRating: number; selected: boolean }[];
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function NewExamPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [examName, setExamName] = useState('');
  const [examDate, setExamDate] = useState('');
  const [marks, setMarks] = useState<MarkEntry[]>([]);
  const [newSubjects, setNewSubjects] = useState<NewSubjectEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    api
      .get<StudentDetail>(`/api/students/${params.id}`)
      .then((data) => {
        setDetail(data);
        setMarks(buildMarkEntries(data.subjects, data.topics));
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError(
          err instanceof ApiError && err.retryable
            ? err.message
            : "Couldn't load this student. Please try refreshing.",
        );
      });
  }, [params.id, router]);

  function updateMark(key: string, patch: Partial<MarkEntry>) {
    setMarks((prev) =>
      prev.map((m) => (m.key === key ? { ...m, ...patch } : m)),
    );
  }

  function addNewSubject() {
    setNewSubjects((prev) => [
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

  function updateNewSubject(index: number, patch: Partial<NewSubjectEntry>) {
    setNewSubjects((prev) =>
      prev.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    );
  }

  function removeNewSubject(index: number) {
    setNewSubjects((prev) => prev.filter((_, i) => i !== index));
  }

  function refreshTopicSuggestions(index: number) {
    setNewSubjects((prev) =>
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

  function toggleNewSubjectTopic(subjectIndex: number, topicIndex: number) {
    setNewSubjects((prev) =>
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

  function setNewSubjectTopicDifficulty(
    subjectIndex: number,
    topicIndex: number,
    difficulty: number,
  ) {
    setNewSubjects((prev) =>
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

  function addCustomNewSubjectTopic(subjectIndex: number, name: string) {
    if (!name.trim()) return;
    setNewSubjects((prev) =>
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

  function validate(): string | null {
    if (!examName.trim() || !examDate) return 'Enter the exam name and date.';
    if (new Date(examDate).getTime() <= Date.now())
      return 'Exam date must be in the future.';
    // Every lowest-level item needs an entry. "Out of" 0 means it isn't in
    // this exam, so nothing is recorded for it.
    for (const m of marks) {
      const full = Number(m.fullMarks);
      if (m.fullMarks.trim() === '' || !Number.isInteger(full) || full < 0)
        return `Enter the full marks for ${entryPath(m)} (enter 0 if it isn't in this exam).`;
      if (full === 0) continue;
      const val = Number(m.obtainedMarks);
      if (
        m.obtainedMarks.trim() === '' ||
        !Number.isInteger(val) ||
        val < 0 ||
        val > full
      )
        return `Enter valid marks for ${entryPath(m)} (0–${full}).`;
    }
    for (const s of newSubjects) {
      if (!s.name.trim()) return 'Every new subject needs a name.';
      const taken = [
        ...(detail?.subjects ?? []).map((sub) => sub.name),
        ...newSubjects.filter((o) => o !== s).map((o) => o.name),
      ].some((n) => n.trim().toLowerCase() === s.name.trim().toLowerCase());
      if (taken)
        return `${s.name.trim()} is already a subject. Each subject can only be listed once.`;
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
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      setCanRetry(false);
      return;
    }
    setError(null);
    setCanRetry(false);
    setIsSubmitting(true);

    try {
      // One request: the new exam, the marksheet, any new subjects and their
      // topics are saved together, or not at all, so retrying is always safe.
      await api.post(`/api/students/${params.id}/exam-cycle`, {
        name: examName.trim(),
        examDate,
        // One mark per lowest-level item that is in this exam.
        marks: marks
          .filter((m) => Number(m.fullMarks) > 0)
          .map((m) => ({
            subjectId: m.subjectId,
            obtainedMarks: Number(m.obtainedMarks),
            fullMarks: Number(m.fullMarks),
            confidenceLevel: m.confidenceLevel,
            topicIds: m.topicId ? [m.topicId] : [],
          })),
        newSubjects: newSubjects.map((s) => ({
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
      });
      router.push(`/students/${params.id}/analysis`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setCanRetry(err.retryable);
      } else {
        setError("Couldn't save the new exam. Please try again.");
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
            href={`/students/${params.id}/analysis`}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Back to analysis
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
              const hasPlan = !!detail.latestPlan;

              if (!hasPlan) {
                return (
                  <Card className="border-amber-200 bg-amber-50">
                    <h2 className="text-base font-semibold text-amber-900">
                      You don&apos;t have a study plan yet
                    </h2>
                    <p className="mt-2 text-sm text-amber-800">
                      Go back and create a plan from the analysis page first.
                      Your current exam, &ldquo;{activeExam.name}&rdquo;, runs
                      until {new Date(activeExam.examDate).toLocaleDateString()}
                      , and a new exam cycle can only start once it&apos;s over.
                    </p>
                    <div className="mt-4 flex gap-2">
                      <Link href={`/students/${params.id}/analysis`}>
                        <Button size="sm">Go to analysis</Button>
                      </Link>
                    </div>
                  </Card>
                );
              }

              return (
                <Card className="border-amber-200 bg-amber-50">
                  <h2 className="text-base font-semibold text-amber-900">
                    &ldquo;{activeExam.name}&rdquo; is still active
                  </h2>
                  <p className="mt-2 text-sm text-amber-800">
                    It doesn&apos;t end until{' '}
                    {new Date(activeExam.examDate).toLocaleDateString()}. A new
                    exam cycle can only start once the current one is over —
                    otherwise the study plan has no clear exam to build toward.
                  </p>
                  <p className="mt-2 text-sm text-amber-800">
                    Need this exam to end sooner instead? Edit its date directly
                    in Settings rather than starting a new cycle.
                  </p>
                  <div className="mt-4 flex gap-2">
                    <Link href={`/students/${params.id}/settings`}>
                      <Button size="sm">Go to Settings</Button>
                    </Link>
                    <Link href={`/students/${params.id}/plan`}>
                      <Button size="sm" variant="secondary">
                        Back to plan
                      </Button>
                    </Link>
                  </div>
                </Card>
              );
            }
            return (
              <>
                <h1 className="mb-1 text-2xl font-semibold text-slate-900">
                  Start a new exam cycle
                </h1>
                <p className="mb-6 text-sm text-slate-500">
                  For {detail.student.name}. This retires the current exam,
                  records fresh marks, and lets you generate a new plan aimed at
                  the next test date.
                </p>

                <Card className="mb-6">
                  <h2 className="mb-4 text-base font-semibold text-slate-900">
                    Next exam
                  </h2>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Input
                      label="Exam name"
                      placeholder="e.g. Final Term 2026"
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
                  <h2 className="mb-4 text-base font-semibold text-slate-900">
                    Latest marks
                  </h2>
                  <p className="mb-3 text-xs text-slate-500">
                    Enter the latest result for every topic and sub-topic. If
                    something won&apos;t be in this exam, set its &ldquo;Out
                    of&rdquo; to 0 and nothing is recorded for it.
                  </p>
                  <div className="flex flex-col gap-4">
                    {detail.subjects.map((subject) => {
                      const rows = marks.filter(
                        (m) => m.subjectId === subject.id,
                      );
                      let lastGroup: string | null = null;
                      return (
                        <div
                          key={subject.id}
                          className="rounded-lg border border-slate-200 p-3"
                        >
                          <p className="mb-2 text-sm font-semibold text-slate-800">
                            {subject.name}
                          </p>
                          <div className="flex flex-col gap-3">
                            {rows.map((m) => {
                              const showGroup =
                                m.groupName !== null &&
                                m.groupName !== lastGroup;
                              lastGroup = m.groupName;
                              const notInExam = m.fullMarks.trim() === '0';
                              return (
                                <div key={m.key}>
                                  {showGroup && (
                                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                                      {m.groupName}
                                    </p>
                                  )}
                                  <div className="flex flex-wrap items-end gap-3">
                                    <div className="min-w-[8rem] flex-1 text-sm text-slate-700">
                                      {m.topicId ? m.label : 'Whole subject'}
                                      {!m.topicId && (
                                        <span className="block text-xs text-slate-400">
                                          No topics yet. Add some on the
                                          Subjects page for a finer plan.
                                        </span>
                                      )}
                                    </div>
                                    <Input
                                      label="Out of"
                                      type="number"
                                      min={0}
                                      className="w-24"
                                      value={m.fullMarks}
                                      onChange={(e) =>
                                        updateMark(m.key, {
                                          fullMarks: e.target.value,
                                        })
                                      }
                                    />
                                    <Input
                                      label="Obtained"
                                      type="number"
                                      min={0}
                                      className="w-24"
                                      disabled={notInExam}
                                      value={notInExam ? '' : m.obtainedMarks}
                                      onChange={(e) =>
                                        updateMark(m.key, {
                                          obtainedMarks: e.target.value,
                                        })
                                      }
                                    />
                                    <div className="flex flex-col gap-1">
                                      <label className="text-sm font-medium text-slate-700">
                                        Confidence
                                      </label>
                                      <select
                                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
                                        disabled={notInExam}
                                        value={m.confidenceLevel}
                                        onChange={(e) =>
                                          updateMark(m.key, {
                                            confidenceLevel: e.target
                                              .value as MarkEntry['confidenceLevel'],
                                          })
                                        }
                                      >
                                        <option value="low">Low</option>
                                        <option value="medium">Medium</option>
                                        <option value="high">High</option>
                                      </select>
                                    </div>
                                  </div>
                                  {notInExam && (
                                    <p className="mt-1 text-xs text-slate-400">
                                      Not in this exam. Nothing will be recorded
                                      for it.
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                    {detail.subjects.length === 0 && (
                      <p className="text-sm text-slate-400">
                        No subjects yet — add one below.
                      </p>
                    )}
                  </div>
                </Card>

                <Card className="mb-6">
                  <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-900">
                      New subjects (optional)
                    </h2>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={addNewSubject}
                    >
                      + Add subject
                    </Button>
                  </div>
                  {newSubjects.length === 0 && (
                    <p className="text-sm text-slate-400">
                      Only needed if a subject is being tested for the first
                      time.
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
                              updateNewSubject(i, { name: e.target.value })
                            }
                            onBlur={() => refreshTopicSuggestions(i)}
                          />
                          <Input
                            label="Full marks"
                            type="number"
                            className="w-28"
                            value={s.fullMarks}
                            onChange={(e) =>
                              updateNewSubject(i, {
                                fullMarks: Number(e.target.value),
                              })
                            }
                          />
                          <Input
                            label="Obtained"
                            type="number"
                            className="w-28"
                            value={s.obtainedMarks}
                            onChange={(e) =>
                              updateNewSubject(i, {
                                obtainedMarks: e.target.value,
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
                                updateNewSubject(i, {
                                  examWeight: e.target
                                    .value as NewSubjectEntry['examWeight'],
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
                            onClick={() => removeNewSubject(i)}
                          >
                            Remove
                          </Button>
                        </div>

                        {s.name.trim() && (
                          <div className="mt-3 border-t border-slate-100 pt-3">
                            <p className="mb-2 text-xs font-medium text-slate-500">
                              Topics for {s.name} (needed so the plan can
                              schedule sessions for this subject)
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
                                    onChange={() => toggleNewSubjectTopic(i, j)}
                                    className="h-4 w-4 rounded border-slate-300"
                                  />
                                  <span className="flex-1 text-sm text-slate-700">
                                    {t.name}
                                  </span>
                                  <select
                                    className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                                    value={t.difficultyRating}
                                    onChange={(e) =>
                                      setNewSubjectTopicDifficulty(
                                        i,
                                        j,
                                        Number(e.target.value),
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
                            <NewSubjectTopicInput
                              onAdd={(name) =>
                                addCustomNewSubjectTopic(i, name)
                              }
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

function NewSubjectTopicInput({ onAdd }: { onAdd: (name: string) => void }) {
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
