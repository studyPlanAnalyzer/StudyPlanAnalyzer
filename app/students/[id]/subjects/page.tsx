'use client';

import { subjectClashFor } from '@/lib/subject-name';
import { createContext, useCallback, useContext, useEffect, useState, use } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api-client';
import { MAX_FULL_MARKS } from '@/lib/validation';
import { suggestTopicsFor } from '@/lib/common-topics';
import { academicYearOf, earlierExamChoices } from '@/lib/utils/academic-year';
import { Button } from '@/components/ui/Button';
import { cardClass } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { Field, Select, fieldClass, fieldOnColourClass, fieldOnColourShapeClass } from '@/components/ui/Field';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, headerLinkClass } from '@/components/ui/AppHeader';
import { PageTitle } from '@/components/ui/PageTitle';
import { Notice } from '@/components/ui/Notice';

function fullMarksProblem(fullMarks: number): string | null {
  return Number.isInteger(fullMarks) && fullMarks >= 1 && fullMarks <= MAX_FULL_MARKS
    ? null
    : `Full marks must be from 1 to ${MAX_FULL_MARKS}.`;
}

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
  /** The exam it was taught for (an earlier one is revised on weekends). */
  examId: string | null;
  examName: string | null;
}

interface StudentDetail {
  student: { id: string; name: string; grade: string };
  subjects: Subject[];
  topics: Topic[];
  exams: { id: string; name: string; examDate: string; isPrimary: boolean }[];
  currentExamId: string | null;
  latestPlan: { id: string } | null;
}

type SelfRating = 'not_sure' | 'ok' | 'know_well';
/** A topic studied for an earlier exam: which one, and how well it's known. */
interface Earlier {
  examId?: string;
  examName: string;
  selfRating?: SelfRating;
}

/** Where a new topic belongs: the current exam, or one of these earlier ones. */
interface ExamChoices {
  currentExamId: string | null;
  currentExamName: string | null;
  earlier: { key: string; examId?: string; examName: string }[];
}
const ExamChoicesContext = createContext<ExamChoices>({ currentExamId: null, currentExamName: null, earlier: [] });

const AN_EARLIER_EXAM = 'An earlier exam';

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
  /** Set when it was studied for an earlier exam rather than taught now. */
  earlier?: Earlier;
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

/* ------------------------------------------------------------------ */
/* Design tokens (shared with the dashboard page)                      */
/*   page bg #FAF9F6 · ink black · yellow #F7CC46 · muted #65615D      */
/*   headings font-bold/extrabold · buttons font-semibold              */
/*   cards rounded-[32px] + soft shadow · font = the app's default     */
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


/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */


