'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, ApiError } from '@/lib/api-client';
import { DailyChallengeStatsCard } from '@/components/daily-challenge/DailyChallengeStatsCard';
import { formatDay, todayKey } from '@/lib/utils/date-utils';
import { Modal } from '@/components/ui/Modal';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { Notice } from '@/components/ui/Notice';
import { PageTitle } from '@/components/ui/PageTitle';
import { buttonClass } from '@/components/ui/Button';
import { cardClass } from '@/components/ui/Card';
import { Tag } from '@/components/ui/Tag';
import { TopicStatusBadge } from '@/components/ui/TopicStatusBadge';
import { StudentBottomNav } from '@/components/ui/StudentBottomNav';

interface SubjectAnalysis {
  subjectId: string;
  name: string;
  examWeight: string;
  latestPercent: number | null;
  isEstimated: boolean;
  percentHistory: number[];
  latestConfidence: 'low' | 'medium' | 'high' | null;
  trend: 'improving' | 'declining' | 'stable' | 'unknown';
  strength: 'weak' | 'medium' | 'strong' | 'unknown';
  priority: number;
  topics: {
    id: string;
    name: string;
    priority: number;
    difficultyRating: number;
    mastered: boolean;
    struggling: boolean;
  }[];
}

interface AnalysisResponse {
  student: { id: string; name: string; grade: string };
  overallAveragePercent: number | null;
  assessmentsCount: number;
  subjects: SubjectAnalysis[];
  topPriorityTopics: {
    id: string;
    name: string;
    subjectName: string;
    priority: number;
    mastered: boolean;
    struggling: boolean;
  }[];
}

interface StudentDetail {
  student: { id: string; name: string };
  exams: {
    id: string;
    name: string;
    examDate: string;
    isPrimary: boolean;
  }[];
  currentExamId: string | null;
  latestPlan: { id: string } | null;
  /** The last exam's results, still to be added ("Add exam marks"). */
  resultsPending: { examId: string; name: string; examDate: string } | null;
}

const trendLabel: Record<string, string> = {
  improving: '↗ Improving',
  declining: '↘ Declining',
  stable: '→ Stable',
  unknown: '— No trend yet',
};

const confidenceLabel: Record<string, string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

const subjectColors = [
  'bg-[#F7CC46]',
  'bg-[#a4e5c7]',
  'bg-[#a8acf0]',
  'bg-[#EDB1AA]',
];

// --------------------------------------------------
// SUBJECT DETAIL MODAL
// --------------------------------------------------

