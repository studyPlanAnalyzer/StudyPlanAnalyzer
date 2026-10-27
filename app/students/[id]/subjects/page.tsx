'use client';

import { subjectClashFor } from '@/lib/subject-name';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api-client';
import { suggestTopicsFor } from '@/lib/common-topics';

type ExamWeight = 'low' | 'medium' | 'high';

interface Subject {
  id: string;
  name: string;
  fullMarks: number;
  examWeight: ExamWeight;
  orderIndex: number;
  isActive: boolean;
}

interface Topic {
  id: string;
  name: string;
  subjectId: string;
  parentTopicId: string | null;
  difficultyRating: number;
}

interface StudentDetail {
  student: { id: string; name: string; grade: string };
  subjects: Subject[];
  topics: Topic[];
  exams: { id: string; examDate: string; isPrimary: boolean }[];
  latestPlan: { id: string } | null;
}

// Every change on this page is held in the draft until the parent clicks the
// one Save button. Nothing reaches the database, the analysis or the plan
// before then, and leaving the page discards the draft.
interface DraftSubject {
  name: string;
  fullMarks: number;
  examWeight: ExamWeight;
  topics: string[];
}
interface DraftTopic {
  subjectId: string;
  parentTopicId: string | null;
  name: string;
  difficultyRating: number;
}
interface SubjectEdit {
  name: string;
  fullMarks: number;
  examWeight: ExamWeight;
}
interface TopicEdit {
  name: string;
  difficultyRating: number;
}
interface Draft {
  subjects: DraftSubject[]; // new subjects
  topics: DraftTopic[]; // new topics and sub-topics
  subjectEdits: Record<string, SubjectEdit>;
  isActive: Record<string, boolean>; // archive / restore, by subject id
  deletedSubjects: string[];
  topicEdits: Record<string, TopicEdit>;
  deletedTopics: string[];
}
const EMPTY_DRAFT: Draft = {
  subjects: [],
  topics: [],
  subjectEdits: {},
  isActive: {},
  deletedSubjects: [],
  topicEdits: {},
  deletedTopics: [],
};

const WEIGHT_LABEL: Record<ExamWeight, string> = {
  low: 'Low weight',
  medium: 'Medium weight',
  high: 'High weight',
};

const linkBtn =
  'text-sm font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50 disabled:cursor-not-allowed';
const dangerBtn =
  'text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed';

function Unsaved() {
  return <span className="text-xs font-normal text-amber-600">unsaved</span>;
}