function IconBtn({
  label,
  danger,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-black/5 ${
        danger ? 'text-red-600' : 'text-black/70'
      }`}
    >
      {children}
    </button>
  );
}

function Unsaved() {
  return (
    <span className="ml-1 inline-block rounded-full bg-white px-2.5 py-0.5 align-middle text-sm font-bold uppercase tracking-wide text-black">
      unsaved
    </span>
  );
}

/* Icons (stroke, inherit colour, 16px by default) */
const iconProps = {
  fill: 'none',
  viewBox: '0 0 24 24',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};
function PencilIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" />
      <path d="M14.5 5.5l4 4" />
    </svg>
  );
}
function TrashIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
    </svg>
  );
}
function ArchiveIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} {...iconProps}>
      <rect x="3" y="4" width="18" height="5" rx="1" />
      <path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4" />
    </svg>
  );
}
function PlusIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg className={className} {...iconProps} strokeWidth={2}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function BookIcon({ className = 'h-[22px] w-[22px]' }: { className?: string }) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M12 6c-1.5-1.3-3.7-2-7-2v13c3.3 0 5.5.7 7 2 1.5-1.3 3.7-2 7-2V4c-3.3 0-5.5.7-7 2zM12 6v13" />
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

export default function SubjectsPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the save worked but the plan couldn't be rebuilt because the exam
  // is over. A rebuilt plan sends you straight to the plan page.
  const [planSkipped, setPlanSkipped] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = useState(false);

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

  // A new topic is taught now (the current exam) unless the parent picks the
  // earlier exam it was studied for: one of the child's own past exams of
  // the same academic year, or one of the year's exams from before they joined.
  const currentExam = detail?.exams.find((e) => e.id === detail.currentExamId) ?? null;
  const earlierThisYear = currentExam
    ? earlierExamChoices(academicYearOf(currentExam.examDate), detail?.exams ?? []).filter(
        (c) => c.examId !== currentExam.id,
      )
    : [];
  const examChoices: ExamChoices = {
    currentExamId: currentExam?.id ?? null,
    currentExamName: currentExam?.name ?? null,
    earlier:
      earlierThisYear.length > 0
        ? earlierThisYear
        : [{ key: `name:${AN_EARLIER_EXAM}`, examName: AN_EARLIER_EXAM }],
  };
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
    <ExamChoicesContext.Provider value={examChoices}>
    <PageShell className="pb-16 sm:pb-8">

      <AppHeader menu={{ items: navItems, breakpoint: 'lg' }}>
        {navItems.map((item) => (
          <Link key={item.href} href={item.href} className={headerLinkClass}>
            {item.label}
          </Link>
        ))}
      </AppHeader>

      <PageMain>
        {!detail && !error && (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {detail && (
          <>
            {/* HERO SECTION */}
            <section className="mb-8 sm:mb-10">
              <PageTitle>
                Subjects &amp; topics.
              </PageTitle>

              <p className="mt-4 max-w-xl text-sm leading-7 text-black sm:text-base lg:text-lg">
                {detail.student.name} · Grade {detail.student.grade}. Add a
                topic, then its sub-topics as they are taught. Nothing is saved
                until you press Save.
              </p>
            </section>

            <div className={`${cardClass} p-4 sm:p-8`}>
              {!detail.latestPlan && (
                <div className="mb-5 rounded-[28px] bg-[#e4e1fa] p-5">
                  <p className="text-base font-bold text-black">
                    There&apos;s no study plan yet
                  </p>
                  <p className="mt-1 text-sm leading-6 text-black">
                    It starts as soon as you save: topics taught for the current exam
                    join it the next day.
                  </p>
                </div>
              )}

              {planSkipped && (
                <div className="mb-5 rounded-[28px] bg-[#dff3e8] p-5">
                  <p className="text-sm font-semibold leading-6 text-black">
                    Your changes are saved. The plan was not rebuilt because
                    this exam has already passed.
                  </p>
                </div>
              )}

              {draftCount > 0 && (
                <div className="mb-5 rounded-[28px] border-2 border-dashed border-[#F7CC46] bg-[#fdf4d8] p-5">
                  <p className="text-base font-bold text-black">
                    {draftCount} change{draftCount === 1 ? '' : 's'} waiting
                  </p>
                  <p className="mt-1 text-sm leading-6 text-black">
                    Add as many as you need. None of them are in the plan or
                    analysis until you press Save and update plan. If you leave
                    this page, you will be asked to confirm, and they are
                    discarded.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button onClick={save} isLoading={isSaving}>
                      {detail.latestPlan ? 'Save and update plan' : 'Save'}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={isSaving}
                      onClick={() => setDraft(EMPTY_DRAFT)}
                    >
                      Discard all
                    </Button>
                  </div>
                </div>
              )}

              {error && (
                <Notice className="mb-5">
                  {error}
                </Notice>
              )}

              <AddSubjectCard
                existingNames={[
                  ...subjects.map((s) => s.name),
                  ...draft.subjects.map((s) => s.name),
                ]}
                onAdd={(subject) =>
                  update({ subjects: [...draft.subjects, subject] })
                }
              />

              <div className="mt-5 flex flex-col gap-5">
                {active.map((s, index) => (
                  <SubjectCard
                    key={s.id}
                    subject={s}
                    colorClass={CARD_COLORS[index % CARD_COLORS.length]}
                    edited={
                      s.id in draft.subjectEdits || s.id in draft.isActive
                    }
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
                    onAddDraftTopic={(parentId, name, difficultyRating, earlier) =>
                      update({
                        topics: [
                          ...draft.topics,
                          {
                            subjectId: s.id,
                            parentTopicId: parentId,
                            name,
                            difficultyRating,
                            earlier,
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
                  <div
                    key={i}
                    className="rounded-[2rem] border-2 border-dashed border-[#F7CC46] bg-white p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Tag>
                          {WEIGHT_LABEL[s.examWeight]} · out of {s.fullMarks}
                        </Tag>
                        <h2 className="mt-3.5 text-2xl font-bold tracking-tight text-black sm:text-3xl">
                          {s.name} <Unsaved />
                        </h2>
                        {s.topics.length > 0 && (
                          <p className="mt-0.5 text-sm text-[#65615D]">
                            {s.topics.join(', ')}
                          </p>
                        )}
                      </div>
                      <Button
                        variant="whiteDanger"
                        onClick={() =>
                          update({
                            subjects: draft.subjects.filter((_, j) => j !== i),
                          })
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                ))}
                {active.length === 0 && draft.subjects.length === 0 && (
                  <div className="rounded-[28px] bg-[#f4f3ee] p-5">
                    <p className="text-sm leading-6 text-[#65615D] sm:text-base">
                      No active subjects. Add one above to start planning.
                    </p>
                  </div>
                )}
              </div>

              {archived.length > 0 && (
                <section className="mt-10">
                  <h2 className="mb-4 text-2xl font-bold tracking-tight text-black sm:text-3xl">
                    Archived subjects
                  </h2>
                  <div className="flex flex-col gap-3">
                    {archived.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-3xl bg-[#f1f0ea] p-4 sm:px-5"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="text-base font-bold text-black">
                              {s.name} {s.id in draft.isActive && <Unsaved />}
                            </p>
                            <p className="text-sm text-[#65615D]">
                              {topicsFor(s.id).length} topic
                              {topicsFor(s.id).length === 1 ? '' : 's'} kept
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              variant="white"
                              onClick={() => setSubjectActive(s.id, true)}
                            >
                              Restore
                            </Button>
                            <Button
                              variant="whiteDanger"
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
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </>
        )}
      </PageMain>
    </PageShell>
    </ExamChoicesContext.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Subject card                                                        */
/* ------------------------------------------------------------------ */

function SubjectCard({
  subject,
  colorClass,
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
  colorClass: string;
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
    earlier?: Earlier,
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
  const fullMarksError = fullMarksProblem(fullMarks);

  function done() {
    if (!name.trim() || renameClash || fullMarksError) return;
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
    <div className={`rounded-[2rem] p-4 sm:p-7 ${colorClass}`}>
      {isEditing ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Subject" className="min-w-[10rem] flex-1">
            <input
              className={fieldOnColourClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Full marks" className="w-28">
            <input
              type="number"
              className={fieldOnColourClass}
              min={1}
              max={MAX_FULL_MARKS}
              value={fullMarks}
              onChange={(e) => setFullMarks(Number(e.target.value))}
            />
          </Field>
          <Field label="Exam weight">
            <Select
              onColour
              value={examWeight}
              onChange={(e) => setExamWeight(e.target.value as ExamWeight)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
          <Button onClick={done}>Done</Button>
          <Button variant="white" onClick={cancel}>
            Cancel
          </Button>
          {fullMarksError && (
            <p className="mt-2 text-sm font-medium text-red-600">{fullMarksError}</p>
          )}
          {renameClash && (
            <p className="w-full text-sm font-semibold text-red-700">
              {renameClash}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
          <div className="min-w-0">
            <Tag>
              {WEIGHT_LABEL[subject.examWeight]} · out of {subject.fullMarks}
            </Tag>
            <h2 className="mt-3.5 break-words text-2xl font-bold tracking-tight text-black sm:text-3xl">
              {subject.name} {edited && <Unsaved />}
            </h2>
            <p className="mt-0.5 text-sm font-semibold text-black">
              {topLevel.length} topic{topLevel.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <BookIcon className="h-[22px] w-[22px] text-black" />
            <Button onClick={() => setIsEditing(true)}>
              <PencilIcon />
              Edit
            </Button>
            <Button
              variant="white"
              onClick={() => {
                if (
                  window.confirm(
                    `Archive ${subject.name}? Once you save, it is left out of the study plan. You can restore it later.`,
                  )
                )
                  onArchive();
              }}
            >
              <ArchiveIcon />
              Archive
            </Button>
          </div>
        </div>
      )}

      <div className="mt-6">
        {topLevel.length === 0 && draftTopics.length === 0 ? (
          <p className="mb-3 rounded-3xl bg-white/[0.55] px-4 py-3 text-sm font-semibold leading-6 text-black">
            No topics yet. This subject won&apos;t get study sessions until you
            add at least one.
          </p>
        ) : (
          <ul className="mb-3 flex flex-col gap-3">
            {topLevel.map((t) => {
              const subs = subTopicsOf(t.id);
              return (
                <li
                  key={t.id}
                  className="min-w-0 rounded-3xl bg-white/[0.55] p-3 sm:p-3.5"
                >
                  <TopicRow
                    topic={t}
                    edited={editedTopicIds.includes(t.id)}
                    hasSubTopics={subs.length > 0}
                    onEdit={(e) => onEditTopic(t.id, e)}
                    onDelete={() => onDeleteTopic(t.id)}
                  />
                  <div className="mt-2.5 min-w-0 border-l-[1.5px] border-black/20 pl-3.5">
                    {subs.length > 0 && (
                      <ul className="mb-2 flex flex-col gap-1">
                        {subs.map((st) => (
                          <li key={st.id}>
                            <TopicRow
                              topic={st}
                              edited={editedTopicIds.includes(st.id)}
                              hasSubTopics={false}
                              isSub
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
                      buttonLabel="Sub-topic"
                      ariaLabel="Add sub-topic"
                      parentExam={t}
                      onAdd={(name, d, earlier) => onAddDraftTopic(t.id, name, d, earlier)}
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
        <AddTopicInput
          buttonLabel="Topic"
          ariaLabel="Add topic"
          onAdd={(name, d, earlier) => onAddDraftTopic(null, name, d, earlier)}
        />
      </div>
    </div>
  );
}

function TopicRow({
  topic,
  edited,
  hasSubTopics,
  isSub = false,
  onEdit,
  onDelete,
}: {
  topic: Topic;
  edited: boolean;
  hasSubTopics: boolean;
  isSub?: boolean;
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
      <div className="flex flex-wrap items-center gap-2">
        <input
          className={`${fieldOnColourShapeClass} min-w-[8rem] flex-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') done();
          }}
        />
        {!hasSubTopics && (
          <Select
            onColour
            className="w-[150px]"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                Difficulty {d}
              </option>
            ))}
          </Select>
        )}
        <Button onClick={done}>Done</Button>
        <Button
          variant="white"
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
    <div className="flex flex-wrap items-center justify-between gap-x-3">
      <span
        className={`flex min-w-[8rem] flex-1 items-center gap-2 break-words text-black ${
          isSub ? 'text-sm font-normal' : 'text-base font-bold'
        }`}
      >
        {isSub && <CornerIcon className="h-4 w-4 shrink-0 text-black/50" />}
        <span className="min-w-0">
          {topic.name} {edited && <Unsaved />}
        </span>
      </span>
      <div className="ml-auto flex shrink-0 items-center">
        <EarlierTag topic={topic} />
        {!hasSubTopics &&
          (isSub ? (
            <span className="mr-1.5 text-sm font-bold text-black">
              Difficulty {topic.difficultyRating}
            </span>
          ) : (
            <span className="mr-1.5 inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-sm font-bold text-black">
              Difficulty {topic.difficultyRating}
            </span>
          ))}
        <IconBtn
          label={`Edit ${topic.name}`}
          onClick={() => setIsEditing(true)}
        >
          <PencilIcon />
        </IconBtn>
        <IconBtn
          label={`Delete ${topic.name}`}
          danger
          onClick={() => {
            if (
              window.confirm(
                `Delete "${topic.name}"${hasSubTopics ? ' and its sub-topics' : ''}? Once you save, its review history is removed too.`,
              )
            )
              onDelete();
          }}
        >
          <TrashIcon />
        </IconBtn>
      </div>
    </div>
  );
}