function SubjectDetailModal({
  subject,
  onClose,
}: {
  subject: SubjectAnalysis;
  onClose: () => void;
}) {
  const maxScore = Math.max(...subject.percentHistory, 100);

  // Already in focus order from the API: struggling first, mastered last.
  const sortedTopics = subject.topics;

  const strengthStyles: Record<string, string> = {
    weak: 'border-[#F1B5AE] bg-[#F1B5AE]/20 text-[#A4473D]',
    medium: 'border-[#F7CC46] bg-[#F7CC46]/20 text-[#8A6900]',
    strong: 'border-[#9DE1C5] bg-[#9DE1C5]/20 text-[#16865B]',
    unknown: 'border-[#D5D5D5] bg-[#EEEEEE] text-[#555555]',
  };

  const topicColors = [
    'bg-[#F7CC46]',
    'bg-[#a4e5c7]',
    'bg-[#a8acf0]',
    'bg-[#F1B5AE]',
  ];

  return (
    <Modal
      onBackdropClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="subject-analysis-title"
      className="relative max-w-2xl sm:p-8"
    >
        {/* Header */}
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="subject-analysis-title"
              className="text-2xl font-extrabold tracking-tight text-black sm:text-3xl"
            >
              {subject.name}
            </h2>

            <p className="mt-1 text-sm font-semibold uppercase tracking-[0.12em] text-[#65615D]">
              {subject.examWeight} exam weight
            </p>
          </div>

          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#F0EFED] text-lg text-black transition hover:bg-[#E7E5E2] active:scale-95"
          >
            ×
          </button>
        </div>

        {/* Performance overview */}
        <div className="mb-6 flex flex-wrap items-center gap-6">
          <div>
            <p className="text-sm text-[#65615D]">Latest score</p>

            <p className="text-2xl font-extrabold text-black">
              {subject.latestPercent !== null
                ? `${subject.latestPercent}%`
                : '—'}
            </p>

            {subject.isEstimated && (
              <span className="text-sm text-[#65615D]">Estimated</span>
            )}
          </div>

          <div>
            <p className="text-sm text-[#65615D]">Trend</p>

            <p className="text-base font-semibold text-black">
              {trendLabel[subject.trend]}
            </p>
          </div>

          {subject.latestConfidence && (
            <div>
              <p className="text-sm text-[#65615D]">Confidence</p>

              <p className="text-base font-semibold text-black">
                {confidenceLabel[subject.latestConfidence]}
              </p>
            </div>
          )}

          <div>
            <p className="text-sm text-[#65615D]">Strength</p>

            <span
              className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold capitalize ${
                strengthStyles[subject.strength] ?? strengthStyles.unknown
              }`}
            >
              {subject.strength}
            </span>
          </div>
        </div>

        {/* Low confidence notice */}
        {subject.latestConfidence === 'low' && (
          <Notice tone="warning" className="mb-6 font-semibold">
            ⚠ Low confidence — treated as a priority topic even though the score
            looks strong.
          </Notice>
        )}

        {/* Test history */}
        <div className="mb-6">
          <p className="mb-3 text-sm font-bold uppercase tracking-wide text-black">
            Test history ({subject.percentHistory.length} recorded)
          </p>

          {subject.percentHistory.length === 0 ? (
            <p className="text-sm text-[#65615D]">No marks logged yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {subject.percentHistory.map((score, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-sm text-[#65615D]">
                    Test {i + 1}
                  </span>

                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-[#F0EFED]">
                    <div
                      className="h-full rounded-full bg-black transition-all"
                      style={{
                        width: `${Math.min((score / maxScore) * 100, 100)}%`,
                      }}
                    />
                  </div>

                  <span className="w-10 shrink-0 text-right text-sm font-bold text-black">
                    {score}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* All topics */}
        <div>
          <p className="mb-3 text-sm font-bold uppercase tracking-wide text-black">
            All topics ({sortedTopics.length})
          </p>

          {sortedTopics.length === 0 ? (
            <p className="text-sm text-[#65615D]">No topics recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedTopics.map((t, i) => (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#F0EFED] px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                        topicColors[i % topicColors.length]
                      }`}
                    />

                    <span className="text-sm font-semibold text-black">
                      {t.name}
                    </span>

                    <TopicStatusBadge
                            mastered={t.mastered}
                            struggling={t.struggling}
                            size="sm"
                          />
                  </div>

                  <div className="flex items-center gap-3 text-sm text-[#65615D]">
                    <span>
                      Priority{' '}
                      <strong className="font-semibold text-black">
                        {t.priority}
                      </strong>
                    </span>

                    <span>
                      Difficulty{' '}
                      <strong className="font-semibold text-black">
                        {t.difficultyRating}/5
                      </strong>
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
    </Modal>
  );
}

// --------------------------------------------------
// MAIN ANALYSIS PAGE
// --------------------------------------------------

