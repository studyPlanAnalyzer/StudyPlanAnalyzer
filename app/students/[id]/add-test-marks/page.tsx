'use client';

import { useEffect, useState, use } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
  confidence: Level;
  label: string;
};

/* ------------------------------------------------------------------ */
/* Design tokens (shared with the dashboard and subjects pages)        */
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

// Page-level CSS: the headline animation (same as the dashboard), and a
// custom dropdown arrow so every <select> looks like the text inputs.
const PAGE_CSS = `
.sp-root { color-scheme: light; }

@keyframes sp-headline-enter {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes sp-underline-draw {
  from { transform: scaleX(0); }
  to { transform: scaleX(1); }
}
.sp-headline { animation: sp-headline-enter 700ms ease-out both; }
.sp-headline::after {
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
  animation: sp-underline-draw 900ms 400ms ease-out forwards;
}
@media (prefers-reduced-motion: reduce) {
  .sp-headline, .sp-headline::after { animation: none; opacity: 1; transform: none; }
  .sp-headline::after { transform: scaleX(1); }
}

.sp-select {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23000' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  background-size: 12px;
}
`;

// Every form control is 38px tall, 14px text, pill-shaped.
// Inputs on the white panel (test name / date):
const fieldCls =
  'h-[38px] w-full min-w-0 rounded-full border-[1.5px] border-[#dcdad3] bg-white px-4 text-sm font-semibold text-black outline-none placeholder:font-semibold placeholder:text-[#8f8f8f] focus:border-black';
// Inputs/selects sitting on a coloured card (marks):
const numCls =
  'h-[38px] rounded-full border-[1.5px] border-black/10 bg-white px-4 text-sm font-medium text-black outline-none placeholder:font-normal placeholder:text-[#8f8f8f] focus:border-black/40';
const selectCls =
  'sp-select h-[38px] rounded-full border-[1.5px] border-black/10 bg-white pl-4 pr-9 text-sm font-medium text-black outline-none focus:border-black/40';

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

type Tone = 'black' | 'white' | 'yellow';
type Size = 'md' | 'lg';

const TONE: Record<Tone, string> = {
  black: 'bg-black text-white hover:bg-black/80',
  white: 'bg-white text-black hover:bg-white/80',
  yellow:
    'bg-[#F7CC46] text-black shadow-[0_5px_12px_rgba(0,0,0,0.07)] hover:bg-[#F0C33A] hover:shadow-[0_7px_16px_rgba(0,0,0,0.10)]',
};
// md: 38px tall, 14px semibold. lg: the page's main action, sized like the
// dashboard's "Add new child" button.
const SIZE: Record<Size, string> = {
  md: 'h-[38px] px-4 text-sm',
  lg: 'h-12 px-6 text-sm sm:h-14 sm:px-7 sm:text-base',
};

function PillButton({
  tone = 'black',
  size = 'md',
  loading = false,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone;
  size?: Size;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={`inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${TONE[tone]} ${SIZE[size]} ${className}`}
      {...rest}
    >
      {loading && (
        <svg
          className="h-4 w-4 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden="true"
        >
          <circle
            cx="12"
            cy="12"
            r="9"
            stroke="currentColor"
            strokeOpacity="0.3"
            strokeWidth="3"
          />
          <path
            d="M21 12a9 9 0 0 0-9-9"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </svg>
      )}
      {children}
    </button>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block rounded-full bg-black px-3 py-1 text-[11px] font-bold uppercase leading-4 tracking-[0.15em] text-white">
      {children}
    </span>
  );
}

