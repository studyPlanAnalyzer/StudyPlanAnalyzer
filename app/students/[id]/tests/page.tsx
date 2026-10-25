'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
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

const linkBtn =
  'text-sm font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50';
const dangerBtn =
  'text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50';

const sameIds = (a: string[], b: string[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold text-indigo-700"
          >
            StudyPlan Analyzer
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <Link
              href={`/students/${params.id}/plan`}
              className="hover:text-slate-800"
            >
              Plan
            </Link>
            <Link
              href={`/students/${params.id}/subjects`}
              className="hover:text-slate-800"
            >
              Subjects
            </Link>
            <Link
              href={`/students/${params.id}/add-test-marks`}
              className="hover:text-slate-800"
            >
              Log a test
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {!tests && !error && (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {tests && student && (
          <>
            <h1 className="mb-1 text-2xl font-semibold text-slate-900">
              Test history
            </h1>
            <p className="mb-6 text-sm text-slate-500">
              {student.student.name}. Fix a wrong mark, change a confidence
              level, or remove a test entered by mistake. Nothing changes until
              you save everything at once, and then the plan is updated.
            </p>

            {hasDraft && (
              <Card className="mb-6 border-indigo-200 bg-indigo-50">
                <p className="text-sm font-medium text-indigo-900">
                  {changeCount} change{changeCount === 1 ? '' : 's'} waiting
                </p>
                <p className="mt-1 text-sm text-indigo-800">
                  They are not saved yet. Save them all together
                  {student.latestPlan ? ' and the plan is updated' : ''}, or
                  discard them.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={saveAll} isLoading={isSaving}>
                    {isSaving
                      ? 'Saving…'
                      : student.latestPlan
                        ? 'Save changes and update plan'
                        : 'Save changes'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={discardAll}
                    disabled={isSaving}
                  >
                    Discard all
                  </Button>
                </div>
              </Card>
            )}

            {notice && !hasDraft && (
              <p className="mb-4 text-sm text-green-700">
                {notice}{' '}
                {student.latestPlan && (
                  <Link
                    href={`/students/${params.id}/plan`}
                    className="underline"
                  >
                    View plan
                  </Link>
                )}
              </p>
            )}

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            {tests.length === 0 ? (
              <EmptyState
                title="No tests logged yet"
                description="Marks you enter will show up here so you can correct them later."
                action={
                  <Link href={`/students/${params.id}/add-test-marks`}>
                    <Button>Log a test</Button>
                  </Link>
                }
              />
            ) : (
              <div className="flex flex-col gap-4">
                {tests.map((t) => (
                  <TestCard
                    key={t.id}
                    test={t}
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
                      setDeletedTests((prev) => prev.filter((x) => x !== t.id));
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
            )}
          </>
        )}
      </main>
    </div>
  );
}

function TestCard({
  test,
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
      <Card className="border-red-200 bg-red-50">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-500 line-through">
              {test.assessmentName}
            </h2>
            <p className="text-xs text-red-700">
              This test will be deleted when you save.
            </p>
          </div>
          <button
            type="button"
            className={linkBtn}
            disabled={disabled}
            onClick={onUndoTest}
          >
            Undo
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={testDraft ? 'border-indigo-200' : undefined}>
      {isEditing ? (
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
          <Button size="sm" onClick={stage}>
            Save
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setName(current.assessmentName);
              setDate(current.assessmentDate);
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {current.assessmentName}
              {testDraft && (
                <span className="ml-2 text-xs font-normal text-indigo-600">
                  · edited
                </span>
              )}
            </h2>
            <p className="text-xs text-slate-500">
              {new Date(current.assessmentDate).toLocaleDateString()} ·{' '}
              {keptMarks.length} subject{keptMarks.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className={linkBtn}
              disabled={disabled}
              onClick={() => {
                setName(current.assessmentName);
                setDate(current.assessmentDate);
                setIsEditing(true);
              }}
            >
              Edit
            </button>
            <button
              type="button"
              className={dangerBtn}
              disabled={disabled}
              onClick={onDeleteTest}
            >
              Delete test
            </button>
          </div>
        </div>
      )}

      <ul className="mt-4 flex flex-col divide-y divide-slate-100 border-t border-slate-100">
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
          <li className="py-3 text-sm text-slate-400">
            No marks are recorded for this test.
          </li>
        )}
      </ul>
    </Card>
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
      <li className="flex flex-wrap items-center justify-between gap-3 py-3">
        <p className="text-sm text-slate-400 line-through">{subjectName}</p>
        <div className="flex items-center gap-4">
          <span className="text-xs text-red-600">Will be deleted</span>
          <button
            type="button"
            className={linkBtn}
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
      <li className="py-3">
        <p className="mb-2 text-sm font-medium text-slate-700">{subjectName}</p>
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
            <label className="text-sm font-medium text-slate-700">
              Confidence
            </label>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
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
        {formError && <p className="mt-2 text-sm text-red-600">{formError}</p>}
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={stage}>
            Save
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setIsEditing(false)}
          >
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div>
        <p className="text-sm font-medium text-slate-800">
          {subjectName}
          {draft && (
            <span className="ml-2 text-xs font-normal text-indigo-600">
              · edited
            </span>
          )}
        </p>
        <p className="text-xs text-slate-500">
          {current.obtainedMarks} / {current.fullMarks} ({percent}%) ·{' '}
          {CONFIDENCE_LABEL[current.confidenceLevel]}
        </p>
        {scopedNames.length > 0 && (
          <p className="mt-1 text-xs text-slate-400">
            Topic-only test: {scopedNames.join(', ')}. It updates those topics,
            not the subject&apos;s overall score.
          </p>
        )}
        {isOnlyMark && (
          <p className="mt-1 text-xs text-slate-400">
            This is the only subject in the test, so deleting it deletes the
            whole test.
          </p>
        )}
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          className={linkBtn}
          disabled={disabled}
          onClick={openEditor}
        >
          Edit
        </button>
        <button
          type="button"
          className={dangerBtn}
          disabled={disabled}
          onClick={onDelete}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
