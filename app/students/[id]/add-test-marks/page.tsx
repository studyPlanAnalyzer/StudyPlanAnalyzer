'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { Button } from '@/components/ui/Button';
import { cardClass } from '@/components/ui/Card';
import { Field, Select, fieldClass, fieldOnColourShapeClass } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { PageTitle } from '@/components/ui/PageTitle';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { Tag } from '@/components/ui/Tag';
import { api, ApiError } from '@/lib/api-client';
import { todayKey } from '@/lib/utils/date-utils';

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

type Level = 'low' | 'medium' | 'high';

interface TestMarkEntry {
  subjectId: string;
  name: string;
  obtainedMarks: string;
  fullMarks: string;
  confidenceLevel: 'low' | 'medium' | 'high';
  // false: one mark for the whole subject. true: a separate mark per topic.
  byTopic: boolean;
  topicMarks: Record<
    string,
    {
      obtained: string;
      full: string;
      // This topic's own confidence: it can differ from the subject's.
      confidence: Level;
    }
  >;
}

const todayDateString = todayKey;

// One mark this form will save. Declared so a subject-level mark (no topic)
// and a topic-level mark have the same type.
type EntryRow = {
  m: TestMarkEntry;
  topicId: string | null;
  obtained: string;
  full: string;
  confidence: Level;
  label: string;
};

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


const iconProps = {
  fill: 'none',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};
