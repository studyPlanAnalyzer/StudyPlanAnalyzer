'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { subjectClashFor } from '@/lib/subject-name';
import { Input } from '@/components/ui/Input';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api-client';
import { formatDay, todayKey } from '@/lib/utils/date-utils';
import { examDateProblem, MAX_FULL_MARKS } from '@/lib/validation';
import { suggestTopicsFor } from '@/lib/common-topics';
import { nextExamName } from '@/lib/exam-names';
import { cardClass } from '@/components/ui/Card';
import { buttonClass } from '@/components/ui/Button';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { Notice } from '@/components/ui/Notice';
import { PageTitle } from '@/components/ui/PageTitle';
import { Field, Select } from '@/components/ui/Field';
import { AddTopicInput } from '@/components/ui/AddTopicInput';
import { EarlierTopicsSection, NewYearWarning, missedPayload, type MissedTopic } from '@/components/exam/EarlierTopicsSection';
import { academicYearText } from '@/lib/utils/academic-year';
import {
  buildMarkEntries,
  MarksheetFields,
  marksheetError,
  marksheetPayload,
  type MarkEntry,
} from '@/components/exam/MarksheetFields';

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
  examId: string | null;
  examName: string | null;
}

interface StudentDetail {
  student: { id: string; name: string };
  subjects: Subject[];
  topics: Topic[];
  exams: { id: string; name: string; examDate: string; isPrimary: boolean }[];
  latestPlan?: { id: string } | null;
}

interface NewSubjectEntry {
  name: string;
  fullMarks: number;
  examWeight: 'low' | 'medium' | 'high';
  /** Topics already taught for the new exam (none ticked to start with). */
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
  // Topics of this academic year's earlier exams that were never listed.
  const [missed, setMissed] = useState<MissedTopic[]>([]);
  // The last exam's results aren't out yet: start now, add the marks later.
  const [resultsPending, setResultsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    api
      .get<StudentDetail>(`/api/students/${params.id}`)
      .then((data) => {
        setDetail(data);
        setMarks(buildMarkEntries(data.subjects, data.topics));
        // Suggest the exam that usually follows the last one.
        const last = [...data.exams].sort((a, b) => b.examDate.localeCompare(a.examDate))[0];
        const next = nextExamName(last?.name);
        if (next) setExamName((current) => current || next);
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
                selected: false,
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
    if (!resultsPending) {
      const marksError = marksheetError(marks);
      if (marksError) return marksError;
    }
    for (const s of newSubjects) {
      if (!s.name.trim()) return 'Every new subject needs a name.';
      const clash = subjectClashFor(s.name, [
        ...(detail?.subjects ?? []).map((sub) => sub.name),
        ...newSubjects.filter((o) => o !== s).map((o) => o.name),
      ]);
      if (clash) return clash;
      if (!Number.isInteger(s.fullMarks) || s.fullMarks < 1 || s.fullMarks > MAX_FULL_MARKS)
        return `Full marks for ${s.name} must be from 1 to ${MAX_FULL_MARKS}.`;
    }
    const earlier = missedPayload({ exams: detail?.exams ?? [], examDate, today: todayDateString(), missed });
    if ('error' in earlier) return earlier.error ?? null;
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
    const earlier = missedPayload({ exams: detail?.exams ?? [], examDate, today: todayDateString(), missed });

    try {
      // One request: the new exam, the marksheet, any new subjects and their
      // topics are saved together, or not at all, so retrying is always safe.
      await api.post(`/api/students/${params.id}/exam-cycle`, {
        name: examName.trim(),
        examDate,
        resultsPending,
        marks: resultsPending ? [] : marksheetPayload(marks),
        newSubjects: newSubjects.map((s) => ({
          name: s.name.trim(),
          fullMarks: s.fullMarks,
          examWeight: s.examWeight,
          topics: s.topics
            .filter((t) => t.selected && t.name.trim())
            .map((t) => ({
              name: t.name.trim(),
              difficultyRating: t.difficultyRating,
            })),
        })),
        earlierTopics: 'earlierTopics' in earlier ? earlier.earlierTopics : [],
      });
      router.push(`/students/${params.id}/plan`);
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
                      {formatDay(activeExam.examDate)}, and
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
                    {formatDay(activeExam.examDate)}. A new
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
                    For {detail.student.name}. This starts the next exam&apos;s
                    plan. Topics from the exam just finished move to revision
                    days (Saturday, and Sunday unless school is open), and new
                    topics join the daily list as they&apos;re taught.
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
                        hint={academicYearText(examDate) ?? undefined}
                        onChange={(e) => setExamDate(e.target.value)}
                      />
                    </div>
                    <NewYearWarning
                      studentId={params.id}
                      exams={detail.exams}
                      examDate={examDate}
                      today={todayDateString()}
                    />
                  </section>

                  {/* LATEST MARKS */}
                  <section className={sectionCard}>
                    <CardTitle
                      emoji="📝"
                      tone="bg-[#F7CC46]"
                      title="Latest marks"
                      description="Enter the latest result for every topic and sub-topic. If something won't be in this exam, set its “Out of” to 0 and nothing is recorded for it."
                    />

                    <label className="mb-5 flex cursor-pointer items-start gap-3 rounded-2xl bg-[#F0EFED] p-4">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 shrink-0 accent-black"
                        checked={resultsPending}
                        onChange={(e) => setResultsPending(e.target.checked)}
                      />
                      <span>
                        <span className="block text-sm font-bold sm:text-base">
                          Results not out yet
                        </span>
                        <span className="mt-0.5 block text-sm text-[#65615D]">
                          Start the new cycle now and add the marks when they come.
                        </span>
                      </span>
                    </label>

                    {resultsPending ? (
                      <Notice tone="info">
                        No marks needed now. The plan keeps using the last
                        results you entered, and you can add this exam&apos;s
                        marks with &quot;Add exam marks&quot; once they&apos;re out.
                      </Notice>
                    ) : (
                      <MarksheetFields
                        subjects={detail.subjects}
                        marks={marks}
                        onChange={updateMark}
                        emptyText="No subjects yet — add one below."
                      />
                    )}
                  </section>

                  {/* EARLIER TOPICS */}
                  <section className={sectionCard}>
                    <CardTitle
                      emoji="🔁"
                      tone="bg-[#F1B5AE]"
                      title="Earlier topics"
                      description="Everything listed for this academic year's earlier exams. They're all on the revision list already, so there's nothing to add again. Add any that were missed."
                    />
                    <EarlierTopicsSection
                      studentId={params.id}
                      subjects={detail.subjects}
                      topics={detail.topics}
                      exams={detail.exams}
                      examDate={examDate}
                      today={todayDateString()}
                      missed={missed}
                      onMissedChange={setMissed}
                    />
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
                              min={1}
                              max={MAX_FULL_MARKS}
                              value={s.fullMarks}
                              onChange={(e) =>
                                updateNewSubject(i, {
                                  fullMarks: Number(e.target.value),
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
                    {isSubmitting ? 'Saving…' : 'Save and go to the plan'}
                  </button>
                </div>
              </>
            );
          })()}
      </PageMain>
    </PageShell>
  );
}

