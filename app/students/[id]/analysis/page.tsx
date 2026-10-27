'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, ApiError } from '@/lib/api-client';
import { DailyChallengeStatsCard } from '@/components/daily-challenge/DailyChallengeStatsCard';
import { BufferWeekChoiceModal } from '@/components/plan/BufferWeekChoiceModal';

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
  }[];
}

interface StudentDetail {
  student: { id: string; name: string };
  exams: { id: string; name: string; examDate: string; isPrimary: boolean }[];
  currentExamId: string | null;
  latestPlan: { id: string } | null;
}

const strengthTone: Record<string, 'weak' | 'medium' | 'strong' | 'neutral'> = {
  weak: 'weak',
  medium: 'medium',
  strong: 'strong',
  unknown: 'neutral',
};

const trendLabel: Record<string, string> = {
  improving: '↗ Improving',
  declining: '↘ Declining',
  stable: '→ Stable',
  unknown: 'No trend yet',
};

const confidenceLabel: Record<string, string> = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
};

function SubjectDetailModal({
  subject,
  onClose,
}: {
  subject: SubjectAnalysis;
  onClose: () => void;
}) {
  const maxScore = Math.max(...subject.percentHistory, 100);
  const sortedTopics = [...subject.topics].sort(
    (a, b) => b.priority - a.priority,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 px-4 py-10"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">
              {subject.name}
            </h2>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              {subject.examWeight} exam weight
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div>
            <p className="text-sm text-slate-500">Latest score</p>
            <p className="text-2xl font-semibold text-slate-900">
              {subject.latestPercent !== null
                ? `${subject.latestPercent}%`
                : '—'}
              {subject.isEstimated && (
                <span className="ml-2 text-xs font-normal text-slate-400">
                  Estimated
                </span>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm text-slate-500">Trend</p>
            <p className="text-base font-medium text-slate-800">
              {trendLabel[subject.trend]}
            </p>
          </div>
          {subject.latestConfidence && (
            <div>
              <p className="text-sm text-slate-500">Confidence</p>
              <p className="text-base font-medium text-slate-800">
                {confidenceLabel[subject.latestConfidence]}
              </p>
            </div>
          )}
          <div>
            <p className="text-sm text-slate-500">Strength</p>
            <Badge tone={strengthTone[subject.strength]}>
              {subject.strength}
            </Badge>
          </div>
        </div>

        {subject.latestConfidence === 'low' && (
          <p className="mb-6 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
            ⚠ Marked low confidence — treated as a priority topic even though
            the score looks strong
          </p>
        )}

        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-slate-700">
            Test history ({subject.percentHistory.length} recorded)
          </p>
          {subject.percentHistory.length === 0 ? (
            <p className="text-sm text-slate-400">No marks logged yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {subject.percentHistory.map((score, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="w-16 shrink-0 text-xs text-slate-400">
                    Test {i + 1}
                  </span>
                  <div className="h-2 flex-1 rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-indigo-500"
                      style={{ width: `${(score / maxScore) * 100}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-xs font-medium text-slate-600">
                    {score}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-slate-700">
            All topics ({sortedTopics.length})
          </p>
          {sortedTopics.length === 0 ? (
            <p className="text-sm text-slate-400">No topics recorded yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {sortedTopics.map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2"
                >
                  <span className="text-sm text-slate-800">{t.name}</span>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>Priority {t.priority}</span>
                    <span>Difficulty {t.difficultyRating}/5</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AnalysisPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showBufferChoice, setShowBufferChoice] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [pendingExam, setPendingExam] = useState<
    StudentDetail['exams'][number] | null
  >(null);
  const [selectedSubject, setSelectedSubject] =
    useState<SubjectAnalysis | null>(null);

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

  async function handleGeneratePlan() {
    if (!detail) return;
    const primaryExam = detail.exams.find((e) => e.id === detail.currentExamId);
    if (!primaryExam) {
      setError('Add an exam before generating a plan.');
      return;
    }

    // Regenerating an existing plan reuses its stored end-date choice and
    // needs no popup; only a brand-new plan asks the buffer-week question.
    if (detail.latestPlan) {
      setIsGenerating(true);
      setError(null);
      try {
        await api.post(`/api/plans/${detail.latestPlan.id}/regenerate`);
        router.push(
          `/students/${params.id}/plan?planId=${detail.latestPlan.id}`,
        );
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't regenerate the plan. Please try again.",
        );
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    setPendingExam(primaryExam);
    setShowBufferChoice(true);
  }

  async function handleBufferChoice(useBufferWeek: boolean) {
    if (!pendingExam) return;
    setShowBufferChoice(false);
    setIsGenerating(true);
    setError(null);
    try {
      const { plan } = await api.post<{ plan: { id: string } }>(
        '/api/plans/generate',
        {
          studentId: params.id,
          examId: pendingExam.id,
          useBufferWeek,
        },
      );
      router.push(`/students/${params.id}/plan?planId=${plan.id}`);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't generate a plan. Please try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  const hasPlan = !!detail?.latestPlan;
  const primaryExam =
    detail?.exams.find((e) => e.id === detail?.currentExamId) ?? null;
  const examHasPassed = primaryExam
    ? new Date(primaryExam.examDate).getTime() < Date.now()
    : false;
  // No active exam: none set up yet, or the last one is over.
  const canStartSession = !primaryExam || examHasPassed;

  const menuItems = [
    { href: '/dashboard', label: '← Back to dashboard' },
    { href: `/students/${params.id}/add-test-marks`, label: 'Log a test' },
    { href: `/students/${params.id}/subjects`, label: 'Subjects & topics' },
    { href: `/students/${params.id}/tests`, label: 'Test history' },
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

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <Link
            href="/dashboard"
            className="text-base font-semibold text-indigo-700 sm:text-lg"
          >
            StudyPlan Analyzer
          </Link>

          {/* Laptop and up */}
          <Link
            href="/dashboard"
            className="hidden text-sm text-slate-500 hover:text-slate-800 lg:block"
          >
            ← Back to dashboard
          </Link>

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
            {menuItems.map((item) => (
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

      <main className="mx-auto max-w-5xl px-6 py-10">
        {!analysis && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {analysis && (
          <>
            {examHasPassed && primaryExam && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-800">
                  <span className="font-medium">{primaryExam.name}</span> was on{' '}
                  {new Date(primaryExam.examDate).toLocaleDateString()} —
                  that&apos;s already passed, so its study plan has been
                  cleared. Start the next exam cycle, or a new academic session,
                  to get a new plan.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/students/${params.id}/new-exam`}>
                    <Button size="sm">Start new exam cycle</Button>
                  </Link>
                  <Link href={`/students/${params.id}/new-session`}>
                    <Button size="sm" variant="secondary">
                      Start a new academic session with no previous exams
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {analysis.student.name}&apos;s performance
                </h1>
                <p className="text-sm text-slate-500">
                  Grade {analysis.student.grade}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* Laptop and up only; phones/tablets use the hamburger menu */}
                <div className="hidden flex-wrap items-center gap-3 lg:flex">
                  <Link href={`/students/${params.id}/add-test-marks`}>
                    <Button variant="ghost">Log a test</Button>
                  </Link>
                  <Link href={`/students/${params.id}/subjects`}>
                    <Button variant="ghost">Subjects &amp; topics</Button>
                  </Link>
                  <Link href={`/students/${params.id}/tests`}>
                    <Button variant="ghost">Test history</Button>
                  </Link>
                  <Link href={`/students/${params.id}/new-exam`}>
                    <Button variant="ghost">Start new exam cycle</Button>
                  </Link>
                  {canStartSession && (
                    <Link href={`/students/${params.id}/new-session`}>
                      <Button variant="ghost">
                        Start a new academic session with no previous exams
                      </Button>
                    </Link>
                  )}
                </div>

                {hasPlan && detail?.latestPlan && (
                  <Link
                    href={`/students/${params.id}/plan?planId=${detail.latestPlan.id}`}
                  >
                    <Button variant="secondary">View current plan</Button>
                  </Link>
                )}
                {!examHasPassed && (
                  <Button onClick={handleGeneratePlan} isLoading={isGenerating}>
                    {hasPlan ? 'Regenerate plan' : 'Generate plan'}
                  </Button>
                )}
              </div>
            </div>

            <Card className="mb-6">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <p className="text-sm text-slate-500">Overall average</p>
                  <p className="text-3xl font-semibold text-slate-900">
                    {analysis.overallAveragePercent !== null
                      ? `${analysis.overallAveragePercent}%`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-slate-500">Assessments recorded</p>
                  <p className="text-3xl font-semibold text-slate-900">
                    {analysis.assessmentsCount}
                  </p>
                </div>
              </div>
            </Card>

            <DailyChallengeStatsCard studentId={params.id} />

            {analysis.subjects.length === 0 ? (
              <EmptyState
                title="No subjects yet"
                description="Add subjects and marks to see a performance breakdown."
              />
            ) : (
              <div className="mb-8 grid gap-4 sm:grid-cols-2">
                {analysis.subjects.map((s) => (
                  <Card
                    key={s.subjectId}
                    className="cursor-pointer transition hover:-translate-y-0.5 hover:shadow-md"
                    onClick={() => setSelectedSubject(s)}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">
                          {s.name}
                        </h3>
                        <p className="text-xs uppercase tracking-wide text-slate-400">
                          {s.examWeight} exam weight
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {s.isEstimated && (
                          <span className="text-xs text-slate-400">
                            Estimated
                          </span>
                        )}
                        <Badge tone={strengthTone[s.strength]}>
                          {s.latestPercent !== null
                            ? `${s.latestPercent}%`
                            : 'No marks'}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">
                      {trendLabel[s.trend]}
                    </p>
                    {s.latestConfidence === 'low' && (
                      <p className="mt-1 text-xs font-medium text-amber-600">
                        ⚠ Marked low confidence — treated as a priority topic
                        even though the score looks strong
                      </p>
                    )}
                    {s.topics.length > 0 && (
                      <div className="mt-3">
                        <p className="mb-1 text-xs font-medium text-slate-500">
                          Priority topics
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {s.topics.slice(0, 4).map((t) => (
                            <span
                              key={t.id}
                              className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                            >
                              {t.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    <p className="mt-3 text-xs font-medium text-indigo-600">
                      View full analysis →
                    </p>
                  </Card>
                ))}
              </div>
            )}

            {analysis.topPriorityTopics.length > 0 && (
              <Card>
                <h3 className="mb-3 text-base font-semibold text-slate-900">
                  Top 3 topics to focus on
                </h3>
                <ol className="flex flex-col gap-2">
                  {analysis.topPriorityTopics.map((t, i) => (
                    <li key={t.id} className="flex items-center gap-3 text-sm">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs font-semibold text-indigo-700">
                        {i + 1}
                      </span>
                      <span className="font-medium text-slate-800">
                        {t.name}
                      </span>
                      <span className="text-slate-400">· {t.subjectName}</span>
                    </li>
                  ))}
                </ol>
              </Card>
            )}
          </>
        )}
      </main>

      {selectedSubject && (
        <SubjectDetailModal
          subject={selectedSubject}
          onClose={() => setSelectedSubject(null)}
        />
      )}

      {showBufferChoice && pendingExam && (
        <BufferWeekChoiceModal
          examDateLabel={new Date(pendingExam.examDate).toLocaleDateString()}
          minimumRunwayOk={
            Math.ceil(
              (new Date(pendingExam.examDate).getTime() - Date.now()) /
                (1000 * 60 * 60 * 24),
            ) > 7
          }
          onChoose={handleBufferChoice}
          onCancel={() => setShowBufferChoice(false)}
        />
      )}
    </div>
  );
}