function ClipboardIcon({
  className = 'h-[22px] w-[22px]',
}: {
  className?: string;
}) {
  return (
    <svg className={className} {...iconProps}>
      <rect x="5" y="4" width="14" height="18" rx="2" />
      <path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4" />
    </svg>
  );
}
function CornerIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M5 5v6a3 3 0 0 0 3 3h11M15 10l4 4-4 4" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AddTestMarksPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = use(props.params);
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
    patch: Partial<{ obtained: string; full: string; confidence: Level }>,
  ) {
    const m = marks[index];
    const current = m.topicMarks[topicId] ?? {
      obtained: '',
      full: m.fullMarks,
      confidence: 'medium' as Level,
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
              confidence: t.confidence,
              label: `${m.name} (${(detail?.topics ?? []).find((x) => x.id === topicId)?.name})`,
            }))
        : m.obtainedMarks !== ''
          ? [
              {
                m,
                topicId: null,
                obtained: m.obtainedMarks,
                full: m.fullMarks,
                confidence: m.confidenceLevel,
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
          confidenceLevel: e.confidence,
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
    <PageShell className="pb-16 sm:pb-8">
      <AppHeader>
        <BackLink href={`/students/${params.id}/plan`} label="Back to plan" />
      </AppHeader>

      <PageMain>
        {!detail && !error && (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!detail && error && (
          <Notice className="mb-5">
            {error}
          </Notice>
        )}

        {detail && (
          <>
            {/* HERO SECTION */}
            <section className="mb-8 sm:mb-10">
              <PageTitle>Log a test.</PageTitle>

              <p className="mt-4 max-w-xl text-sm leading-7 text-black sm:text-base lg:text-lg">
                For {detail.student.name} — class, home or unit test. The plan
                reschedules around the new marks right away.
              </p>
            </section>

            <div className={`${cardClass} p-4 sm:p-8`}>
              {/* TEST DETAILS */}
              <div className="rounded-[28px] border-2 border-dashed border-[#d6d4cd] bg-white p-4 sm:p-5">
                <Tag>Test details</Tag>
                <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
                  <Field label="Test name" className="min-w-0">
                    <input
                      type="text"
                      placeholder="e.g. Algebra unit test"
                      value={testName}
                      onChange={(e) => setTestName(e.target.value)}
                      className={fieldClass}
                    />
                  </Field>
                  <Field label="Test date" className="min-w-0">
                    <input
                      type="date"
                      value={testDate}
                      onChange={(e) => setTestDate(e.target.value)}
                      className={fieldClass}
                    />
                  </Field>
                </div>
              </div>

              {/* MARKS */}
              <div className="mb-5 mt-8 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-black sm:text-3xl">
                    Marks
                  </h2>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-[#65615D] sm:text-base">
                    Leave any subject this test didn&apos;t cover blank.
                    &quot;Out of&quot; can differ from the usual full marks —
                    e.g. a /20 quiz.
                  </p>
                </div>
                <ClipboardIcon className="mt-1 h-[22px] w-[22px] shrink-0 text-black" />
              </div>

              <div className="flex flex-col gap-5">
                {marks.map((m, i) => {
                  const topicRows = topicGroups(m.subjectId);

                  // One topic's inputs: score, "out of", confidence.
                  const renderLeaf = (t: Topic, isSub: boolean) => (
                    <div
                      key={t.id}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <span
                        className={`flex min-w-[10rem] flex-1 items-center gap-2 text-black ${
                          isSub ? 'text-sm font-normal' : 'text-base font-bold'
                        }`}
                      >
                        {isSub && (
                          <CornerIcon className="h-4 w-4 shrink-0 text-black/50" />
                        )}
                        {t.name}
                      </span>
                      <input
                        type="number"
                        min="0"
                        placeholder="Obtained"
                        aria-label={`Marks obtained for ${t.name}`}
                        value={m.topicMarks[t.id]?.obtained ?? ''}
                        onChange={(e) =>
                          updateTopicMark(i, t.id, {
                            obtained: e.target.value,
                          })
                        }
                        className={`${fieldOnColourShapeClass} w-32`}
                      />
                      <span className="text-sm font-semibold text-black">
                        out of
                      </span>
                      <input
                        type="number"
                        min="1"
                        aria-label={`Out of, for ${t.name}`}
                        value={m.topicMarks[t.id]?.full ?? m.fullMarks}
                        onChange={(e) =>
                          updateTopicMark(i, t.id, { full: e.target.value })
                        }
                        className={`${fieldOnColourShapeClass} w-24`}
                      />
                      <Select
                        aria-label={`Confidence for ${t.name}`}
                        value={m.topicMarks[t.id]?.confidence ?? 'medium'}
                        onChange={(e) =>
                          updateTopicMark(i, t.id, {
                            confidence: e.target.value as Level,
                          })
                        }
                        onColour
                        className="w-[140px]"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </Select>
                    </div>
                  );

                  return (
                    <article
                      key={m.subjectId}
                      className={`rounded-[2rem] p-4 sm:p-7 ${CARD_COLORS[i % CARD_COLORS.length]}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
                        <div className="min-w-0">
                          <Tag>
                            {m.byTopic ? 'Per topic' : 'Whole subject'}
                          </Tag>
                          <h3 className="mt-3.5 break-words text-2xl font-bold tracking-tight text-black sm:text-3xl">
                            {m.name}
                          </h3>
                        </div>
                        {!m.byTopic && (
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              placeholder="Obtained"
                              aria-label={`Marks obtained for ${m.name}`}
                              value={m.obtainedMarks}
                              onChange={(e) =>
                                updateMark(i, {
                                  obtainedMarks: e.target.value,
                                })
                              }
                              className={`${fieldOnColourShapeClass} w-32`}
                            />
                            <span className="text-sm font-semibold text-black">
                              out of
                            </span>
                            <input
                              type="number"
                              min="1"
                              aria-label={`Out of marks for ${m.name}`}
                              value={m.fullMarks}
                              onChange={(e) =>
                                updateMark(i, { fullMarks: e.target.value })
                              }
                              className={`${fieldOnColourShapeClass} w-24`}
                            />
                            <Select
                              aria-label={`Confidence for ${m.name}`}
                              value={m.confidenceLevel}
                              onChange={(e) =>
                                updateMark(i, {
                                  confidenceLevel: e.target
                                    .value as TestMarkEntry['confidenceLevel'],
                                })
                              }
                              onColour
                              className="w-[140px]"
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </Select>
                          </div>
                        )}
                      </div>

                      {m.byTopic && (
                        <div className="mt-6">
                          <p className="mb-3 text-sm font-semibold leading-6 text-black">
                            Enter a score and confidence for each topic covered.
                            Leave the rest blank.
                          </p>
                          {topicRows.length > 0 ? (
                            <ul className="flex flex-col gap-3">
                              {topicRows.map((g) => (
                                <li
                                  key={g.heading ?? g.leaves[0].id}
                                  className="min-w-0 rounded-3xl bg-white/[0.55] p-3 sm:p-3.5"
                                >
                                  {g.heading ? (
                                    <>
                                      <h4 className="min-h-6 text-base font-bold text-black">
                                        {g.heading}
                                      </h4>
                                      <div className="mt-2.5 flex min-w-0 flex-col gap-3 border-l-[1.5px] border-black/20 pl-3.5">
                                        {g.leaves.map((t) =>
                                          renderLeaf(t, true),
                                        )}
                                      </div>
                                    </>
                                  ) : (
                                    renderLeaf(g.leaves[0], false)
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="rounded-3xl bg-white/[0.55] px-4 py-3 text-sm font-semibold leading-6 text-black">
                              No topics have been added for this subject yet.
                            </p>
                          )}
                        </div>
                      )}

                      {topicRows.length > 0 && (
                        <div className="mt-6">
                          <Button
                            variant="white"
                            wrap
                            onClick={() =>
                              updateMark(i, {
                                byTopic: !m.byTopic,
                                obtainedMarks: '',
                                topicMarks: {},
                              })
                            }
                          >
                            {m.byTopic
                              ? 'Log one mark for the whole subject'
                              : 'Log separate marks per topic'}
                          </Button>
                        </div>
                      )}
                    </article>
                  );
                })}
                {marks.length === 0 && (
                  <div className="rounded-[28px] bg-[#f4f3ee] p-5">
                    <p className="text-sm leading-6 text-[#65615D] sm:text-base">
                      No subjects yet — add subjects from a new exam cycle
                      first.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {error && (
              <Notice className="mt-5">
                {error}
              </Notice>
            )}

            {/* ACTIONS */}
            <div className="mt-8">
              {saved ? (
                <div className="flex flex-wrap items-center gap-4">
                  <Button
                    size="lg"
                    onClick={retryPlanUpdate}
                    isLoading={isSubmitting}
                  >
                    Try updating the plan again
                  </Button>
                  <Link
                    href={`/students/${params.id}/plan`}
                    className="inline-flex min-h-11 items-center text-sm font-semibold text-black underline underline-offset-4 sm:text-base"
                  >
                    Go to the plan
                  </Link>
                </div>
              ) : (
                <Button
                  size="lg"
                  onClick={handleSubmit}
                  isLoading={isSubmitting}
                >
                  {detail.latestPlan
                    ? 'Save marks & update plan'
                    : 'Save marks'}
                </Button>
              )}
            </div>
          </>
        )}
      </PageMain>
    </PageShell>
  );
}
