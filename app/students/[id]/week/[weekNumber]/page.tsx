"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { AppHeader, BackLink } from "@/components/ui/AppHeader";
import { ButtonLink } from "@/components/ui/Button";
import { cardClass } from "@/components/ui/Card";
import { Notice } from "@/components/ui/Notice";
import { PageMain, PageShell } from "@/components/ui/PageShell";
import { PageTitle } from "@/components/ui/PageTitle";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonCard } from "@/components/ui/Skeleton";
import { api, ApiError } from "@/lib/api-client";
import type { PlanWeek } from "@/components/plan/types";

interface StudentDetail {
  latestPlan: { id: string } | null;
}

interface PlanResponse {
  plan: { id: string };
  weeks: PlanWeek[];
}

export default function WeekSummaryPage(props: { params: Promise<{ id: string; weekNumber: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const weekNumber = Number(params.weekNumber);
  const [weeks, setWeeks] = useState<PlanWeek[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const detail = await api.get<StudentDetail>(`/api/students/${params.id}`);
        if (!detail.latestPlan) {
          setWeeks([]);
          return;
        }
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
    <PageShell className="pb-10">
      <AppHeader>
        <BackLink href={`/students/${params.id}/plan`} label="Back to full plan" short="Back" />
      </AppHeader>

      <PageMain>
        <section className="mb-8 flex flex-col gap-5 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 flex-1">
            <PageTitle>Week {weekNumber} summary</PageTitle>
          </div>
        </section>

        {error && <Notice className="mb-6">{error}</Notice>}

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
              <ButtonLink href={`/students/${params.id}/plan`} variant="secondary">
                View full plan
              </ButtonLink>
            }
          />
        )}

        {currentWeek && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-3 gap-3 text-center sm:gap-5">
              {[
                { label: 'Completed', value: completed.length, colour: 'bg-[#a4e5c7]' },
                { label: 'Still planned', value: planned.length, colour: 'bg-[#F7CC46]' },
                { label: 'Skipped', value: skipped.length, colour: 'bg-[#EDB1AA]' },
              ].map((t) => (
                <div key={t.label} className={`rounded-[25px] px-2 py-5 sm:p-6 ${t.colour}`}>
                  <p className="text-3xl font-extrabold tracking-tight sm:text-4xl">{t.value}</p>
                  <p className="mt-1 text-sm font-semibold text-black/70">{t.label}</p>
                </div>
              ))}
            </div>

            <section className={`${cardClass} p-6 sm:p-8`}>
              <h3 className="mb-5 text-xl font-extrabold tracking-tight sm:text-2xl">Subject-wise progress</h3>
              <div className="flex flex-col gap-4">
                {Array.from(subjectGroups.entries()).map(([subject, stat]) => (
                  <div key={subject}>
                    <div className="mb-2 flex justify-between gap-3 text-sm sm:text-base">
                      <span className="font-semibold text-black">{subject}</span>
                      <span className="text-[#65615D]">
                        {stat.done}/{stat.total} sessions
                      </span>
                    </div>
                    <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#F0EFED]">
                      <div
                        className="h-full rounded-full bg-black"
                        style={{ width: `${stat.total ? (stat.done / stat.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className={`${cardClass} p-6 sm:p-8`}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xl font-extrabold tracking-tight sm:text-2xl">Next week preview</h3>
                {nextWeek && (
                  <ButtonLink href={`/students/${params.id}/week/${weekNumber + 1}`} variant="secondary">
                    View week {weekNumber + 1} →
                  </ButtonLink>
                )}
              </div>
              {nextWeek ? (
                <div className="flex flex-wrap gap-2">
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
                <p className="text-sm text-[#65615D] sm:text-base">This is the final week of the current plan.</p>
              )}
            </section>
          </div>
        )}
      </PageMain>
    </PageShell>
  );
}
