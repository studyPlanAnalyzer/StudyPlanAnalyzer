"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";

interface Metrics {
  signups: { total: number; newThisWeek: number; newThisMonth: number };
  students: { total: number };
  activity: { dau: number; wau: number; mau: number };
  studyPlanEngagement: { sessionsScheduledLast7Days: number; sessionsCompletedLast7Days: number; completionRate: number };
  dailyBrainChallenge: { attemptsToday: number; attemptsThisWeek: number };
  billing: { tracked: boolean; note: string };
}

function MetricCard({ label, value, sublabel }: { label: string; value: string | number; sublabel?: string }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-slate-500">{sublabel}</p>}
    </Card>
  );
}

export default function AdminDashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/dashboard-metrics", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || "Failed to load metrics");
        return res.json();
      })
      .then(setMetrics)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Admin dashboard</h1>
      <p className="mb-8 text-sm text-slate-500">Business metrics across all parent accounts and students.</p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {!metrics && !error && <p className="text-sm text-slate-400">Loading…</p>}

      {metrics && (
        <div className="flex flex-col gap-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Signups</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard label="Total parent accounts" value={metrics.signups.total} />
              <MetricCard label="New this week" value={metrics.signups.newThisWeek} />
              <MetricCard label="New this month" value={metrics.signups.newThisMonth} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Activity</h2>
            <div className="grid gap-4 sm:grid-cols-4">
              <MetricCard label="DAU" value={metrics.activity.dau} sublabel="Logged in today" />
              <MetricCard label="WAU" value={metrics.activity.wau} sublabel="Logged in, last 7 days" />
              <MetricCard label="MAU" value={metrics.activity.mau} sublabel="Logged in, last 30 days" />
              <MetricCard label="Students added" value={metrics.students.total} sublabel="Total children profiles" />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Study plan engagement (last 7 days)</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <MetricCard label="Sessions scheduled" value={metrics.studyPlanEngagement.sessionsScheduledLast7Days} />
              <MetricCard label="Sessions completed" value={metrics.studyPlanEngagement.sessionsCompletedLast7Days} />
              <MetricCard label="Completion rate" value={`${metrics.studyPlanEngagement.completionRate}%`} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Daily Brain Challenge</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <MetricCard label="Attempts today" value={metrics.dailyBrainChallenge.attemptsToday} />
              <MetricCard label="Attempts this week" value={metrics.dailyBrainChallenge.attemptsThisWeek} />
            </div>
          </section>

          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Subscriptions &amp; revenue</h2>
            <Card className="border-amber-200 bg-amber-50">
              <p className="text-sm font-medium text-amber-800">Not yet tracked</p>
              <p className="mt-1 text-sm text-amber-700">{metrics.billing.note}</p>
            </Card>
          </section>
        </div>
      )}
    </main>
  );
}
