"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { api, ApiError } from "@/lib/api-client";
import type { PlanWeek } from "@/components/plan/WeeklyPlanView";

interface StudentDetail {
  latestPlan: { id: string } | null;
}

interface PlanResponse {
  plan: { id: string };
  weeks: PlanWeek[];
}

export default function WeekSummaryPage({ params }: { params: { id: string; weekNumber: string } }) {
  const router = useRouter();
  const weekNumber = Number(params.weekNumber);
  const [planId, setPlanId] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<PlanWeek[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRegenerating, setIsRegenerating] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const detail = await api.get<StudentDetail>(`/api/students/${params.id}`);
        if (!detail.latestPlan) {
          setWeeks([]);
          return;
        }
        setPlanId(detail.latestPlan.id);
        const plan = await api.get<PlanResponse>(`/api/plans/${detail.latestPlan.id}`);
        setWeeks(plan.weeks);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.push("/login");
          return;
        }
        setError("Couldn't load the weekly summary. Please try refreshing.");
      }
    }
    load();
  }, [params.id, router]);

  async function handleRegenerate() {
    if (!planId) return;
    setIsRegenerating(true);
    setError(null);
    try {
      await api.post(`/api/plans/${planId}/regenerate`);
      router.push(`/students/${params.id}/plan?planId=${planId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't regenerate the plan.");
    } finally {
      setIsRegenerating(false);
    }
  }

  const currentWeek = weeks?.find((w) => w.weekNumber === weekNumber) ?? null;
  const nextWeek = weeks?.find((w) => w.weekNumber === weekNumber + 1) ?? null;

  const allSessions = currentWeek?.days.flatMap((d) => d.sessions) ?? [];
  const completed = allSessions.filter((s) => s.status === "completed" || s.status === "partly_completed");
  const skipped = allSessions.filter((s) => s.status === "skipped");
  const planned = allSessions.filter((s) => s.status === "planned");

  const subjectGroups = new Map<string, { total: number; done: number }>();
  for (const s of allSessions) {
    const key = s.subjectName ?? "General";
    const entry = subjectGroups.get(key) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (s.status === "completed" || s.status === "partly_completed") entry.done += 1;
    subjectGroups.set(key, entry);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/dashboard" className="text-lg font-semibold text-indigo-700">
            StudyPlan Analyzer
          </Link>
          <Link href={`/students/${params.id}/plan`} className="text-sm text-slate-500 hover:text-slate-800">
            Back to full plan
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold text-slate-900">Week {weekNumber} summary</h1>
          <Button onClick={handleRegenerate} isLoading={isRegenerating} variant="secondary">
            Regenerate plan
          </Button>
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {weeks === null && (
          <div className="flex flex-col gap-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {weeks !== null && !currentWeek && (
          <EmptyState
            title="No data for this week"
            description="This week isn't part of the current plan. It may already be over or the plan may have been regenerated."
            action={
              <Link href={`/students/${params.id}/plan`}>
                <Button variant="secondary">View full plan</Button>
              </Link>
            }
          />
        )}

        {currentWeek && (
          <>
            <Card className="mb-6">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-semibold text-green-600">{completed.length}</p>
                  <p className="text-xs text-slate-500">Completed</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-amber-600">{planned.length}</p>
                  <p className="text-xs text-slate-500">Still planned</p>
                </div>
                <div>
                  <p className="text-2xl font-semibold text-red-500">{skipped.length}</p>
                  <p className="text-xs text-slate-500">Skipped</p>
                </div>
              </div>
            </Card>

            <Card className="mb-6">
              <h3 className="mb-3 text-base font-semibold text-slate-900">Subject-wise progress</h3>
              <div className="flex flex-col gap-3">
                {Array.from(subjectGroups.entries()).map(([subject, stat]) => (
                  <div key={subject}>
                    <div className="mb-1 flex justify-between text-sm">
                      <span className="font-medium text-slate-700">{subject}</span>
                      <span className="text-slate-500">
                        {stat.done}/{stat.total} sessions
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-indigo-500"
                        style={{ width: `${stat.total ? (stat.done / stat.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">Next week preview</h3>
                {nextWeek && (
                  <Link
                    href={`/students/${params.id}/week/${weekNumber + 1}`}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
                  >
                    View week {weekNumber + 1} →
                  </Link>
                )}
              </div>
              {nextWeek ? (
                <div className="flex flex-wrap gap-1.5">
                  <Badge tone="brand">
                    {nextWeek.days.reduce((sum, d) => sum + d.sessions.length, 0)} sessions planned
                  </Badge>
                  {Array.from(
                    new Set(
                      nextWeek.days.flatMap((d) => d.sessions.map((s) => s.subjectName).filter(Boolean))
                    )
                  ).map((subj) => (
                    <Badge key={subj as string} tone="neutral">
                      {subj}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500">This is the final week of the current plan.</p>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
