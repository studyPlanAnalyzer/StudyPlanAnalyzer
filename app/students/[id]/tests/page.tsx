'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/Input';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { TopicScopeSelector } from '@/components/session/TopicScopeSelector';
import { api, ApiError } from '@/lib/api-client';

type Confidence = 'low' | 'medium' | 'high';

interface MarkRow {
  id: string;
  subjectId: string;
  obtainedMarks: number;
  fullMarks: number;
  confidenceLevel: Confidence | null;
  topicIds: string[];
}

interface AssessmentRow {
  id: string;
  assessmentName: string;
  assessmentDate: string;
  marks: MarkRow[];
}

interface Subject {
  id: string;
  name: string;
}

interface Topic {
  id: string;
  name: string;
  subjectId: string;
}

interface StudentDetail {
  student: { id: string; name: string };
  subjects: Subject[];
  topics: Topic[];
  latestPlan: { id: string } | null;
}

// What a staged edit looks like. Nothing reaches the server until the final save.
interface TestDraft {
  assessmentName: string;
  assessmentDate: string;
}
interface MarkDraft {
  obtainedMarks: number;
  fullMarks: number;
  confidenceLevel: Confidence;
  topicIds: string[];
}

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

const cardColors = [
  'bg-[#F7CC46]',
  'bg-[#a4e5c7]',
  'bg-[#a8acf0]',
  'bg-[#EDB1AA]',
];

const pillBase =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';
const pillBlack = `${pillBase} bg-black text-white hover:bg-black/80`;
const pillWhite = `${pillBase} bg-white text-black hover:bg-black/5`;
const pillDanger = `${pillBase} bg-white text-red-600 hover:bg-red-50`;
const pillGrey = `${pillBase} bg-[#F0EFED] text-black hover:bg-[#E7E5E2]`;

const iconBtn =
  'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50';

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

function PencilIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

function TrashIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

