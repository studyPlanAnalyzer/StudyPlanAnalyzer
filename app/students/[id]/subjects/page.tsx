'use client';

import { subjectClashFor } from '@/lib/subject-name';
import { useCallback, useEffect, useState, use } from 'react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
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
// Inputs/selects on the white panel (Add a subject):
const fieldCls =
  'h-[38px] w-full min-w-0 rounded-full border-[1.5px] border-[#dcdad3] bg-white px-4 text-sm font-semibold text-black outline-none placeholder:font-semibold placeholder:text-[#8f8f8f] focus:border-black';
const panelSelectCls =
  'sp-select h-[38px] w-full rounded-full border-[1.5px] border-[#dcdad3] bg-white pl-4 pr-9 text-sm font-semibold text-black outline-none focus:border-black';
// Inputs/selects sitting on a coloured card (topics, sub-topics):
const topicFieldCls =
  'h-[38px] w-full min-w-0 rounded-full border-[1.5px] border-black/10 bg-white px-4 text-sm font-medium text-black outline-none placeholder:font-normal placeholder:text-[#8f8f8f] focus:border-black/40';
const topicSelectCls =
  'sp-select h-[38px] rounded-full border-[1.5px] border-black/10 bg-white pl-4 pr-9 text-sm font-medium text-black outline-none focus:border-black/40';

/* ------------------------------------------------------------------ */
/* Small building blocks                                               */
/* ------------------------------------------------------------------ */

type Tone = 'black' | 'white' | 'outline' | 'yellow' | 'danger';
type Size = 'sm' | 'md';

