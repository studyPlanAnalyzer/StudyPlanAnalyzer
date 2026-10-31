'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { subjectClashFor } from '@/lib/subject-name';
import { Input } from '@/components/ui/Input';
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

const cardClass =
  'rounded-[32px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-8';

const selectClass =
  'rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10 disabled:bg-[#F0EFED] disabled:opacity-60';

const pillBase =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50';
const pillBlack = `${pillBase} bg-black text-white hover:bg-black/80`;
const pillGrey = `${pillBase} bg-[#F0EFED] text-black hover:bg-[#E7E5E2]`;
const pillWhiteDanger = `${pillBase} bg-white text-red-600 hover:bg-red-50`;

const primaryBtn =
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[#F7CC46] px-6 py-3.5 text-sm font-semibold text-black shadow-[0_5px_12px_rgba(0,0,0,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F0C33A] hover:shadow-[0_7px_16px_rgba(0,0,0,0.10)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:px-7 sm:py-4 sm:text-base';

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

function CardTitle({
  emoji,
  tone,
  title,
  description,
  action,
}: {
  emoji: string;
  tone: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-4">
        <div
          className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] text-2xl ${tone}`}
        >
          {emoji}
        </div>

        <div className="min-w-0">
          <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
            {title}
          </h2>

          {description && (
            <p className="mt-1 max-w-3xl text-sm leading-6 text-[#65615D] sm:text-base">
              {description}
            </p>
          )}
        </div>
      </div>

      {action}
    </div>
  );
}

function NoticeCard({
  emoji,
  title,
  children,
  actions,
}: {
  emoji: string;
  title: string;
  children: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div className="rounded-[32px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-8 lg:p-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-[#F7CC46] text-3xl">
          {emoji}
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {title}
          </h2>

          <div className="mt-3 flex max-w-3xl flex-col gap-3 text-sm leading-7 text-[#65615D] sm:text-base">
            {children}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">{actions}</div>
        </div>
      </div>
    </div>
  );
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
      const clash = subjectClashFor(s.name, [
        ...(detail?.subjects ?? []).map((sub) => sub.name),
        ...newSubjects.filter((o) => o !== s).map((o) => o.name),
      ]);
      if (clash) return clash;
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

  const errorBox = error && (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span>{error}</span>

      {detail && canRetry && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100 active:scale-95 disabled:opacity-50"
        >
          {isSubmitting ? 'Retrying…' : 'Try again'}
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FAF9F6] pb-10 text-black">
      {/* HEADER */}
      <header className="relative z-30 bg-[#FAF9F6]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-5 py-5 sm:gap-6 sm:px-7 lg:px-0">
          {/* BRAND */}
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-3 sm:gap-4"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black text-xl font-bold text-white sm:h-14 sm:w-14 sm:text-2xl">
              S
            </div>

            <span className="truncate text-lg font-bold tracking-tight sm:text-2xl">
              StudyPlan Analyzer
            </span>
          </Link>

          {/* BACK */}
          <Link
            href={`/students/${params.id}/analysis`}
            className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-[#F0EFED] px-5 text-sm font-semibold transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:px-6 sm:text-base"
          >
            <ArrowLeftIcon />
            <span>
              Back<span className="hidden sm:inline"> to analysis</span>
            </span>
          </Link>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto w-full max-w-[1400px] px-5 pt-5 sm:px-7 sm:pt-8 lg:px-0">
        {/* LOADING STATE */}
        {!detail && !error && (
          <div className="space-y-7">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* LOAD ERROR */}
        {!detail && error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {detail &&
          (() => {
            const activeExam = detail.exams.find(
              (e) => e.isPrimary && e.examDate > todayDateString(),
            );
            if (activeExam) {
              const hasPlan = !!detail.latestPlan;

              if (!hasPlan) {
                return (
                  <NoticeCard
                    emoji="📋"
                    title="You don't have a study plan yet."
                    actions={
                      <Link
                        href={`/students/${params.id}/analysis`}
                        className={primaryBtn}
                      >
                        Go to analysis
                      </Link>
                    }
                  >
                    <p>
                      Go back and create a plan from the analysis page first.
                      Your current exam, &ldquo;
                      <span className="font-bold text-black">
                        {activeExam.name}
                      </span>
                      &rdquo;, runs until{' '}
                      {new Date(activeExam.examDate).toLocaleDateString()}, and
                      a new exam cycle can only start once it&apos;s over.
                    </p>
                  </NoticeCard>
                );
              }

              return (
                <NoticeCard
                  emoji="⏳"
                  title={`“${activeExam.name}” is still active.`}
                  actions={
                    <>
                      <Link
                        href={`/students/${params.id}/settings`}
                        className={primaryBtn}
                      >
                        Go to Settings
                      </Link>
                      <Link
                        href={`/students/${params.id}/plan`}
                        className={`${pillGrey} px-6 py-3.5 sm:px-7 sm:py-4 sm:text-base`}
                      >
                        Back to plan
                      </Link>
                    </>
                  }
                >
                  <p>
                    It doesn&apos;t end until{' '}
                    {new Date(activeExam.examDate).toLocaleDateString()}. A new
                    exam cycle can only start once the current one is over —
                    otherwise the study plan has no clear exam to build toward.
                  </p>
                  <p>
                    Need this exam to end sooner instead? Edit its date directly
                    in Settings rather than starting a new cycle.
                  </p>
                </NoticeCard>
              );
            }
            return (
              <>
                {/* HERO SECTION */}
                <section className="mb-8 sm:mb-10">
                  <h1 className="dashboard-headline relative inline-block max-w-full text-[clamp(1.15rem,5.1vw,4rem)] font-extrabold leading-tight tracking-[-0.045em]">
                    Start a new exam cycle.
                  </h1>

                  <p className="mt-4 max-w-2xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
                    For {detail.student.name}. This retires the current exam,
                    records fresh marks, and lets you generate a new plan aimed
                    at the next test date.
                  </p>
                </section>

                {errorBox}

                <div className="flex flex-col gap-6">
                  {/* NEXT EXAM */}
                  <section className={cardClass}>
                    <CardTitle
                      emoji="🎯"
                      tone="bg-[#a8acf0]"
                      title="Next exam"
                      description="What's it called, and when is it?"
                    />

                    <div className="grid gap-5 sm:grid-cols-2">
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
                  </section>

                  {/* LATEST MARKS */}
                  <section className={cardClass}>
                    <CardTitle
                      emoji="📝"
                      tone="bg-[#F7CC46]"
                      title="Latest marks"
                      description="Enter the latest result for every topic and sub-topic. If something won't be in this exam, set its “Out of” to 0 and nothing is recorded for it."
                    />

                    <div className="flex flex-col gap-4">
                      {detail.subjects.map((subject) => {
                        const rows = marks.filter(
                          (m) => m.subjectId === subject.id,
                        );
                        let lastGroup: string | null = null;
                        return (
                          <div
                            key={subject.id}
                            className="rounded-[26px] bg-[#F0EFED] p-5"
                          >
                            <p className="mb-4 text-base font-extrabold tracking-tight sm:text-lg">
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
                                      <p className="mb-2 mt-1 text-xs font-bold uppercase tracking-wide text-black/50">
                                        {m.groupName}
                                      </p>
                                    )}

                                    <div className="rounded-2xl bg-white p-4">
                                      <div className="flex flex-wrap items-end gap-3">
                                        <div className="min-w-[8rem] flex-1 self-center text-sm font-semibold sm:text-base">
                                          {m.topicId
                                            ? m.label
                                            : 'Whole subject'}
                                          {!m.topicId && (
                                            <span className="mt-0.5 block text-xs font-normal text-[#65615D]">
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
                                          value={
                                            notInExam ? '' : m.obtainedMarks
                                          }
                                          onChange={(e) =>
                                            updateMark(m.key, {
                                              obtainedMarks: e.target.value,
                                            })
                                          }
                                        />
                                        <div className="flex flex-col gap-1">
                                          <label className="text-sm font-medium text-black">
                                            Confidence
                                          </label>
                                          <select
                                            className={selectClass}
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
                                            <option value="medium">
                                              Medium
                                            </option>
                                            <option value="high">High</option>
                                          </select>
                                        </div>
                                      </div>

                                      {notInExam && (
                                        <p className="mt-3 text-xs font-semibold text-[#65615D]">
                                          Not in this exam. Nothing will be
                                          recorded for it.
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}

                      {detail.subjects.length === 0 && (
                        <p className="text-sm text-[#65615D]">
                          No subjects yet — add one below.
                        </p>
                      )}
                    </div>
                  </section>

                  {/* NEW SUBJECTS */}
                  <section className={cardClass}>
                    <CardTitle
                      emoji="📚"
                      tone="bg-[#a4e5c7]"
                      title="New subjects (optional)"
                      description="Only needed if a subject is being tested for the first time."
                      action={
                        <button
                          type="button"
                          onClick={addNewSubject}
                          className={pillGrey}
                        >
                          + Add subject
                        </button>
                      }
                    />

                    <div className="flex flex-col gap-4">
                      {newSubjects.map((s, i) => (
                        <div
                          key={i}
                          className="rounded-[26px] bg-[#F0EFED] p-5"
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
                              <label className="text-sm font-medium text-black">
                                Exam weight
                              </label>
                              <select
                                className={selectClass}
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
                            <button
                              type="button"
                              className={pillWhiteDanger}
                              onClick={() => removeNewSubject(i)}
                            >
                              Remove
                            </button>
                            {(() => {
                              const clash = subjectClashFor(s.name, [
                                ...detail.subjects.map((sub) => sub.name),
                                ...newSubjects
                                  .filter((o) => o !== s)
                                  .map((o) => o.name),
                              ]);
                              return clash ? (
                                <p className="w-full text-sm font-medium text-red-700">
                                  {clash}
                                </p>
                              ) : null;
                            })()}
                          </div>

                          {s.name.trim() && (
                            <div className="mt-5 border-t border-black/10 pt-5">
                              <p className="mb-3 text-xs font-bold uppercase tracking-wide">
                                Topics for {s.name}
                              </p>
                              <p className="mb-3 text-sm text-[#65615D]">
                                Needed so the plan can schedule sessions for
                                this subject.
                              </p>

                              <div className="flex flex-col gap-2">
                                {s.topics.map((t, j) => (
                                  <div
                                    key={j}
                                    className="flex items-center gap-3 rounded-2xl bg-white px-4 py-3"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={t.selected}
                                      onChange={() =>
                                        toggleNewSubjectTopic(i, j)
                                      }
                                      className="h-5 w-5 shrink-0 cursor-pointer accent-black"
                                    />
                                    <span className="min-w-0 flex-1 text-sm font-semibold sm:text-base">
                                      {t.name}
                                    </span>
                                    <select
                                      className={`${selectClass} !py-1.5 text-xs`}
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
                                  <p className="rounded-2xl bg-[#fff5dc] px-4 py-3 text-sm font-medium text-[#805500]">
                                    No topics yet — this subject won&apos;t get
                                    any study sessions until you add at least
                                    one.
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
                  </section>
                </div>

                {/* SAVE BAR */}
                <div className="mt-8 flex justify-end sm:mt-10">
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className={primaryBtn}
                  >
                    {isSubmitting ? 'Saving…' : 'Save and go to analysis'}
                  </button>
                </div>
              </>
            );
          })()}
      </main>

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

function NewSubjectTopicInput({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <div className="mt-4 flex gap-2">
      <input
        className="min-w-0 flex-1 rounded-full border border-black/15 bg-white px-5 py-3 text-sm outline-none transition placeholder:text-black/35 focus:border-black focus:ring-2 focus:ring-black/10"
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
      <button
        type="button"
        className={pillBlack}
        onClick={() => {
          onAdd(value);
          setValue('');
        }}
      >
        Add
      </button>
    </div>
  );
}