export default function TestHistoryPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [tests, setTests] = useState<AssessmentRow[] | null>(null);
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // The staged draft.
  const [testEdits, setTestEdits] = useState<Record<string, TestDraft>>({});
  const [markEdits, setMarkEdits] = useState<Record<string, MarkDraft>>({});
  const [deletedMarks, setDeletedMarks] = useState<string[]>([]);
  const [deletedTests, setDeletedTests] = useState<string[]>([]);

  const [isSaving, setIsSaving] = useState(false);

  const changeCount =
    Object.keys(testEdits).length +
    Object.keys(markEdits).length +
    deletedMarks.length +
    deletedTests.length;
  const hasDraft = changeCount > 0;

  const load = useCallback(async () => {
    try {
      const [t, s] = await Promise.all([
        api.get<{ assessments: AssessmentRow[] }>(
          `/api/assessments?studentId=${params.id}&includeMarks=1`,
        ),
        api.get<StudentDetail>(`/api/students/${params.id}?includeArchived=1`),
      ]);
      setTests(t.assessments);
      setStudent(s);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }
      setError("Couldn't load test history. Please try refreshing.");
    }
  }, [params.id, router]);

  useEffect(() => {
    load();
  }, [load]);

  // Warn before leaving while changes are unsaved:
  // closing the tab, refreshing, any link in the app (including the dashboard),
  // and the browser's back button.
  useEffect(() => {
    if (!hasDraft) return;
    const message =
      'You have unsaved changes. If you leave now, they will not be saved. Leave anyway?';

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = message;
    }
    function onClick(e: MouseEvent) {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]');
      if (!a || (a as HTMLAnchorElement).target === '_blank') return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    // Capture phase and stopImmediatePropagation, so Next.js's own back-button
    // handler doesn't navigate before the parent has answered.
    function onPopState(e: PopStateEvent) {
      e.stopImmediatePropagation();
      if (window.confirm(message)) {
        window.removeEventListener('popstate', onPopState, true);
        window.history.back();
      } else {
        window.history.pushState({ testHistoryGuard: true }, '');
      }
    }

    if (!window.history.state?.testHistoryGuard)
      window.history.pushState({ testHistoryGuard: true }, '');
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState, true);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState, true);
      document.removeEventListener('click', onClick, true);
    };
  }, [hasDraft]);

  function discardAll() {
    setTestEdits({});
    setMarkEdits({});
    setDeletedMarks([]);
    setDeletedTests([]);
    setError(null);
  }

  async function saveAll() {
    if (!tests || isSaving) return;
    setError(null);
    setNotice(null);
    setIsSaving(true);
    try {
      const gone = new Set(deletedTests);
      const res = await api.post<{ planUpdated: boolean }>(
        `/api/students/${params.id}/test-history`,
        {
          planId: student?.latestPlan?.id,
          assessmentEdits: Object.entries(testEdits)
            .filter(([id]) => !gone.has(id))
            .map(([id, e]) => ({ id, ...e })),
          markEdits: Object.entries(markEdits)
            .filter(([id]) => !deletedMarks.includes(id))
            .map(([id, e]) => ({ id, ...e })),
          deletedMarkIds: deletedMarks,
          deletedAssessmentIds: deletedTests,
        },
      );
      discardAll();
      await load();
      setNotice(
        res.planUpdated ? 'Changes saved and plan updated.' : 'Changes saved.',
      );
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save your changes. Nothing was saved — please try again.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  const subjectName = (id: string) =>
    student?.subjects.find((s) => s.id === id)?.name ?? 'Deleted subject';

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FAF9F6] pb-24 text-black sm:pb-8">
      {/* HEADER */}
      <header className="relative z-30 bg-[#FAF9F6]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-5 py-5 sm:px-7 lg:px-0">
          {/* BRAND */}
          <Link href="/dashboard" className="flex shrink-0 items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-xl font-bold text-white sm:h-14 sm:w-14 sm:text-2xl">
              S
            </div>

            <span className="text-xl font-bold tracking-tight sm:text-2xl">
              StudyPlan Analyzer
            </span>
          </Link>

          {/* BACK BUTTON */}
          <Link
            href={`/students/${params.id}/plan`}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#F0EFED] px-5 text-sm font-semibold transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:px-6 sm:text-base"
          >
            <ArrowLeftIcon />
            <span>
              Back<span className="hidden sm:inline"> to plan</span>
            </span>
          </Link>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto w-full max-w-[1400px] px-5 pt-5 sm:px-7 sm:pt-8 lg:px-0">
        {/* LOADING STATE */}
        {!tests && !error && (
          <div className="space-y-7">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* LOAD ERROR (nothing else to show) */}
        {!tests && error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {tests && student && (
          <>
            {/* HERO SECTION */}
            <section className="mb-8 sm:mb-10">
              <h1 className="dashboard-headline relative inline-block max-w-full text-[clamp(1.15rem,5.1vw,4rem)] font-extrabold leading-tight tracking-[-0.045em]">
                Test history.
              </h1>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
                {student.student.name}. Fix a wrong mark, change a confidence
                level, or remove a test entered by mistake. Nothing changes
                until you save everything at once, and then the plan is updated.
              </p>
            </section>

            {/* NOTICE */}
            {notice && !hasDraft && (
              <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {notice}{' '}
                {student.latestPlan && (
                  <Link
                    href={`/students/${params.id}/plan`}
                    className="font-semibold underline underline-offset-4"
                  >
                    View plan
                  </Link>
                )}
              </div>
            )}

            {/* ERROR MESSAGE */}
            {error && (
              <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {tests.length === 0 ? (
              <div className="rounded-[32px] bg-white px-6 py-16 text-center shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:py-20">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[28px] bg-[#F7CC46] text-4xl">
                  📝
                </div>

                <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                  No tests logged yet
                </h2>

                <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#65615D] sm:text-base">
                  Marks you enter will show up here so you can correct them
                  later.
                </p>

                <Link
                  href={`/students/${params.id}/add-test-marks`}
                  className="mt-7 inline-flex rounded-full bg-black px-7 py-3.5 text-sm font-semibold text-white transition hover:bg-black/80 active:scale-95"
                >
                  + Log a test
                </Link>
              </div>
            ) : (
              <div className="rounded-[32px] bg-white p-4 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-7 lg:p-10">
                {/* TEST CARDS */}
                <div className="flex flex-col gap-6">
                  {tests.map((t, index) => (
                    <TestCard
                      key={t.id}
                      test={t}
                      colorClass={cardColors[index % cardColors.length]}
                      subjectName={subjectName}
                      topics={student.topics}
                      testDraft={testEdits[t.id]}
                      markEdits={markEdits}
                      deletedMarks={deletedMarks}
                      isDeleted={deletedTests.includes(t.id)}
                      disabled={isSaving}
                      onStageTest={(draft) =>
                        setTestEdits((prev) => {
                          const next = { ...prev };
                          if (draft) next[t.id] = draft;
                          else delete next[t.id];
                          return next;
                        })
                      }
                      onDeleteTest={() =>
                        setDeletedTests((prev) => [...prev, t.id])
                      }
                      onUndoTest={() => {
                        setDeletedTests((prev) =>
                          prev.filter((x) => x !== t.id),
                        );
                        setDeletedMarks((prev) =>
                          prev.filter((x) => !t.marks.some((m) => m.id === x)),
                        );
                      }}
                      onStageMark={(markId, draft) =>
                        setMarkEdits((prev) => {
                          const next = { ...prev };
                          if (draft) next[markId] = draft;
                          else delete next[markId];
                          return next;
                        })
                      }
                      onDeleteMark={(markId) =>
                        setDeletedMarks((prev) => [...prev, markId])
                      }
                      onUndoMark={(markId) =>
                        setDeletedMarks((prev) =>
                          prev.filter((x) => x !== markId),
                        )
                      }
                    />
                  ))}
                </div>

                {/* SAVE BAR */}
                <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm font-semibold text-black/65 sm:text-base">
                    {hasDraft
                      ? `${changeCount} change${
                          changeCount === 1 ? '' : 's'
                        } waiting — not saved yet${
                          student.latestPlan ? ', plan updates on save' : ''
                        }.`
                      : ''}
                  </p>

                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    {hasDraft && (
                      <button
                        type="button"
                        onClick={discardAll}
                        disabled={isSaving}
                        className={`${pillGrey} px-7 py-3.5 sm:py-4 sm:text-base`}
                      >
                        Discard all
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={saveAll}
                      disabled={!hasDraft || isSaving}
                      className={`${pillBlack} px-7 py-3.5 sm:py-4 sm:text-base`}
                    >
                      {isSaving ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          <Link
            href="/dashboard"
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">▦</span>
            <span className="text-[10px] font-medium">Home</span>
          </Link>

          <Link
            href={`/students/${params.id}/plan`}
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">＋</span>
            <span className="text-[10px] font-medium">Plan</span>
          </Link>

          <Link
            href={`/students/${params.id}/today`}
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">ϟ</span>
            <span className="text-[10px] font-medium">Today</span>
          </Link>

          <Link
            href={`/students/${params.id}/daily-challenge`}
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">◧</span>
            <span className="text-[10px] font-medium">Quiz</span>
          </Link>

          <Link
            href={`/students/${params.id}/settings`}
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">●</span>
            <span className="text-[10px] font-medium">You</span>
          </Link>
        </div>
      </nav>

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

function TestCard({
  test,
  colorClass,
  subjectName,
  topics,
  testDraft,
  markEdits,
  deletedMarks,
  isDeleted,
  disabled,
  onStageTest,
  onDeleteTest,
  onUndoTest,
  onStageMark,
  onDeleteMark,
  onUndoMark,
}: {
  test: AssessmentRow;
  colorClass: string;
  subjectName: (id: string) => string;
  topics: Topic[];
  testDraft: TestDraft | undefined;
  markEdits: Record<string, MarkDraft>;
  deletedMarks: string[];
  isDeleted: boolean;
  disabled: boolean;
  onStageTest: (draft: TestDraft | null) => void;
  onDeleteTest: () => void;
  onUndoTest: () => void;
  onStageMark: (markId: string, draft: MarkDraft | null) => void;
  onDeleteMark: (markId: string) => void;
  onUndoMark: (markId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const current = testDraft ?? {
    assessmentName: test.assessmentName,
    assessmentDate: test.assessmentDate,
  };
  const [name, setName] = useState(current.assessmentName);
  const [date, setDate] = useState(current.assessmentDate);

  const keptMarks = test.marks.filter((m) => !deletedMarks.includes(m.id));
  // Deleting every subject of a test deletes the test.
  const wholeTestGone =
    isDeleted || (test.marks.length > 0 && keptMarks.length === 0);

  function stage() {
    if (!name.trim() || !date) return;
    const same =
      name.trim() === test.assessmentName && date === test.assessmentDate;
    onStageTest(
      same ? null : { assessmentName: name.trim(), assessmentDate: date },
    );
    setIsEditing(false);
  }

  const sortedMarks = test.marks
    .slice()
    .sort((a, b) =>
      subjectName(a.subjectId).localeCompare(subjectName(b.subjectId)),
    );

  if (wholeTestGone) {
    return (
      <div className="rounded-[32px] border border-red-200 bg-red-50 p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-extrabold tracking-tight text-black/45 line-through sm:text-3xl">
              {test.assessmentName}
            </h2>
            <p className="mt-1 text-sm font-semibold text-red-700">
              This test will be deleted when you save.
            </p>
          </div>

          <button
            type="button"
            className={pillWhite}
            disabled={disabled}
            onClick={onUndoTest}
          >
            Undo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-[32px] ${colorClass} p-6 sm:p-8`}>
      {isEditing ? (
        <div className="rounded-[26px] bg-white/60 p-5 sm:p-6">
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="Test name"
              className="min-w-[8rem] flex-1"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <Input
              label="Test date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className={pillBlack} onClick={stage}>
              Save
            </button>
            <button
              type="button"
              className={pillWhite}
              onClick={() => {
                setName(current.assessmentName);
                setDate(current.assessmentDate);
                setIsEditing(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <span className="inline-flex rounded-full bg-black px-5 py-2 text-xs font-bold uppercase tracking-wide text-white">
              {new Date(current.assessmentDate).toLocaleDateString()} ·{' '}
              {keptMarks.length} subject{keptMarks.length === 1 ? '' : 's'}
              {testDraft && ' · edited'}
            </span>

            <h2 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
              {current.assessmentName}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={pillBlack}
              disabled={disabled}
              onClick={() => {
                setName(current.assessmentName);
                setDate(current.assessmentDate);
                setIsEditing(true);
              }}
            >
              <PencilIcon className="h-4 w-4" />
              Edit
            </button>

            <button
              type="button"
              className={pillDanger}
              disabled={disabled}
              onClick={onDeleteTest}
            >
              <TrashIcon className="h-4 w-4" />
              Delete test
            </button>
          </div>
        </div>
      )}

      <ul className="mt-6 flex flex-col divide-y divide-black/10 rounded-[26px] bg-white/60 px-5 py-2 sm:px-7">
        {sortedMarks.map((m) => (
          <MarkItem
            key={m.id}
            mark={m}
            draft={markEdits[m.id]}
            isDeleted={deletedMarks.includes(m.id)}
            isOnlyMark={keptMarks.length === 1 && !deletedMarks.includes(m.id)}
            subjectName={subjectName(m.subjectId)}
            subjectTopics={topics.filter((t) => t.subjectId === m.subjectId)}
            disabled={disabled}
            onStage={(d) => onStageMark(m.id, d)}
            onDelete={() => onDeleteMark(m.id)}
            onUndo={() => onUndoMark(m.id)}
          />
        ))}
        {sortedMarks.length === 0 && (
          <li className="py-4 text-sm font-semibold text-black/50">
            No marks are recorded for this test.
          </li>
        )}
      </ul>
    </div>
  );
}

function MarkItem({
  mark,
  draft,
  isDeleted,
  isOnlyMark,
  subjectName,
  subjectTopics,
  disabled,
  onStage,
  onDelete,
  onUndo,
}: {
  mark: MarkRow;
  draft: MarkDraft | undefined;
  isDeleted: boolean;
  isOnlyMark: boolean;
  subjectName: string;
  subjectTopics: Topic[];
  disabled: boolean;
  onStage: (draft: MarkDraft | null) => void;
  onDelete: () => void;
  onUndo: () => void;
}) {
  const current: MarkDraft = draft ?? {
    obtainedMarks: mark.obtainedMarks,
    fullMarks: mark.fullMarks,
    confidenceLevel: mark.confidenceLevel ?? 'medium',
    topicIds: mark.topicIds,
  };

  const [isEditing, setIsEditing] = useState(false);
  const [obtained, setObtained] = useState(String(current.obtainedMarks));
  const [full, setFull] = useState(String(current.fullMarks));
  const [confidence, setConfidence] = useState<Confidence>(
    current.confidenceLevel,
  );
  const [topicIds, setTopicIds] = useState<string[]>(current.topicIds);
  const [formError, setFormError] = useState<string | null>(null);

  const percent = Math.round((current.obtainedMarks / current.fullMarks) * 100);
  const scopedNames = subjectTopics
    .filter((t) => current.topicIds.includes(t.id))
    .map((t) => t.name);

  function openEditor() {
    setObtained(String(current.obtainedMarks));
    setFull(String(current.fullMarks));
    setConfidence(current.confidenceLevel);
    setTopicIds(current.topicIds);
    setFormError(null);
    setIsEditing(true);
  }

  function stage() {
    const o = Number(obtained);
    const f = Number(full);
    if (
      obtained.trim() === '' ||
      !Number.isInteger(o) ||
      !Number.isInteger(f) ||
      f <= 0 ||
      o < 0 ||
      o > f
    ) {
      setFormError(
        'Enter whole numbers, with marks obtained no higher than the total.',
      );
      return;
    }
    setFormError(null);
    const unchanged =
      o === mark.obtainedMarks &&
      f === mark.fullMarks &&
      confidence === (mark.confidenceLevel ?? 'medium') &&
      sameIds(topicIds, mark.topicIds);
    onStage(
      unchanged
        ? null
        : {
            obtainedMarks: o,
            fullMarks: f,
            confidenceLevel: confidence,
            topicIds,
          },
    );
    setIsEditing(false);
  }

  if (isDeleted) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 py-4">
        <p className="text-base font-bold text-black/40 line-through">
          {subjectName}
        </p>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-red-600">
            Will be deleted
          </span>

          <button
            type="button"
            className={`${pillGrey} px-5 py-2`}
            disabled={disabled}
            onClick={onUndo}
          >
            Undo
          </button>
        </div>
      </li>
    );
  }

  if (isEditing) {
    return (
      <li className="py-4">
        <p className="mb-3 text-base font-bold">{subjectName}</p>

        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Marks obtained"
            type="number"
            className="w-32"
            min={0}
            value={obtained}
            onChange={(e) => setObtained(e.target.value)}
          />
          <Input
            label="Out of"
            type="number"
            className="w-24"
            min={1}
            value={full}
            onChange={(e) => setFull(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-black">Confidence</label>
            <select
              className="rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm"
              value={confidence}
              onChange={(e) => setConfidence(e.target.value as Confidence)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <TopicScopeSelector
          topics={subjectTopics}
          selectedTopicIds={topicIds}
          onChange={setTopicIds}
        />

        {formError && (
          <p className="mt-3 text-sm font-medium text-red-700">{formError}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className={pillBlack} onClick={stage}>
            Save
          </button>
          <button
            type="button"
            className={pillWhite}
            onClick={() => setIsEditing(false)}
          >
            Cancel
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold sm:text-lg">
            {subjectName}
            {draft && (
              <span className="ml-2 text-xs font-semibold text-black/55">
                · edited
              </span>
            )}
          </p>

          <p className="mt-1 text-sm font-semibold sm:text-base">
            {current.obtainedMarks} / {current.fullMarks} ({percent}%) ·{' '}
            {CONFIDENCE_LABEL[current.confidenceLevel]}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={`Edit ${subjectName}`}
            className={`${iconBtn} text-black/70`}
            disabled={disabled}
            onClick={openEditor}
          >
            <PencilIcon />
          </button>

          <button
            type="button"
            aria-label={`Delete ${subjectName}`}
            className={`${iconBtn} text-red-600`}
            disabled={disabled}
            onClick={onDelete}
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {(scopedNames.length > 0 || isOnlyMark) && (
        <p className="mt-3 border-t border-black/10 pt-3 text-sm leading-6 text-black/55">
          {scopedNames.length > 0 && (
            <>
              Topic-only test: {scopedNames.join(', ')}. It updates those
              topics, not the subject&apos;s overall score.{' '}
            </>
          )}
          {isOnlyMark && (
            <>
              This is the only subject in the test, so deleting it deletes the
              whole test.
            </>
          )}
        </p>
      )}
    </li>
  );
}