const TONE: Record<Tone, string> = {
  black: 'bg-black text-white hover:bg-black/80',
  white: 'bg-white text-black hover:bg-white/80',
  outline:
    'border-[1.5px] border-[#dcdad3] bg-white text-black hover:bg-[#f4f3ee]',
  yellow:
    'bg-[#F7CC46] text-black shadow-[0_5px_12px_rgba(0,0,0,0.07)] hover:bg-[#F0C33A] hover:shadow-[0_7px_16px_rgba(0,0,0,0.10)]',
  danger: 'border-[1.5px] border-red-200 bg-white text-red-600 hover:bg-red-50',
};
// md is the standard button: 38px tall, 16px side padding, 14px semibold.
const SIZE: Record<Size, string> = {
  sm: 'h-8 px-3.5 text-[13px]',
  md: 'h-[38px] px-4 text-sm',
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
      className={`rounded-full p-0.5 transition-opacity hover:opacity-60 ${
        danger ? 'text-red-600' : 'text-black/70'
      }`}
    >
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

function Unsaved() {
  return (
    <span className="ml-1 inline-block rounded-full bg-white px-2 py-0.5 align-middle text-[10px] font-bold uppercase leading-3 tracking-wider text-black">
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

          {/* Laptop and up */}
          <div className="hidden items-center gap-2.5 lg:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-full px-4 py-3 text-sm font-semibold transition hover:bg-black/5"
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
            className="flex h-12 w-12 items-center justify-center rounded-full bg-[#F0EFED] text-black transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:w-14 lg:hidden"
          >
            {menuOpen ? (
              <svg
                className="h-5 w-5"
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
                className="h-5 w-5"
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
          <nav className="mx-auto flex max-w-[1400px] flex-col px-5 pb-3 sm:px-7 lg:hidden lg:px-0">
            <div className="flex flex-col rounded-[26px] bg-white p-2 shadow-[0_12px_30px_rgba(0,0,0,0.07)]">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-full px-4 py-3 text-sm font-semibold hover:bg-black/5"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto w-full max-w-[1400px] px-5 pt-5 sm:px-7 sm:pt-8 lg:px-0">
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
              <h1 className="sp-headline relative inline-block whitespace-nowrap text-[clamp(1.15rem,5.1vw,4rem)] font-extrabold leading-tight tracking-[-0.045em]">
                Subjects &amp; topics.
              </h1>

              <p className="mt-4 max-w-xl text-sm leading-7 text-black sm:text-base lg:text-lg">
                {detail.student.name} · Grade {detail.student.grade}. Add a
                topic, then its sub-topics as they are taught. Nothing is saved
                until you press Save.
              </p>
            </section>

            <div className="rounded-[32px] bg-white p-3 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-[35px]">
              {!detail.latestPlan && (
                <div className="mb-5 rounded-[28px] bg-[#e4e1fa] p-5">
                  <p className="text-base font-bold text-black">
                    There&apos;s no study plan yet
                  </p>
                  <p className="mt-1 text-sm leading-6 text-black">
                    Saved changes are used when you generate one.
                  </p>
                  <div className="mt-3">
                    <Link href={`/students/${params.id}/settings`}>
                      <PillButton>Generate a plan in Settings</PillButton>
                    </Link>
                  </div>
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
                    <PillButton onClick={save} loading={isSaving}>
                      {detail.latestPlan ? 'Save and update plan' : 'Save'}
                    </PillButton>
                    <PillButton
                      tone="outline"
                      disabled={isSaving}
                      onClick={() => setDraft(EMPTY_DRAFT)}
                    >
                      Discard all
                    </PillButton>
                  </div>
                </div>
              )}

              {error && (
                <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
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
                  <div
                    key={i}
                    className="rounded-[2rem] border-2 border-dashed border-[#F7CC46] bg-white p-4 sm:p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Badge>
                          {WEIGHT_LABEL[s.examWeight]} · out of {s.fullMarks}
                        </Badge>
                        <h2 className="mt-3.5 text-2xl font-bold tracking-tight text-black sm:text-3xl">
                          {s.name} <Unsaved />
                        </h2>
                        {s.topics.length > 0 && (
                          <p className="mt-0.5 text-sm text-[#65615D]">
                            {s.topics.join(', ')}
                          </p>
                        )}
                      </div>
                      <PillButton
                        tone="danger"
                        onClick={() =>
                          update({
                            subjects: draft.subjects.filter((_, j) => j !== i),
                          })
                        }
                      >
                        Remove
                      </PillButton>
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
                            <PillButton
                              tone="white"
                              onClick={() => setSubjectActive(s.id, true)}
                            >
                              Restore
                            </PillButton>
                            <PillButton
                              tone="danger"
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
                            </PillButton>
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
      </main>
    </div>
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
    <div className={`rounded-[2rem] p-4 sm:p-7 ${colorClass}`}>
      {isEditing ? (
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Subject" className="min-w-[10rem] flex-1">
            <input
              className={`${fieldCls} border-black/10`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </Field>
          <Field label="Full marks" className="w-28">
            <input
              type="number"
              className={`${fieldCls} border-black/10`}
              min={1}
              value={fullMarks}
              onChange={(e) => setFullMarks(Number(e.target.value))}
            />
          </Field>
          <Field label="Exam weight">
            <select
              className={`${topicSelectCls} font-semibold`}
              value={examWeight}
              onChange={(e) => setExamWeight(e.target.value as ExamWeight)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </Field>
          <PillButton onClick={done}>Done</PillButton>
          <PillButton tone="white" onClick={cancel}>
            Cancel
          </PillButton>
          {renameClash && (
            <p className="w-full text-sm font-semibold text-red-700">
              {renameClash}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-4">
          <div className="min-w-0">
            <Badge>
              {WEIGHT_LABEL[subject.examWeight]} · out of {subject.fullMarks}
            </Badge>
            <h2 className="mt-3.5 break-words text-2xl font-bold tracking-tight text-black sm:text-3xl">
              {subject.name} {edited && <Unsaved />}
            </h2>
            <p className="mt-0.5 text-sm font-semibold text-black">
              {topLevel.length} topic{topLevel.length === 1 ? '' : 's'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <BookIcon className="h-[22px] w-[22px] text-black" />
            <PillButton onClick={() => setIsEditing(true)}>
              <PencilIcon />
              Edit
            </PillButton>
            <PillButton
              tone="white"
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
            </PillButton>
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
        <AddTopicInput
          buttonLabel="Topic"
          ariaLabel="Add topic"
          onAdd={(name, d) => onAddDraftTopic(null, name, d)}
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
          className={`${topicFieldCls} min-w-[8rem] flex-1`}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') done();
          }}
        />
        {!hasSubTopics && (
          <select
            className={topicSelectCls}
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
        <PillButton onClick={done}>Done</PillButton>
        <PillButton
          tone="white"
          onClick={() => {
            setName(topic.name);
            setDifficulty(topic.difficultyRating);
            setIsEditing(false);
          }}
        >
          Cancel
        </PillButton>
      </div>
    );
  }

  return (
    <div className="flex min-h-6 items-center justify-between gap-3">
      <span
        className={`flex min-w-0 items-center gap-2 break-words text-black ${
          isSub ? 'text-sm font-normal' : 'text-base font-bold'
        }`}
      >
        {isSub && <CornerIcon className="h-4 w-4 shrink-0 text-black/50" />}
        <span className="min-w-0">
          {topic.name} {edited && <Unsaved />}
        </span>
      </span>
      <div className="flex shrink-0 items-center gap-1.5">
        {!hasSubTopics &&
          (isSub ? (
            <span className="mr-1.5 text-[11px] font-bold text-black">
              Difficulty {topic.difficultyRating}
            </span>
          ) : (
            <span className="mr-1.5 inline-flex h-[21px] items-center rounded-full bg-white px-2.5 text-[11px] font-bold text-black">
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
  items: { i: number; name: string; difficultyRating: number }[];
  onRemove: (index: number) => void;
}) {
  if (items.length === 0) return null;
  return (
    <ul className="mb-2 flex flex-wrap gap-2">
      {items.map((d) => (
        <li
          key={d.i}
          className="flex items-center gap-2 rounded-full border-[1.5px] border-dashed border-black/30 bg-white/70 px-3 py-1 text-xs font-semibold text-black"
        >
          {d.name} · difficulty {d.difficultyRating} · added
          <button
            type="button"
            aria-label={`Remove ${d.name}`}
            className="text-base leading-none text-black hover:text-red-600"
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
  buttonLabel = 'Topic',
  ariaLabel,
  onAdd,
}: {
  placeholder?: string;
  buttonLabel?: string;
  ariaLabel?: string;
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
          className={`${topicFieldCls} sm:w-auto sm:flex-1`}
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
          className={`${topicSelectCls} min-w-0 flex-1 sm:w-[126px] sm:flex-none`}
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
        <PillButton
          tone="white"
          aria-label={ariaLabel}
          className="border-[1.5px] border-black/10"
          onClick={add}
        >
          <PlusIcon />
          {buttonLabel}
        </PillButton>
      </div>
      {error && (
        <p className="mt-1.5 text-xs font-semibold text-red-700">{error}</p>
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
    <div className="rounded-[28px] border-2 border-dashed border-[#d6d4cd] bg-white p-4 sm:p-5">
      <Badge>New subject</Badge>
      <h2 className="mb-4 mt-3.5 text-2xl font-bold tracking-tight text-black sm:text-3xl">
        Add a subject
      </h2>
      <div className="flex flex-wrap items-end gap-3.5">
        <Field label="Subject" className="min-w-[12rem] flex-1">
          <input
            className={fieldCls}
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
            className={fieldCls}
            min={1}
            value={fullMarks}
            onChange={(e) => setFullMarks(Number(e.target.value))}
          />
        </Field>
        <Field label="Exam weight" className="w-full sm:w-[163px]">
          <select
            className={panelSelectCls}
            value={examWeight}
            onChange={(e) => setExamWeight(e.target.value as ExamWeight)}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
        <PillButton tone="yellow" onClick={add}>
          <PlusIcon />
          Add subject
        </PillButton>
      </div>
      {(error ?? subjectClashFor(name, existingNames)) && (
        <p className="mt-2.5 text-sm font-semibold text-red-600">
          {error ?? subjectClashFor(name, existingNames)}
        </p>
      )}
      {suggestions.length > 0 && (
        <label className="mt-4 flex items-start gap-2.5 text-sm leading-6 text-black">
          <input
            type="checkbox"
            className="mt-1 h-4 w-4 rounded border-slate-300 accent-black"
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
