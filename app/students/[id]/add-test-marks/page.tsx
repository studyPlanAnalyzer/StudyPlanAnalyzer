'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api-client';

interface Subject {
  id: string;
  name: string;
  fullMarks: number;
}

interface Topic {
  id: string;
  name: string;
  subjectId: string;
  parentTopicId: string | null;
}

interface Exam {
  id: string;
  isPrimary: boolean;
}

interface StudentDetail {
  student: { id: string; name: string };
  subjects: Subject[];
  topics: Topic[];
  exams: Exam[];
  latestPlan: { id: string } | null;
}

interface TestMarkEntry {
  subjectId: string;
  name: string;
  obtainedMarks: string;
  fullMarks: string;
  confidenceLevel: 'low' | 'medium' | 'high';
  // false: one mark for the whole subject. true: a separate mark per topic.
  byTopic: boolean;
  topicMarks: Record<string, { obtained: string; full: string }>;
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

// One mark this form will save. Declared so a subject-level mark (no topic)
// and a topic-level mark have the same type.
type EntryRow = {
  m: TestMarkEntry;
  topicId: string | null;
  obtained: string;
  full: string;
  label: string;
};

export default function AddTestMarksPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [testName, setTestName] = useState('');
  const [testDate, setTestDate] = useState(todayDateString());
  const [marks, setMarks] = useState<TestMarkEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api
      .get<StudentDetail>(`/api/students/${params.id}`)
      .then((data) => {
        setDetail(data);
        setMarks(
          data.subjects.map((s) => ({
            subjectId: s.id,
            name: s.name,
            obtainedMarks: '',
            fullMarks: String(s.fullMarks),
            confidenceLevel: 'medium',
            byTopic: false,
            topicMarks: {},
          })),
        );
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError("Couldn't load this student. Please try refreshing.");
      });
  }, [params.id, router]);

  function updateMark(index: number, patch: Partial<TestMarkEntry>) {
    setMarks((prev) =>
      prev.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }

  // Topics to log marks for: sub-topics where a topic has them, otherwise the
  // topic itself, grouped under their parent topic's name.
  function topicGroups(subjectId: string) {
    const ts = (detail?.topics ?? []).filter((t) => t.subjectId === subjectId);
    const parentIds = new Set(ts.map((t) => t.parentTopicId));
    return ts
      .filter((t) => !t.parentTopicId)
      .map((t) =>
        parentIds.has(t.id)
          ? {
              heading: t.name,
              leaves: ts.filter((c) => c.parentTopicId === t.id),
            }
          : { heading: null, leaves: [t] },
      );
  }

  function updateTopicMark(
    index: number,
    topicId: string,
    patch: Partial<{ obtained: string; full: string }>,
  ) {
    const m = marks[index];
    const current = m.topicMarks[topicId] ?? {
      obtained: '',
      full: m.fullMarks,
    };
    updateMark(index, {
      topicMarks: { ...m.topicMarks, [topicId]: { ...current, ...patch } },
    });
  }

  // The marks this form will save: one per subject, or one per topic.
  function entries() {
    return marks.flatMap<EntryRow>((m) =>
      m.byTopic
        ? Object.entries(m.topicMarks)
            .filter(([, t]) => t.obtained !== '')
            .map(([topicId, t]) => ({
              m,
              topicId,
              obtained: t.obtained,
              full: t.full,
              label: `${m.name} (${(detail?.topics ?? []).find((x) => x.id === topicId)?.name})`,
            }))
        : m.obtainedMarks !== ''
          ? [
              {
                m,
                topicId: null,
                obtained: m.obtainedMarks,
                full: m.fullMarks,
                label: m.name,
              },
            ]
          : [],
    );
  }

  function validate(): string | null {
    if (!testName.trim())
      return 'Give this test a name, e.g. "Algebra unit test".';
    if (!testDate) return 'Enter the date this test happened.';
    const filled = entries();
    if (filled.length === 0) return 'Enter marks for at least one subject.';
    for (const e of filled) {
      const full = Number(e.full);
      const obtained = Number(e.obtained);
      if (Number.isNaN(full) || full <= 0)
        return `Enter a valid "out of" total for ${e.label}.`;
      if (Number.isNaN(obtained) || obtained < 0 || obtained > full) {
        return `Enter valid marks for ${e.label} (0–${full}).`;
      }
    }
    return null;
  }

  async function handleSubmit() {
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const currentExam = detail?.exams.find((e) => e.isPrimary) ?? null;

      // One request: the test and all its marks are saved together or not at all.
      await api.post(`/api/students/${params.id}/tests`, {
        examId: currentExam?.id,
        assessmentDate: testDate,
        assessmentName: testName.trim(),
        marks: entries().map((e) => ({
          subjectId: e.m.subjectId,
          obtainedMarks: Number(e.obtained),
          fullMarks: Number(e.full),
          confidenceLevel: e.m.confidenceLevel,
          topicIds: e.topicId ? [e.topicId] : [],
        })),
      });
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save these marks. Nothing was saved — please try again.",
      );
      setIsSubmitting(false);
      return;
    }

    // The marks are saved from here on. Rescheduling is a separate step so a
    // failure there never makes the user log the same test twice.
    setSaved(true);
    if (!detail?.latestPlan) {
      router.push(`/students/${params.id}/analysis`);
      return;
    }
    try {
      await api.post(`/api/plans/${detail.latestPlan.id}/regenerate`);
      router.push(`/students/${params.id}/plan?planId=${detail.latestPlan.id}`);
    } catch {
      setError(
        "Your marks were saved, but the plan couldn't be updated just now. Open the plan and press regenerate, or try again below.",
      );
      setIsSubmitting(false);
    }
  }

  // After the marks are saved, "try again" only retries the plan update.
  async function retryPlanUpdate() {
    if (!detail?.latestPlan) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post(`/api/plans/${detail.latestPlan.id}/regenerate`);
      router.push(`/students/${params.id}/plan?planId=${detail.latestPlan.id}`);
    } catch {
      setError(
        "The plan still couldn't be updated. Your marks are saved; you can regenerate the plan from its page.",
      );
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
            href={`/students/${params.id}/plan`}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Back to plan
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {!detail && (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {detail && (
          <>
            <h1 className="mb-1 text-2xl font-semibold text-slate-900">
              Log a class or unit test
            </h1>
            <p className="mb-6 text-sm text-slate-500">
              For {detail.student.name}. Use this any time — for a class test,
              home test, or unit test. It doesn&apos;t change which exam the
              plan is aimed at, but{' '}
              {detail.latestPlan
                ? 'it will immediately reschedule the plan around the new marks.'
                : 'it will feed into the plan once one is generated.'}
            </p>

            <Card className="mb-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  label="Test name"
                  placeholder="e.g. Algebra unit test"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                />
                <Input
                  label="Test date"
                  type="date"
                  value={testDate}
                  onChange={(e) => setTestDate(e.target.value)}
                />
              </div>
            </Card>

            <Card className="mb-6">
              <h2 className="mb-1 text-base font-semibold text-slate-900">
                Marks
              </h2>
              <p className="mb-3 text-xs text-slate-500">
                Leave any subject this test didn&apos;t cover blank. The
                &quot;out of&quot; total can be different from the
                subject&apos;s usual full marks — e.g. a /20 quiz.
              </p>
              <div className="flex flex-col gap-3">
                {marks.map((m, i) => (
                  <div
                    key={m.subjectId}
                    className="rounded-lg border border-slate-200 p-3"
                  >
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="min-w-[8rem] flex-1 text-sm font-medium text-slate-700">
                        {m.name}
                      </div>
                      {!m.byTopic && (
                        <>
                          <Input
                            label="Marks obtained"
                            type="number"
                            className="w-32"
                            value={m.obtainedMarks}
                            onChange={(e) =>
                              updateMark(i, { obtainedMarks: e.target.value })
                            }
                          />
                          <Input
                            label="Out of"
                            type="number"
                            className="w-24"
                            value={m.fullMarks}
                            onChange={(e) =>
                              updateMark(i, { fullMarks: e.target.value })
                            }
                          />
                        </>
                      )}
                      <div className="flex flex-col gap-1">
                        <label className="text-sm font-medium text-slate-700">
                          Confidence
                        </label>
                        <select
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                          value={m.confidenceLevel}
                          onChange={(e) =>
                            updateMark(i, {
                              confidenceLevel: e.target
                                .value as TestMarkEntry['confidenceLevel'],
                            })
                          }
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                        </select>
                      </div>
                    </div>

                    {topicGroups(m.subjectId).length > 0 && (
                      <div className="mt-2">
                        {m.byTopic && (
                          <div className="mb-2 flex flex-col gap-2 rounded-lg bg-slate-50 p-2">
                            <p className="text-xs text-slate-500">
                              Enter a score for each topic this test covered.
                              Leave the rest blank.
                            </p>
                            {topicGroups(m.subjectId).map((g) => (
                              <div key={g.heading ?? g.leaves[0].id}>
                                {g.heading && (
                                  <p className="mb-1 text-xs font-medium text-slate-600">
                                    {g.heading}
                                  </p>
                                )}
                                <div className="flex flex-col gap-1.5">
                                  {g.leaves.map((t) => (
                                    <div
                                      key={t.id}
                                      className="flex flex-wrap items-center gap-2"
                                    >
                                      <span className="min-w-[8rem] flex-1 text-sm text-slate-700">
                                        {t.name}
                                      </span>
                                      <input
                                        type="number"
                                        aria-label={`Marks obtained for ${t.name}`}
                                        placeholder="Obtained"
                                        className="w-24 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                                        value={
                                          m.topicMarks[t.id]?.obtained ?? ''
                                        }
                                        onChange={(e) =>
                                          updateTopicMark(i, t.id, {
                                            obtained: e.target.value,
                                          })
                                        }
                                      />
                                      <span className="text-xs text-slate-400">
                                        out of
                                      </span>
                                      <input
                                        type="number"
                                        aria-label={`Out of, for ${t.name}`}
                                        className="w-20 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                                        value={
                                          m.topicMarks[t.id]?.full ??
                                          m.fullMarks
                                        }
                                        onChange={(e) =>
                                          updateTopicMark(i, t.id, {
                                            full: e.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          className="text-xs text-indigo-600 hover:text-indigo-700"
                          onClick={() =>
                            updateMark(i, {
                              byTopic: !m.byTopic,
                              obtainedMarks: '',
                              topicMarks: {},
                            })
                          }
                        >
                          {m.byTopic
                            ? 'Log one mark for the whole subject instead'
                            : 'Log separate marks per topic instead'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {marks.length === 0 && (
                  <p className="text-sm text-slate-400">
                    No subjects yet — add subjects from a new exam cycle first.
                  </p>
                )}
              </div>
            </Card>

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            {saved ? (
              <div className="flex items-center gap-3">
                <Button onClick={retryPlanUpdate} isLoading={isSubmitting}>
                  Try updating the plan again
                </Button>
                <Link
                  href={`/students/${params.id}/plan`}
                  className="text-sm text-indigo-600"
                >
                  Go to the plan
                </Link>
              </div>
            ) : (
              <Button onClick={handleSubmit} isLoading={isSubmitting}>
                {detail.latestPlan ? 'Save marks & update plan' : 'Save marks'}
              </Button>
            )}
          </>
        )}
      </main>
    </div>
  );
}
