'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api-client';

interface Stats {
  last7Days: { completed: number; averageScore: number };
  last30Days: { completed: number; averageScore: number };
}

export function DailyChallengeStatsCard({ studentId }: { studentId: string }) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    api
      .get<Stats>(`/api/students/${studentId}/daily-challenge/stats`)
      .then(setStats)
      .catch(() => setStats(null));
  }, [studentId]);

  if (!stats) return null;

  return (
    <Card className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">
          Daily Brain Challenge
        </h3>
        <Link
          href={`/students/${studentId}/daily-challenge`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Play today&apos;s →
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">Last 7 days</p>
          <p className="text-lg font-semibold text-slate-900">
            {stats.last7Days.completed} completed
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Avg. score (7d)</p>
          <p className="text-lg font-semibold text-slate-900">
            {stats.last7Days.averageScore.toFixed(1)}/5
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Last 30 days</p>
          <p className="text-lg font-semibold text-slate-900">
            {stats.last30Days.completed} completed
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Avg. score (30d)</p>
          <p className="text-lg font-semibold text-slate-900">
            {stats.last30Days.averageScore.toFixed(1)}/5
          </p>
        </div>
      </div>
    </Card>
  );
}
