'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { WeeklyPlanView, PlanWeek } from '@/components/plan/WeeklyPlanView';
import { api, ApiError } from '@/lib/api-client';
import { ExamOverNotice } from '@/components/exam/ExamOverNotice';

interface PlanResponse {
  plan: {
    id: string;
    totalDays: number;
    averageDailyMinutes: number;
    weakFocusPercent: number;
    mediumFocusPercent: number;
    strongFocusPercent: number;
  };
  exam: { name: string; examDate: string } | null;
  student: { id: string; name: string };
  weeks: PlanWeek[];
  unscheduledTopics: { id: string; name: string; subjectName: string }[];
}

interface StudentDetail {
  latestPlan: { id: string } | null;
  exams: { id: string; name: string; examDate: string }[];
  currentExamId: string | null;
  currentExamOver: boolean;
}

export default function PlanPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  // Set when there is no plan because the exam is over.
  const [overExam, setOverExam] = useState<{
    name: string;
    examDate: string;
  } | null>(null);

  useEffect(() => {
    // No plan to show: say why (exam over, or simply none yet).
    async function showNoPlan(known?: StudentDetail) {
      const detail =
        known ?? (await api.get<StudentDetail>(`/api/students/${params.id}`));
      const exam = detail.exams.find((e) => e.id === detail.currentExamId);
      if (detail.currentExamOver && exam) setOverExam(exam);
      setNotFound(true);
    }

    async function load() {
      try {
        let planId = searchParams.get('planId');
        let detail: StudentDetail | undefined;
        if (!planId) {
          detail = await api.get<StudentDetail>(`/api/students/${params.id}`);
          planId = detail.latestPlan?.id ?? null;
        }
        if (!planId) {
          await showNoPlan(detail);
          return;
        }
        // Days that were left unfinished are treated as missed and the plan is
        // rebuilt from today. A failure here shouldn't block the page. The
        // plan is fetched at the same time as the check, and fetched again
        // only if the check actually rebuilt it, so what is shown is the same
        // as before but the usual case takes one round trip less.
        const [catchUp, first] = await Promise.all([
          api
            .post<{ updated?: boolean }>(`/api/plans/${planId}/catch-up`)
            .catch(() => undefined),
          api.get<PlanResponse>(`/api/plans/${planId}`),
        ]);
        const plan = catchUp?.updated
          ? await api.get<PlanResponse>(`/api/plans/${planId}`)
          : first;
        setData(plan);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        // The plan was cleared because its exam is over (or it is gone).
        if (err instanceof ApiError && err.status === 404) {
          try {
            await showNoPlan();
            return;
          } catch {
            /* fall through to the error message */
          }
        }
        setError("Couldn't load the study plan. Please try refreshing.");
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold text-indigo-700"
          >
            StudyPlan Analyzer
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <Link
              href={`/students/${params.id}/analysis`}
              className="hover:text-slate-800"
            >
              Analysis
            </Link>
            <Link
              href={`/students/${params.id}/today`}
              className="hover:text-slate-800"
            >
              Today
            </Link>
            <Link
              href={`/students/${params.id}/daily-challenge`}
              className="hover:text-slate-800"
            >
              Daily Challenge
            </Link>
            <Link
              href={`/students/${params.id}/subjects`}
              className="hover:text-slate-800"
            >
              Subjects
            </Link>
            <Link
              href={`/students/${params.id}/tests`}
              className="hover:text-slate-800"
            >
              Test history
            </Link>
            <Link
              href={`/students/${params.id}/settings`}
              className="hover:text-slate-800"
            >
              Settings
            </Link>
            <Link
              href={`/students/${params.id}/add-test-marks`}
              className="hover:text-slate-800"
            >
              Log a test
            </Link>
            <Link
              href={`/students/${params.id}/new-exam`}
              className="hover:text-slate-800"
            >
              New exam
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {!data && !notFound && (
          <div className="flex flex-col gap-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {notFound && overExam && (
          <ExamOverNotice
            studentId={params.id}
            examName={overExam.name}
            examDate={overExam.examDate}
          />
        )}

        {notFound && !overExam && (
          <EmptyState
            title="No study plan yet"
            description="Generate a plan from the analysis page once marks and topics are in place."
            action={
              <Link href={`/students/${params.id}/analysis`}>
                <Button>Go to analysis</Button>
              </Link>
            }
          />
        )}

        {data && (
          <>
            <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {data.student.name}&apos;s study plan
                </h1>
                {data.exam && (
                  <p className="text-sm text-slate-500">
                    Until {data.exam.name} on{' '}
                    {new Date(data.exam.examDate).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Link href={`/students/${params.id}/today`}>
                  <Button>Start today&apos;s session</Button>
                </Link>
                <Link href={`/students/${params.id}/settings`}>
                  <Button variant="secondary">Adjust preferences</Button>
                </Link>
              </div>
            </div>

            <Card className="mb-8">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                <SummaryStat
                  label="Total days"
                  value={String(data.plan.totalDays)}
                />
                <SummaryStat
                  label="Avg. daily minutes"
                  value={`${data.plan.averageDailyMinutes} min`}
                />
                <SummaryStat
                  label="Weak focus"
                  value={`${data.plan.weakFocusPercent}%`}
                />
                <SummaryStat
                  label="Medium focus"
                  value={`${data.plan.mediumFocusPercent}%`}
                />
                <SummaryStat
                  label="Strong focus"
                  value={`${data.plan.strongFocusPercent}%`}
                />
              </div>
            </Card>

            <Card className="mb-8 border-indigo-200 bg-indigo-50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-indigo-900">
                  <span className="font-medium">
                    New subject or topic taught this week?
                  </span>{' '}
                  Add it to include it in your plan. The plan is rebuilt as soon
                  as you save.
                </p>
                <Link href={`/students/${params.id}/subjects`}>
                  <Button size="sm">Add topics or sub-topics</Button>
                </Link>
              </div>
            </Card>

            {data.unscheduledTopics.length > 0 && (
              <Card className="mb-8 border-amber-200 bg-amber-50">
                <p className="text-sm font-medium text-amber-800">
                  {data.unscheduledTopics.length} topic
                  {data.unscheduledTopics.length > 1 ? 's' : ''} couldn&apos;t
                  fit in this plan
                </p>
                <p className="mt-1 text-sm text-amber-700">
                  There wasn&apos;t enough time before the exam to schedule
                  these, given the current daily minutes and study days.
                  Consider increasing daily minutes in Settings, or moving the
                  exam date out if possible.
                </p>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {data.unscheduledTopics.map((t) => (
                    <li
                      key={t.id}
                      className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
                    >
                      {t.name}{' '}
                      <span className="text-amber-500">· {t.subjectName}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {data.weeks.length === 0 ? (
              <EmptyState
                title="No sessions scheduled"
                description="The plan didn't generate any sessions — try adding topics first, then regenerate."
              />
            ) : (
              <WeeklyPlanView weeks={data.weeks} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
