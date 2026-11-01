'use client';

import { useCallback, useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/Input';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { TopicScopeSelector } from '@/components/session/TopicScopeSelector';
import { api, ApiError } from '@/lib/api-client';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { Notice } from '@/components/ui/Notice';
import { PageTitle } from '@/components/ui/PageTitle';
import { EmptyState, emptyStateActionClass } from '@/components/ui/EmptyState';
import { cardClass } from '@/components/ui/Card';
import { buttonClass } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';
import { Field, Select } from '@/components/ui/Field';
import { StudentBottomNav } from '@/components/ui/StudentBottomNav';

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


const iconBtn =
  'flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-95 hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50';

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

export default function TestHistoryPage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = use(props.params);
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
    <PageShell withBottomNav>
      <AppHeader>
        <BackLink href={`/students/${params.id}/plan`} label="Back to plan" short="Back" />
      </AppHeader>

      <PageMain>
        {/* LOADING STATE */}
        {!tests && !error && (
          <div className="space-y-7">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* LOAD ERROR (nothing else to show) */}
        {!tests && error && (
          <Notice className="mb-6">
            {error}
          </Notice>
        )}

        {tests && student && (
          <>
            {/* HERO SECTION */}
            <section className="mb-8 sm:mb-10">
              <PageTitle>
                Test history.
              </PageTitle>

              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
                {student.student.name}. Fix a wrong mark, change a confidence
                level, or remove a test entered by mistake. Nothing changes
                until you save everything at once, and then the plan is updated.
              </p>
            </section>

            {/* NOTICE */}
            {notice && !hasDraft && (
              <Notice tone="success" className="mb-6">
                {notice}{' '}
                {student.latestPlan && (
                  <Link
                    href={`/students/${params.id}/plan`}
                    className="font-semibold underline underline-offset-4"
                  >
                    View plan
                  </Link>
                )}
              </Notice>
            )}

            {/* ERROR MESSAGE */}
            {error && (
              <Notice className="mb-6">
                {error}
              </Notice>
            )}

            {tests.length === 0 ? (
              <EmptyState
                titleAs="h2"
                icon="📝"
                title="No tests logged yet"
                description="Marks you enter will show up here so you can correct them later."
                action={
                  <Link
                    href={`/students/${params.id}/add-test-marks`}
                    className={emptyStateActionClass}
                  >
                    + Log a test
                  </Link>
                }
              />
            ) : (
              <div className={`${cardClass} p-4 sm:p-7 lg:p-10`}>
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
                        className={buttonClass('secondary', 'lg')}
                      >
                        Discard all
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={saveAll}
                      disabled={!hasDraft || isSaving}
                      className={buttonClass('primary', 'lg')}
                    >
                      {isSaving ? 'Saving…' : 'Save changes'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </PageMain>

      <StudentBottomNav studentId={params.id} />

    </PageShell>
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
      <div className="rounded-[32px] bg-red-50 p-6 ring-1 ring-red-200 sm:p-8">
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
            className={buttonClass('white')}
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
              containerClassName="min-w-[8rem] flex-1"
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
            <button type="button" className={buttonClass('primary')} onClick={stage}>
              Save
            </button>
            <button
              type="button"
              className={buttonClass('white')}
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
            <Tag className="px-5 py-2">
              {new Date(current.assessmentDate).toLocaleDateString()} ·{' '}
              {keptMarks.length} subject{keptMarks.length === 1 ? '' : 's'}
              {testDraft && ' · edited'}
            </Tag>

            <h2 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
              {current.assessmentName}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={buttonClass('primary')}
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
              className={buttonClass('whiteDanger')}
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
          <span className="text-sm font-semibold text-red-600">
            Will be deleted
          </span>

          <button
            type="button"
            className={buttonClass('secondary')}
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
          <Field label="Confidence">
            <Select
              value={confidence}
              onChange={(e) => setConfidence(e.target.value as Confidence)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
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
          <button type="button" className={buttonClass('primary')} onClick={stage}>
            Save
          </button>
          <button
            type="button"
            className={buttonClass('white')}
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
              <span className="ml-2 text-sm font-semibold text-black/55">
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
