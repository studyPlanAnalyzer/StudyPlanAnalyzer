'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { subjectClashFor } from '@/lib/subject-name';
import { Input } from '@/components/ui/Input';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api-client';
import { todayKey } from '@/lib/utils/date-utils';
import { examDateProblem } from '@/lib/validation';
import { suggestTopicsFor } from '@/lib/common-topics';
import { cardClass } from '@/components/ui/Card';
import { buttonClass } from '@/components/ui/Button';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { Notice } from '@/components/ui/Notice';
import { PageTitle } from '@/components/ui/PageTitle';
import { Field, Select } from '@/components/ui/Field';
import { AddTopicInput } from '@/components/ui/AddTopicInput';

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

const todayDateString = todayKey;

const sectionCard = `${cardClass} p-6 sm:p-8`;
const primaryBtn = buttonClass('yellow', 'lg');

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
    <div className={`${cardClass} p-6 sm:p-8 lg:p-10`}>
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

export default function NewExamPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
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
    const examDateError = examDateProblem(examDate);
    if (examDateError) return `${examDateError}.`;
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
    <Notice className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <span>{error}</span>

      {detail && canRetry && (
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isSubmitting}
          className={buttonClass('white', 'md', 'text-red-700')}
        >
          {isSubmitting ? 'Retrying…' : 'Try again'}
        </button>
      )}
    </Notice>
  );

  return (
    <PageShell className="pb-10">
      <AppHeader>
        <BackLink href={`/students/${params.id}/analysis`} label="Back to analysis" short="Back" />
      </AppHeader>

      <PageMain>
        {/* LOADING STATE */}
        {!detail && !error && (
          <div className="space-y-7">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* LOAD ERROR */}
        {!detail && error && (
          <Notice className="mb-6">
            {error}
          </Notice>
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
                        className={buttonClass('secondary', 'lg')}
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
                  <PageTitle>
                    Start a new exam cycle.
                  </PageTitle>

                  <p className="mt-4 max-w-2xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
                    For {detail.student.name}. This retires the current exam,
                    records fresh marks, and lets you generate a new plan aimed
                    at the next test date.
                  </p>
                </section>

                {errorBox}

                <div className="flex flex-col gap-6">
                  {/* NEXT EXAM */}
                  <section className={sectionCard}>
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
                  <section className={sectionCard}>
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
                                      <p className="mb-2 mt-1 text-sm font-bold uppercase tracking-wide text-black/50">
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
                                            <span className="mt-0.5 block text-sm font-normal text-[#65615D]">
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
                                        <Field label="Confidence">
                                          <Select
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
                                          </Select>
                                        </Field>
                                      </div>

                                      {notInExam && (
                                        <p className="mt-3 text-sm font-semibold text-[#65615D]">
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
                  <section className={sectionCard}>
                    <CardTitle
                      emoji="📚"
                      tone="bg-[#a4e5c7]"
                      title="New subjects (optional)"
                      description="Only needed if a subject is being tested for the first time."
                      action={
                        <button
                          type="button"
                          onClick={addNewSubject}
                          className={buttonClass('secondary')}
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
                              containerClassName="min-w-[8rem] flex-1"
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
                            <Field label="Exam weight">
                              <Select
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
                              </Select>
                            </Field>
                            <button
                              type="button"
                              className={buttonClass('whiteDanger')}
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
                              <p className="mb-3 text-sm font-bold uppercase tracking-wide">
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
                                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl bg-white px-4 py-2"
                                  >
                                    <label className="flex min-h-11 min-w-[8rem] flex-1 cursor-pointer items-center gap-3">
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
                                    </label>
                                    <Select
                                      className="w-[150px]"
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
                                    </Select>
                                  </div>
                                ))}

                                {s.topics.length === 0 && (
                                  <Notice tone="warning" className="font-medium">
                                    No topics yet — this subject won&apos;t get
                                    any study sessions until you add at least
                                    one.
                                  </Notice>
                                )}
                              </div>

                              <AddTopicInput
                                className="mt-4"
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
      </PageMain>
    </PageShell>
  );
}