export default function AnalysisPage(props: {
  params: Promise<{ id: string }>;
}) {
  const params = use(props.params);
  const router = useRouter();

  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedSubject, setSelectedSubject] =
    useState<SubjectAnalysis | null>(null);

  // --------------------------------------------------
  // FETCH DATA
  // --------------------------------------------------

  useEffect(() => {
    Promise.all([
      api.get<AnalysisResponse>(`/api/analysis/${params.id}`),
      api.get<StudentDetail>(`/api/students/${params.id}`),
    ])
      .then(([a, d]) => {
        setAnalysis(a);
        setDetail(d);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }

        setError("Couldn't load the analysis. Please try refreshing.");
      });
  }, [params.id, router]);


  // --------------------------------------------------
  // EXAM STATUS
  // --------------------------------------------------

  const hasPlan = !!detail?.latestPlan;

  const primaryExam =
    detail?.exams.find((e) => e.id === detail.currentExamId) ?? null;

  const examHasPassed = primaryExam
    ? primaryExam.examDate <= todayKey()
    : false;

  const canStartSession = !primaryExam || examHasPassed;

  // --------------------------------------------------
  // NAVIGATION ITEMS
  // --------------------------------------------------

  const menuItems = [
    {
      href: `/students/${params.id}/add-test-marks`,
      label: 'Log a test',
    },
    {
      href: `/students/${params.id}/subjects`,
      label: 'Subjects & topics',
    },
    {
      href: `/students/${params.id}/tests`,
      label: 'Test history',
    },
    {
      href: `/students/${params.id}/new-exam`,
      label: 'Start new exam cycle',
    },
    ...(canStartSession
      ? [
          {
            href: `/students/${params.id}/new-session`,
            label: 'Start a new academic session with no previous exams',
          },
        ]
      : []),
  ];

  // --------------------------------------------------
  // PAGE UI
  // --------------------------------------------------

  return (
    <PageShell withBottomNav>
      <AppHeader
        menu={{
          breakpoint: 'lg',
          items: [{ href: '/dashboard', label: '← Back to dashboard' }, ...menuItems],
        }}
      >
        <BackLink href="/dashboard" label="Back to dashboard" />
      </AppHeader>

      <PageMain>
        {/* ERROR MESSAGE */}
        {error && (
          <Notice className="mb-6">
            {error}
          </Notice>
        )}

        {/* LOADING STATE */}
        {!analysis && !error && (
          <div className="space-y-7">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {analysis && (
          <>
            {/* HERO SECTION */}
            <section className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
              <div className="min-w-0 flex-1">
                <PageTitle>
                  {analysis.student.name}&apos;s performance.
                </PageTitle>

                <p className="mt-4 max-w-xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
                  Grade {analysis.student.grade}
                </p>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex flex-wrap items-center gap-3">
                {hasPlan && detail?.latestPlan && (
                  <Link
                    href={`/students/${params.id}/plan?planId=${detail.latestPlan.id}`}
                    className={buttonClass('secondary', 'lg', 'w-fit')}
                  >
                    View current plan
                  </Link>
                )}

              </div>
            </section>

            {/* EXAM PASSED NOTIFICATION */}
            {examHasPassed && primaryExam && (
              <Notice tone="neutral" className="mb-8 sm:mb-10">
                <div className="flex items-start gap-4 sm:gap-5">
                  <svg
                    className="mt-1 h-7 w-7 shrink-0 text-black"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  >
                    <rect x="3" y="5" width="18" height="16" rx="2" />
                    <path strokeLinecap="round" d="M16 3v4M8 3v4M3 10h18" />
                    <path strokeLinecap="round" d="M9 14l2 2 4-4" />
                  </svg>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium leading-6 text-black sm:text-base">
                      <strong className="font-bold">{primaryExam.name}</strong>{' '}
                      was on{' '}
                      {formatDay(primaryExam.examDate, {}, 'en-GB')}{' '}
                      — that&apos;s already passed, so its study plan has been
                      cleared. Start the next exam cycle, or a new academic
                      session, to get a new plan.
                    </p>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link
                        href={`/students/${params.id}/new-exam`}
                        className={buttonClass('primary', 'lg')}
                      >
                        Start new exam cycle
                      </Link>

                      <Link
                        href={`/students/${params.id}/new-session`}
                        className={buttonClass('white', 'lg', '', true)}
                      >
                        Start a new academic session with no previous exams
                      </Link>
                    </div>
                  </div>
                </div>
              </Notice>
            )}

            {/* RESULTS STILL TO ADD */}
            {detail?.resultsPending && (
              <Notice
                tone="info"
                className="mb-8 flex flex-col gap-3 sm:mb-10 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="text-sm font-medium leading-6 text-black sm:text-base">
                  <strong className="font-bold">{detail.resultsPending.name}</strong>{' '}
                  results aren&apos;t added yet. Until they are, the plan uses
                  the marks before them.
                </span>
                <Link
                  href={`/students/${params.id}/exam-marks`}
                  className={buttonClass('primary', 'lg', 'w-fit shrink-0')}
                >
                  Add exam marks
                </Link>
              </Notice>
            )}

            {/* DESKTOP QUICK NAVIGATION */}
            <nav className="mb-8 hidden w-full items-stretch gap-2 rounded-full bg-[#F0EFED] p-2 sm:mb-10 lg:flex">
              {menuItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex min-h-[56px] min-w-0 flex-1 items-center justify-center rounded-full px-3 py-3 text-center text-sm font-semibold text-black transition hover:bg-white xl:text-base"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* PERFORMANCE SNAPSHOT + DAILY CHALLENGE */}
            <section className="mb-8 grid items-stretch gap-6 sm:mb-10 lg:grid-cols-[2fr_0.95fr]">
              {/* PERFORMANCE SNAPSHOT */}
              <div className={`${cardClass} p-6 sm:p-8 lg:p-10`}>
                <Tag className="mb-7 px-5 py-2">Performance snapshot</Tag>

                {/* Overall average */}
                <div className="flex items-center gap-5 sm:gap-6">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[28px] bg-[#F7CC46] text-2xl font-extrabold sm:h-24 sm:w-24 sm:text-3xl">
                    {analysis.overallAveragePercent !== null
                      ? `${analysis.overallAveragePercent}%`
                      : '—'}
                  </div>

                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-extrabold tracking-tight sm:text-2xl">
                      Overall average
                    </h3>

                    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-[#F0EFED]">
                      <div
                        className="h-full rounded-full bg-black transition-all"
                        style={{
                          width: `${Math.max(
                            0,
                            Math.min(100, analysis.overallAveragePercent ?? 0),
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="my-7 border-t border-black/10" />

                {/* Assessments */}
                <div className="flex items-center gap-5 sm:gap-6">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-[28px] bg-[#a4e5c7] text-4xl font-extrabold sm:h-24 sm:w-24">
                    {analysis.assessmentsCount}
                  </div>

                  <div>
                    <h3 className="text-lg font-extrabold tracking-tight sm:text-2xl">
                      Assessments
                    </h3>

                    <p className="mt-1 text-sm font-semibold text-black/65 sm:text-base">
                      recorded so far
                    </p>
                  </div>
                </div>
              </div>

              {/* DAILY BRAIN CHALLENGE */}
              <DailyChallengeStatsCard studentId={params.id} />
            </section>

            {/* SUBJECTS */}
            <section className="mb-8 sm:mb-10">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                    Subjects
                  </h2>

                  <p className="mt-1 text-sm text-[#65615D] sm:text-base">
                    Your performance, progress and priority topics
                  </p>
                </div>

                <Link
                  href={`/students/${params.id}/subjects`}
                  className={buttonClass('secondary')}
                >
                  Manage subjects →
                </Link>
              </div>

              {analysis.subjects.length === 0 ? (
                <EmptyState
                  title="No subjects yet"
                  description="Add subjects and marks to see a performance breakdown."
                />
              ) : (
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                  {analysis.subjects.map((s, index) => {
                    const cardColor =
                      subjectColors[index % subjectColors.length];

                    const score = s.latestPercent ?? 0;

                    return (
                      <div
                        key={s.subjectId}
                        onClick={() => setSelectedSubject(s)}
                        className={`group relative flex min-h-[360px] cursor-pointer flex-col rounded-[32px] ${cardColor} p-6 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(0,0,0,0.10)] sm:p-8`}
                      >
                        {/* Exam weight and score */}
                        <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
                          <Tag className="px-5 py-2">{s.examWeight} exam weight</Tag>

                          <div className="text-xl font-extrabold">
                            {s.latestPercent !== null
                              ? `${s.latestPercent}%`
                              : '—'}
                          </div>
                        </div>

                        {/* Subject name */}
                        <h3 className="mb-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
                          {s.name}
                        </h3>

                        {/* Trend */}
                        <p className="text-sm font-semibold text-black/70 sm:text-base">
                          {trendLabel[s.trend]}
                        </p>

                        {s.isEstimated && (
                          <p className="mt-1 text-sm font-semibold text-black/60">
                            Estimated score
                          </p>
                        )}

                        {s.latestConfidence === 'low' && (
                          <p className="mt-2 text-sm font-bold text-black">
                            ⚠ Low confidence
                          </p>
                        )}

                        {/* Progress bar */}
                        <div className="mb-6 mt-5 h-2.5 overflow-hidden rounded-full bg-white/50">
                          <div
                            className="h-full rounded-full bg-black/75 transition-all"
                            style={{
                              width: `${Math.max(0, Math.min(100, score))}%`,
                            }}
                          />
                        </div>

                        {/* Priority topics */}
                        <div className="flex-1">
                          <p className="mb-3 text-sm font-bold uppercase tracking-wide">
                            Priority topics
                          </p>

                          {s.topics.length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {s.topics.slice(0, 4).map((t) => (
                                <span
                                  key={t.id}
                                  className="inline-flex items-center gap-2 rounded-full bg-white/75 px-4 py-2 text-sm font-semibold text-black"
                                >
                                  {t.name}
                                  <TopicStatusBadge
                            mastered={t.mastered}
                            struggling={t.struggling}
                            size="sm"
                          />
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm font-semibold text-black/50">
                              No priority topics yet
                            </p>
                          )}
                        </div>

                        {/* View analysis button */}
                        <button
                          type="button"
                          className={buttonClass('primary', 'lg', 'mt-7 w-fit')}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSubject(s);
                          }}
                        >
                          View full analysis
                          <span>→</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* TOP 3 TOPICS TO FOCUS ON */}
            {analysis.topPriorityTopics.length > 0 && (
              <section className={`${cardClass} mb-8 p-6 sm:mb-10 sm:p-8 lg:p-10`}>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <Tag className="px-5 py-2">Focus list</Tag>

                    <h3 className="mt-4 text-2xl font-extrabold tracking-tight sm:text-3xl">
                      Top 3 topics to focus on
                    </h3>
                  </div>

                  <svg
                    className="mt-1 h-8 w-8 shrink-0 text-black/65"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <circle cx="12" cy="12" r="5" />
                    <circle cx="12" cy="12" r="1" />
                  </svg>
                </div>

                <div className="flex flex-col gap-3">
                  {analysis.topPriorityTopics.map((t, i) => {
                    const numberColors = [
                      'bg-[#F7CC46]',
                      'bg-[#a4e5c7]',
                      'bg-[#a8acf0]',
                    ];

                    return (
                      <div
                        key={t.id}
                        className="flex min-h-[66px] items-center gap-4 rounded-full bg-[#F0EFED] px-3 py-2 sm:px-5"
                      >
                        <div
                          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                            numberColors[i % numberColors.length]
                          } text-lg font-extrabold text-black`}
                        >
                          {i + 1}
                        </div>

                        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-sm font-semibold text-black sm:text-base">
                            {t.name}
                          </span>

                          <span className="text-sm text-[#65615D] sm:text-base">
                            · {t.subjectName}
                          </span>

                          <TopicStatusBadge
                            mastered={t.mastered}
                            struggling={t.struggling}
                            size="sm"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </PageMain>

      <StudentBottomNav studentId={params.id} />

      {/* SUBJECT DETAIL MODAL */}
      {selectedSubject && (
        <SubjectDetailModal
          subject={selectedSubject}
          onClose={() => setSelectedSubject(null)}
        />
      )}

      {/* BUFFER WEEK MODAL */}
    </PageShell>
  );
}