function Field({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="text-sm font-semibold text-black">{label}</span>
      {children}
    </label>
  );
}

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
    <div className="sp-root min-h-screen overflow-x-hidden bg-[#FAF9F6] pb-16 text-black sm:pb-8">
      <style dangerouslySetInnerHTML={{ __html: PAGE_CSS }} />

      {/* HEADER (same as the dashboard) */}
      <header className="relative z-30 bg-[#FAF9F6]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between px-5 py-5 sm:px-7 lg:px-0">
          {/* BRAND */}
          <Link href="/dashboard" className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-xl font-bold text-white sm:h-14 sm:w-14 sm:text-2xl">
              S
            </div>

            <span className="text-xl font-bold tracking-tight sm:text-2xl">
              StudyPlan Analyzer
            </span>
          </Link>

          {/* HEADER ACTION (styled like the dashboard's Log out pill) */}
          <Link
            href={`/students/${params.id}/plan`}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#F0EFED] px-5 text-sm font-semibold transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:px-6 sm:text-base"
          >
            <span aria-hidden="true">←</span>
            <span>Back to plan</span>
          </Link>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto w-full max-w-[1400px] px-5 pt-5 sm:px-7 sm:pt-8 lg:px-0">
        {!detail && !error && (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {!detail && error && (
          <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {detail && (
          <>
            {/* HERO SECTION */}
            <section className="mb-8 sm:mb-10">
              <h1 className="sp-headline relative inline-block whitespace-nowrap text-[clamp(1.15rem,5.1vw,4rem)] font-extrabold leading-tight tracking-[-0.045em]">
                Log a test.
              </h1>

              <p className="mt-4 max-w-xl text-sm leading-7 text-black sm:text-base lg:text-lg">
                For {detail.student.name} — class, home or unit test. The plan
                reschedules around the new marks right away.
              </p>
            </section>

            <div className="rounded-[32px] bg-white p-3 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-[35px]">
              {/* TEST DETAILS */}
              <div className="rounded-[28px] border-2 border-dashed border-[#d6d4cd] bg-white p-4 sm:p-5">
                <Badge>Test details</Badge>
                <div className="mt-4 grid gap-3.5 sm:grid-cols-2">
                  <Field label="Test name" className="min-w-0">
                    <input
                      type="text"
                      placeholder="e.g. Algebra unit test"
                      value={testName}
                      onChange={(e) => setTestName(e.target.value)}
                      className={fieldCls}
                    />
                  </Field>
                  <Field label="Test date" className="min-w-0">
                    <input
                      type="date"
                      value={testDate}
                      onChange={(e) => setTestDate(e.target.value)}
                      className={fieldCls}
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
                        className={`${numCls} w-32`}
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
                        className={`${numCls} w-24`}
                      />
                      <select
                        aria-label={`Confidence for ${t.name}`}
                        value={m.topicMarks[t.id]?.confidence ?? 'medium'}
                        onChange={(e) =>
                          updateTopicMark(i, t.id, {
                            confidence: e.target.value as Level,
                          })
                        }
                        className={`${selectCls} w-[126px]`}
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>
                  );

                  return (
                    <article
                      key={m.subjectId}
                      className={`rounded-[2rem] p-4 sm:p-7 ${CARD_COLORS[i % CARD_COLORS.length]}`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
                        <div className="min-w-0">
                          <Badge>
                            {m.byTopic ? 'Per topic' : 'Whole subject'}
                          </Badge>
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
                              className={`${numCls} w-32`}
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
                              className={`${numCls} w-24`}
                            />
                            <select
                              aria-label={`Confidence for ${m.name}`}
                              value={m.confidenceLevel}
                              onChange={(e) =>
                                updateMark(i, {
                                  confidenceLevel: e.target
                                    .value as TestMarkEntry['confidenceLevel'],
                                })
                              }
                              className={`${selectCls} w-[126px]`}
                            >
                              <option value="low">Low</option>
                              <option value="medium">Medium</option>
                              <option value="high">High</option>
                            </select>
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
                          <PillButton
                            tone="white"
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
                          </PillButton>
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
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* ACTIONS */}
            <div className="mt-8">
              {saved ? (
                <div className="flex flex-wrap items-center gap-4">
                  <PillButton
                    size="lg"
                    onClick={retryPlanUpdate}
                    loading={isSubmitting}
                  >
                    Try updating the plan again
                  </PillButton>
                  <Link
                    href={`/students/${params.id}/plan`}
                    className="text-sm font-semibold text-black underline underline-offset-4 sm:text-base"
                  >
                    Go to the plan
                  </Link>
                </div>
              ) : (
                <PillButton
                  tone="black"
                  size="lg"
                  onClick={handleSubmit}
                  loading={isSubmitting}
                >
                  {detail.latestPlan
                    ? 'Save marks & update plan'
                    : 'Save marks'}
                </PillButton>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
