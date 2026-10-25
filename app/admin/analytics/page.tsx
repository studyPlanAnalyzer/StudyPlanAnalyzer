"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { api, ApiError } from "@/lib/api-client";
import { GRADE_GROUP_LABELS, GradeGroup } from "@/lib/utils/grade-group";

interface DayStat {
  date: string;
  gradeGroup: GradeGroup;
  attemptsCount: number;
  averageScore: number;
}

interface AnalyticsResponse {
  lookbackDays: number;
  totalStudentsInSystem: number;
  days: DayStat[];
}

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<AnalyticsResponse>("/api/admin/analytics")
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.message : "Couldn't load analytics."));
  }, []);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Daily Brain Challenge analytics</h1>
      <p className="mb-6 text-sm text-slate-500">Participation and average score by day, last {data?.lookbackDays ?? 30} days.</p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="text-sm text-slate-400">Loading…</p>}

      {data && data.days.length === 0 && (
        <EmptyState title="No quizzes published yet" description="Publish a daily quiz to start seeing participation data here." />
      )}

      {data && data.days.length > 0 && (
        <Card>
          <p className="mb-3 text-xs text-slate-400">{data.totalStudentsInSystem} students total in the system</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Grade group</th>
                  <th className="py-2 pr-4">Attempts</th>
                  <th className="py-2 pr-4">Avg. score</th>
                </tr>
              </thead>
              <tbody>
                {data.days.map((d) => (
                  <tr key={`${d.date}-${d.gradeGroup}`} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{d.date}</td>
                    <td className="py-2 pr-4">
                      <Badge tone="neutral">{GRADE_GROUP_LABELS[d.gradeGroup]}</Badge>
                    </td>
                    <td className="py-2 pr-4">{d.attemptsCount}</td>
                    <td className="py-2 pr-4">{d.averageScore.toFixed(1)} / 3</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </main>
  );
}