// Unsaved topics or sub-topics, shown until the parent saves.
function DraftChips({
  items,
  onRemove,
}: {
  items: { i: number; name: string; difficultyRating: number; earlier?: Earlier }[];
  onRemove: (index: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-2">
      {items.map((d) => (
        <li
          key={d.i}
          className="flex items-center gap-1 rounded-full border-[1.5px] border-dashed border-black/30 bg-white/70 pl-4 text-sm font-semibold text-black"
        >
          {d.name} · difficulty {d.difficultyRating}
          {d.earlier ? ` · ${d.earlier.examName}` : ''} · added
          <button
            type="button"
            aria-label={`Remove ${d.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-base leading-none text-black hover:text-red-600"
            onClick={() => onRemove(d.i)}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

// An earlier-exam topic's exam, shown next to it. This exam's topics have none.
function EarlierTag({ topic }: { topic: Topic }) {
  const { currentExamId } = useContext(ExamChoicesContext);
  if (!topic.examName || topic.examId === currentExamId) return null;
  return (
    <span
      title="Studied for an earlier exam: revised on weekends"
      className="mr-1.5 inline-flex items-center rounded-full bg-black/80 px-2.5 py-0.5 text-xs font-bold text-white"
    >
      {topic.examName}
    </span>
  );
}

function AddTopicInput({
  placeholder = 'Add a topic',
  buttonLabel = 'Topic',
  ariaLabel,
  parentExam,
  onAdd,
}: {
  placeholder?: string;
  buttonLabel?: string;
  ariaLabel?: string;
  /** For a sub-topic: its topic, whose exam it starts on. */
  parentExam?: Pick<Topic, 'examId' | 'examName'>;
  onAdd: (name: string, difficultyRating: number, earlier?: Earlier) => void;
}) {
  const choices = useContext(ExamChoicesContext);
  const parentKey =
    parentExam && parentExam.examId !== choices.currentExamId && parentExam.examName
      ? (choices.earlier.find((c) => (parentExam.examId ? c.examId === parentExam.examId : c.examName === parentExam.examName))?.key ?? 'now')
      : 'now';
  const [value, setValue] = useState('');
  const [difficulty, setDifficulty] = useState(''); // '' = not chosen yet
  const [when, setWhen] = useState(parentKey); // 'now' or an earlier exam's key
  const [selfRating, setSelfRating] = useState<SelfRating>('not_sure');
  const [error, setError] = useState<string | null>(null);
  const earlierChoice = choices.earlier.find((c) => c.key === when);

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
    onAdd(
      name,
      Number(difficulty),
      earlierChoice ? { examId: earlierChoice.examId, examName: earlierChoice.examName, selfRating } : undefined,
    );
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
          className={`${fieldOnColourShapeClass} w-full min-w-0 sm:w-auto sm:flex-1`}
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
        <Select
          onColour
          className="min-w-[150px] flex-1 sm:w-[150px] sm:flex-none"
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
        </Select>
        <Button variant="outline" aria-label={ariaLabel} onClick={add}>
          <PlusIcon />
          {buttonLabel}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <Select
          onColour
          aria-label="When was it taught?"
          className="min-w-[220px] flex-1 sm:flex-none"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        >
          <option value="now">
            Taught now{choices.currentExamName ? ` (for ${choices.currentExamName})` : ''}
          </option>
          {choices.earlier.map((c) => (
            <option key={c.key} value={c.key}>
              Studied for {c.examName}
            </option>
          ))}
        </Select>
        {earlierChoice && (
          <Select
            onColour
            aria-label="How well is it known?"
            className="min-w-[150px] flex-1 sm:flex-none"
            value={selfRating}
            onChange={(e) => setSelfRating(e.target.value as SelfRating)}
          >
            <option value="not_sure">Not sure</option>
            <option value="ok">OK</option>
            <option value="know_well">Know it well</option>
          </Select>
        )}
      </div>
      <p className="mt-1.5 text-sm text-black/70">
        {earlierChoice
          ? 'Earlier topics are revised on weekends, with suggestions.'
          : 'It comes onto the list tomorrow.'}
      </p>
      {error && (
        <p className="mt-1.5 text-sm font-semibold text-red-700">{error}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Add subject                                                         */
/* ------------------------------------------------------------------ */

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
    const clash = subjectClashFor(name, existingNames) ?? fullMarksProblem(fullMarks);
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
    <div className="rounded-[28px] border-2 border-dashed border-[#d6d4cd] bg-white p-4 sm:p-5">
      <Tag>New subject</Tag>
      <h2 className="mb-4 mt-3.5 text-2xl font-bold tracking-tight text-black sm:text-3xl">
        Add a subject
      </h2>
      <div className="flex flex-wrap items-end gap-3.5">
        <Field label="Subject" className="min-w-[12rem] flex-1">
          <input
            className={fieldClass}
            placeholder="e.g. Science"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
          />
        </Field>
        <Field label="Full marks" className="w-full sm:w-[190px]">
          <input
            type="number"
            className={fieldClass}
            min={1}
            max={MAX_FULL_MARKS}
            value={fullMarks}
            onChange={(e) => setFullMarks(Number(e.target.value))}
          />
        </Field>
        <Field label="Exam weight" className="w-full sm:w-[163px]">
          <Select
            className="w-full"
            value={examWeight}
            onChange={(e) => setExamWeight(e.target.value as ExamWeight)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </Select>
        </Field>
        <Button variant="yellow" onClick={add}>
          <PlusIcon />
          Add subject
        </Button>
      </div>
      {(error ?? subjectClashFor(name, existingNames)) && (
        <p className="mt-2.5 text-sm font-semibold text-red-600">
          {error ?? subjectClashFor(name, existingNames)}
        </p>
      )}
      {suggestions.length > 0 && (
        <label className="mt-4 flex min-h-11 cursor-pointer items-start gap-3 py-1 text-sm leading-6 text-black">
          <input
            type="checkbox"
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-black"
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
    </div>
  );
}