export default function SubjectsPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the save worked but the plan couldn't be rebuilt because the exam
  // is over. A rebuilt plan sends you straight to the plan page.
  const [planSkipped, setPlanSkipped] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<StudentDetail>(
        `/api/students/${params.id}?includeArchived=1`,
      );
      setDetail(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }
      setError("Couldn't load subjects. Please try refreshing.");
    }
  }, [params.id, router]);

  useEffect(() => {
    load();
  }, [load]);

  const draftCount =
    draft.subjects.length +
    draft.topics.length +
    Object.keys(draft.subjectEdits).length +
    Object.keys(draft.isActive).length +
    draft.deletedSubjects.length +
    Object.keys(draft.topicEdits).length +
    draft.deletedTopics.length;

  // Warn before leaving with unsaved changes: closing the tab, refreshing,
  // following any link in the app (including the navigation bar), and the
  // browser's back button.
  const hasDraft = draftCount > 0;
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
        window.history.pushState({ subjectsGuard: true }, '');
      }
    }
    if (!window.history.state?.subjectsGuard)
      window.history.pushState({ subjectsGuard: true }, '');
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState, true);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState, true);
      document.removeEventListener('click', onClick, true);
    };
  }, [hasDraft]);

  const update = (patch: Partial<Draft>) =>
    setDraft((d) => ({ ...d, ...patch }));

  // Saved data with the draft laid over it, which is what the page shows.
  const subjects = (detail?.subjects ?? [])
    .filter((s) => !draft.deletedSubjects.includes(s.id))
    .map((s) => ({
      ...s,
      ...draft.subjectEdits[s.id],
      isActive: draft.isActive[s.id] ?? s.isActive,
    }))
    .sort(
      (a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name),
    );
  const topics = (detail?.topics ?? [])
    .filter(
      (t) =>
        !draft.deletedTopics.includes(t.id) &&
        !(t.parentTopicId && draft.deletedTopics.includes(t.parentTopicId)),
    )
    .map((t) => ({ ...t, ...draft.topicEdits[t.id] }));

  const active = subjects.filter((s) => s.isActive);
  const archived = subjects.filter((s) => !s.isActive);
  const topicsFor = (subjectId: string) =>
    topics.filter((t) => t.subjectId === subjectId);

  function editSubject(id: string, edit: SubjectEdit) {
    const orig = detail?.subjects.find((s) => s.id === id);
    const rest = { ...draft.subjectEdits };
    delete rest[id];
    const same =
      orig &&
      orig.name === edit.name &&
      orig.fullMarks === edit.fullMarks &&
      orig.examWeight === edit.examWeight;
    update({ subjectEdits: same ? rest : { ...rest, [id]: edit } });
  }

  function setSubjectActive(id: string, value: boolean) {
    const orig = detail?.subjects.find((s) => s.id === id);
    const rest = { ...draft.isActive };
    delete rest[id];
    update({
      isActive: orig?.isActive === value ? rest : { ...rest, [id]: value },
    });
  }

  function editTopic(id: string, edit: TopicEdit) {
    const orig = detail?.topics.find((t) => t.id === id);
    const rest = { ...draft.topicEdits };
    delete rest[id];
    const same =
      orig &&
      orig.name === edit.name &&
      orig.difficultyRating === edit.difficultyRating;
    update({ topicEdits: same ? rest : { ...rest, [id]: edit } });
  }

  async function save() {
    setError(null);
    setPlanSkipped(false);
    setIsSaving(true);
    try {
      // One request: the changes and the plan rebuild are saved together, or
      // not at all.
      const res = await api.post<{ planUpdated: boolean }>(
        `/api/students/${params.id}/curriculum`,
        {
          planId: detail?.latestPlan?.id,
          subjects: draft.subjects,
          topics: draft.topics,
          subjectEdits: Array.from(
            new Set([
              ...Object.keys(draft.subjectEdits),
              ...Object.keys(draft.isActive),
            ]),
          ).map((id) => ({
            id,
            ...draft.subjectEdits[id],
            isActive: draft.isActive[id],
          })),
          deletedSubjectIds: draft.deletedSubjects,
          topicEdits: Object.entries(draft.topicEdits).map(([id, e]) => ({
            id,
            ...e,
          })),
          deletedTopicIds: draft.deletedTopics,
        },
      );
      setDraft(EMPTY_DRAFT);
      if (detail?.latestPlan && res.planUpdated) {
        // Straight to the rebuilt plan; the spinner stays on while we navigate.
        router.push(
          `/students/${params.id}/plan?planId=${detail.latestPlan.id}`,
        );
        return;
      }
      if (detail?.latestPlan) setPlanSkipped(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save your changes. Nothing was saved — please try again.",
      );
    }
    setIsSaving(false);
    await load();
  }

  const navItems = [
    { href: `/students/${params.id}/plan`, label: 'Plan' },
    { href: `/students/${params.id}/tests`, label: 'Test history' },
    { href: `/students/${params.id}/settings`, label: 'Settings' },
  ];

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <Link
            href="/dashboard"
            className="text-base font-semibold text-indigo-700 sm:text-lg"
          >
            StudyPlan Analyzer
          </Link>

          {/* Laptop and up */}
          <div className="hidden items-center gap-4 text-sm text-slate-500 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="hover:text-slate-800"
              >
                {item.label}
              </Link>
            ))}
          </div>

          {/* Phones and tablets: hamburger */}
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            {menuOpen ? (
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 6l12 12M18 6L6 18"
                />
              </svg>
            ) : (
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            )}
          </button>
        </div>

        {/* Phones and tablets: dropdown menu */}
        {menuOpen && (
          <nav className="flex flex-col border-t border-slate-200 bg-white px-4 py-2 sm:px-6 lg:hidden">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {!detail && !error && (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {detail && (
          <>
            <h1 className="mb-1 text-2xl font-semibold text-slate-900">
              Subjects &amp; topics
            </h1>
            <p className="mb-6 text-sm text-slate-500">
              {detail.student.name} · Grade {detail.student.grade}. Add a topic
              (e.g. Physics), then its sub-topics as they are taught (e.g.
              Sound). Sub-topics are optional. Make as many changes as you like:
              nothing is saved, or used in the plan, until you press the Save
              button.
            </p>

            {!detail.latestPlan && (
              <Card className="mb-6 border-indigo-200 bg-indigo-50">
                <p className="text-sm font-medium text-indigo-900">
                  There&apos;s no study plan yet
                </p>
                <p className="mt-1 text-sm text-indigo-800">
                  Saved changes are used when you generate one.
                </p>
                <div className="mt-3">
                  <Link href={`/students/${params.id}/settings`}>
                    <Button size="sm">Generate a plan in Settings</Button>
                  </Link>
                </div>
              </Card>
            )}

            {planSkipped && (
              <Card className="mb-6 border-amber-200 bg-amber-50">
                <p className="text-sm text-amber-900">
                  Your changes are saved. The plan was not rebuilt because this
                  exam has already passed.
                </p>
              </Card>
            )}

            {draftCount > 0 && (
              <Card className="mb-6 border-amber-200 bg-amber-50">
                <p className="text-sm font-medium text-amber-900">
                  {draftCount} change{draftCount === 1 ? '' : 's'} waiting
                </p>
                <p className="mt-1 text-sm text-amber-800">
                  Add as many as you need. None of them are in the plan or
                  analysis until you press Save and update plan. If you leave
                  this page, you will be asked to confirm, and they are
                  discarded.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" onClick={save} isLoading={isSaving}>
                    {detail.latestPlan ? 'Save and update plan' : 'Save'}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isSaving}
                    onClick={() => setDraft(EMPTY_DRAFT)}
                  >
                    Discard all
                  </Button>
                </div>
              </Card>
            )}

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            <div className="mb-6 flex flex-col gap-4">
              {active.map((s) => (
                <SubjectCard
                  key={s.id}
                  subject={s}
                  edited={s.id in draft.subjectEdits || s.id in draft.isActive}
                  otherNames={[
                    ...subjects
                      .filter((o) => o.id !== s.id)
                      .map((o) => draft.subjectEdits[o.id]?.name ?? o.name),
                    ...draft.subjects.map((o) => o.name),
                  ]}
                  topics={topicsFor(s.id)}
                  editedTopicIds={Object.keys(draft.topicEdits)}
                  draftTopics={draft.topics
                    .map((t, i) => ({ ...t, i }))
                    .filter((t) => t.subjectId === s.id)}
                  onEdit={(e) => editSubject(s.id, e)}
                  onArchive={() => setSubjectActive(s.id, false)}
                  onEditTopic={editTopic}
                  onDeleteTopic={(id) =>
                    update({ deletedTopics: [...draft.deletedTopics, id] })
                  }
                  onAddDraftTopic={(parentId, name, difficultyRating) =>
                    update({
                      topics: [
                        ...draft.topics,
                        {
                          subjectId: s.id,
                          parentTopicId: parentId,
                          name,
                          difficultyRating,
                        },
                      ],
                    })
                  }
                  onRemoveDraftTopic={(i) =>
                    update({ topics: draft.topics.filter((_, j) => j !== i) })
                  }
                />
              ))}
              {draft.subjects.map((s, i) => (
                <Card key={i} className="border-dashed border-amber-300">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-slate-900">
                        {s.name} <Unsaved />
                      </h2>
                      <p className="text-xs text-slate-500">
                        {WEIGHT_LABEL[s.examWeight]} · out of {s.fullMarks}
                        {s.topics.length > 0 && ` · ${s.topics.join(', ')}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={dangerBtn}
                      onClick={() =>
                        update({
                          subjects: draft.subjects.filter((_, j) => j !== i),
                        })
                      }
                    >
                      Remove
                    </button>
                  </div>
                </Card>
              ))}
              {active.length === 0 && draft.subjects.length === 0 && (
                <Card>
                  <p className="text-sm text-slate-500">
                    No active subjects. Add one below to start planning.
                  </p>
                </Card>
              )}
            </div>

            <AddSubjectCard
              existingNames={[
                ...subjects.map((s) => s.name),
                ...draft.subjects.map((s) => s.name),
              ]}
              onAdd={(subject) =>
                update({ subjects: [...draft.subjects, subject] })
              }
            />

            {archived.length > 0 && (
              <section className="mt-10">
                <h2 className="mb-3 text-base font-semibold text-slate-900">
                  Archived subjects
                </h2>
                <div className="flex flex-col gap-3">
                  {archived.map((s) => (
                    <Card key={s.id}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-slate-700">
                            {s.name} {s.id in draft.isActive && <Unsaved />}
                          </p>
                          <p className="text-xs text-slate-400">
                            {topicsFor(s.id).length} topic
                            {topicsFor(s.id).length === 1 ? '' : 's'} kept
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <button
                            type="button"
                            className={linkBtn}
                            onClick={() => setSubjectActive(s.id, true)}
                          >
                            Restore
                          </button>
                          <button
                            type="button"
                            className={dangerBtn}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `Permanently delete ${s.name}? Once you save, this also deletes its topics and every mark recorded for it. This can't be undone.`,
                                )
                              )
                                update({
                                  deletedSubjects: [
                                    ...draft.deletedSubjects,
                                    s.id,
                                  ],
                                });
                            }}
                          >
                            Delete permanently
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SubjectCard({
  subject,
  edited,
  otherNames,
  topics,
  editedTopicIds,
  draftTopics,
  onEdit,
  onArchive,
  onEditTopic,
  onDeleteTopic,
  onAddDraftTopic,
  onRemoveDraftTopic,
}: {
  subject: Subject;
  edited: boolean;
  // Every other subject's name, to catch a rename that makes two the same.
  otherNames: string[];
  topics: Topic[];
  editedTopicIds: string[];
  draftTopics: (DraftTopic & { i: number })[];
  onEdit: (edit: SubjectEdit) => void;
  onArchive: () => void;
  onEditTopic: (id: string, edit: TopicEdit) => void;
  onDeleteTopic: (id: string) => void;
  onAddDraftTopic: (
    parentTopicId: string | null,
    name: string,
    difficultyRating: number,
  ) => void;
  onRemoveDraftTopic: (index: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(subject.name);
  const [fullMarks, setFullMarks] = useState(subject.fullMarks);
  const [examWeight, setExamWeight] = useState<ExamWeight>(subject.examWeight);
  const topLevel = topics.filter((t) => !t.parentTopicId);
  const subTopicsOf = (id: string) =>
    topics.filter((t) => t.parentTopicId === id);

  const renameClash =
    name.trim() !== subject.name ? subjectClashFor(name, otherNames) : null;

  function done() {
    if (!name.trim() || renameClash) return;
    onEdit({ name: name.trim(), fullMarks, examWeight });
    setIsEditing(false);
  }

  function cancel() {
    setName(subject.name);
    setFullMarks(subject.fullMarks);
    setExamWeight(subject.examWeight);
    setIsEditing(false);
  }

  return (
    <Card>
      {isEditing ? (
        <div className="flex flex-wrap items-end gap-3">
          <Input
            label="Subject"
            className="min-w-[8rem] flex-1"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="Full marks"
            type="number"
            className="w-28"
            min={1}
            value={fullMarks}
            onChange={(e) => setFullMarks(Number(e.target.value))}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700">
              Exam weight
            </label>
            <select
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={examWeight}
              onChange={(e) => setExamWeight(e.target.value as ExamWeight)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <Button size="sm" onClick={done}>
            Done
          </Button>
          <Button size="sm" variant="secondary" onClick={cancel}>
            Cancel
          </Button>
          {renameClash && (
            <p className="w-full text-xs text-red-600">{renameClash}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {subject.name} {edited && <Unsaved />}
            </h2>
            <p className="text-xs text-slate-500">
              {WEIGHT_LABEL[subject.examWeight]} · out of {subject.fullMarks}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              className={linkBtn}
              onClick={() => setIsEditing(true)}
            >
              Edit
            </button>
            <button
              type="button"
              className={linkBtn}
              onClick={() => {
                if (
                  window.confirm(
                    `Archive ${subject.name}? Once you save, it is left out of the study plan. You can restore it later.`,
                  )
                )
                  onArchive();
              }}
            >
              Archive
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-slate-100 pt-3">
        {topLevel.length === 0 && draftTopics.length === 0 ? (
          <p className="mb-2 text-xs text-amber-600">
            No topics yet. This subject won&apos;t get study sessions until you
            add at least one.
          </p>
        ) : (
          <ul className="mb-2 flex flex-col divide-y divide-slate-100">
            {topLevel.map((t) => {
              const subs = subTopicsOf(t.id);
              return (
                <li key={t.id} className="min-w-0 py-1">
                  <TopicRow
                    topic={t}
                    edited={editedTopicIds.includes(t.id)}
                    hasSubTopics={subs.length > 0}
                    onEdit={(e) => onEditTopic(t.id, e)}
                    onDelete={() => onDeleteTopic(t.id)}
                  />
                  <div className="mb-1 ml-4 min-w-0 border-l border-slate-200 pl-3">
                    {subs.length > 0 && (
                      <ul className="mb-1 flex flex-col divide-y divide-slate-100">
                        {subs.map((st) => (
                          <li key={st.id}>
                            <TopicRow
                              topic={st}
                              edited={editedTopicIds.includes(st.id)}
                              hasSubTopics={false}
                              onEdit={(e) => onEditTopic(st.id, e)}
                              onDelete={() => onDeleteTopic(st.id)}
                            />
                          </li>
                        ))}
                      </ul>
                    )}
                    <DraftChips
                      items={draftTopics.filter(
                        (d) => d.parentTopicId === t.id,
                      )}
                      onRemove={onRemoveDraftTopic}
                    />
                    <AddTopicInput
                      placeholder="Add a sub-topic (optional)"
                      buttonLabel="Add sub-topic"
                      onAdd={(name, d) => onAddDraftTopic(t.id, name, d)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <DraftChips
          items={draftTopics.filter((d) => !d.parentTopicId)}
          onRemove={onRemoveDraftTopic}
        />
        <AddTopicInput onAdd={(name, d) => onAddDraftTopic(null, name, d)} />
      </div>
    </Card>
  );
}

function TopicRow({
  topic,
  edited,
  hasSubTopics,
  onEdit,
  onDelete,
}: {
  topic: Topic;
  edited: boolean;
  hasSubTopics: boolean;
  onEdit: (edit: TopicEdit) => void;
  onDelete: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(topic.name);
  const [difficulty, setDifficulty] = useState(topic.difficultyRating);

  function done() {
    if (!name.trim()) return;
    onEdit({ name: name.trim(), difficultyRating: difficulty });
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <div className="flex flex-wrap items-center gap-2 py-1">
        <input
          className="min-w-[8rem] flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') done();
          }}
        />
        {!hasSubTopics && (
          <select
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                Difficulty {d}
              </option>
            ))}
          </select>
        )}
        <Button size="sm" onClick={done}>
          Done
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            setName(topic.name);
            setDifficulty(topic.difficultyRating);
            setIsEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-sm text-slate-700">
        {topic.name} {edited && <Unsaved />}
      </span>
      <div className="flex items-center gap-4">
        {!hasSubTopics && (
          <span className="text-xs text-slate-400">
            Difficulty {topic.difficultyRating}
          </span>
        )}
        <button
          type="button"
          className={linkBtn}
          onClick={() => setIsEditing(true)}
        >
          Edit
        </button>
        <button
          type="button"
          className={dangerBtn}
          onClick={() => {
            if (
              window.confirm(
                `Delete "${topic.name}"${hasSubTopics ? ' and its sub-topics' : ''}? Once you save, its review history is removed too.`,
              )
            )
              onDelete();
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

// Unsaved topics or sub-topics, shown until the parent saves.
function DraftChips({
  items,
  onRemove,
}: {
  items: { i: number; name: string; difficultyRating: number }[];
  onRemove: (index: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-1.5">
      {items.map((d) => (
        <li
          key={d.i}
          className="flex items-center gap-1.5 rounded-full border border-dashed border-amber-300 bg-amber-50 px-2 py-0.5 text-xs text-amber-800"
        >
          {d.name} · difficulty {d.difficultyRating} · added
          <button
            type="button"
            aria-label={`Remove ${d.name}`}
            className="text-amber-600 hover:text-amber-900"
            onClick={() => onRemove(d.i)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function AddTopicInput({
  placeholder = 'Add a topic',
  buttonLabel = 'Add topic',
  onAdd,
}: {
  placeholder?: string;
  buttonLabel?: string;
  onAdd: (name: string, difficultyRating: number) => void;
}) {
  const [value, setValue] = useState('');
  const [difficulty, setDifficulty] = useState(''); // '' = not chosen yet
  const [error, setError] = useState<string | null>(null);

  function add() {
    const name = value.trim();
    if (!name) {
      setError('Enter a name.');
      return;
    }
    if (!difficulty) {
      setError('Choose a difficulty from 1 to 5.');
      return;
    }
    onAdd(name, Number(difficulty));
    setValue('');
    setDifficulty('');
    setError(null);
  }

  return (
    <div className="min-w-0">
      {/* flex-wrap: on narrow screens the text box takes a full row and the
          difficulty picker + button sit together on the row below. */}
      <div className="flex flex-wrap gap-2">
        <input
          className="w-full min-w-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-500 sm:w-auto sm:flex-1"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <select
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs sm:flex-none"
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value);
            setError(null);
          }}
        >
          <option value="" disabled>
            Difficulty…
          </option>
          {[1, 2, 3, 4, 5].map((d) => (
            <option key={d} value={d}>
              Difficulty {d}
            </option>
          ))}
        </select>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="shrink-0 whitespace-nowrap"
          onClick={add}
        >
          {buttonLabel}
        </Button>
      </div>
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </div>
  );
}

function AddSubjectCard({
  existingNames,
  onAdd,
}: {
  existingNames: string[];
  onAdd: (subject: DraftSubject) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [fullMarks, setFullMarks] = useState(100);
  const [examWeight, setExamWeight] = useState<ExamWeight>('medium');
  const [useSuggestions, setUseSuggestions] = useState(true);

  const suggestions = name.trim() ? suggestTopicsFor(name.trim()) : [];

  function add() {
    if (!name.trim()) return;
    const clash = subjectClashFor(name, existingNames);
    if (clash) {
      setError(clash);
      return;
    }
    setError(null);
    onAdd({
      name: name.trim(),
      fullMarks,
      examWeight,
      topics: useSuggestions ? suggestions : [],
    });
    setName('');
    setFullMarks(100);
    setExamWeight('medium');
    setUseSuggestions(true);
  }

  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold text-slate-900">
        Add a subject
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <Input
          label="Subject"
          className="min-w-[8rem] flex-1"
          placeholder="e.g. Science"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
        />
        <Input
          label="Full marks"
          type="number"
          className="w-28"
          min={1}
          value={fullMarks}
          onChange={(e) => setFullMarks(Number(e.target.value))}
        />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-700">
            Exam weight
          </label>
          <select
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={examWeight}
            onChange={(e) => setExamWeight(e.target.value as ExamWeight)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
        <Button onClick={add}>Add subject</Button>
      </div>
      {(error ?? subjectClashFor(name, existingNames)) && (
        <p className="mt-2 text-sm text-red-600">
          {error ?? subjectClashFor(name, existingNames)}
        </p>
      )}
      {suggestions.length > 0 && (
        <label className="mt-3 flex items-start gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300"
            checked={useSuggestions}
            onChange={(e) => setUseSuggestions(e.target.checked)}
          />
          <span>
            Also add {suggestions.length} suggested topics ({' '}
            {suggestions.slice(0, 3).join(', ')}
            {suggestions.length > 3 ? ', …' : ''}). Add their sub-topics
            afterwards, as they are taught.
          </span>
        </label>
      )}
    </Card>
  );
}
