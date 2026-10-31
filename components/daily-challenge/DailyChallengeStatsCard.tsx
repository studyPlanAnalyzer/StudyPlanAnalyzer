'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
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
    <div className="h-full min-h-[410px] rounded-[28px] border-2 border-dashed border-[#B3B5D3] bg-[#DCDDF5] p-7 sm:p-8">
      {/* HEADER */}

      <div className="mb-8 flex items-center justify-between gap-3">
        <span className="rounded-full bg-black px-4 py-2 text-xs font-bold uppercase tracking-widest text-white sm:text-sm">
          Daily Brain Challenge
        </span>

        {/* Brain icon */}

        <svg
          className="h-7 w-7 shrink-0 text-black"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.3}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 20V5" />
          <path d="M12 8a3 3 0 0 0-5.8-1.1A3.5 3.5 0 0 0 5 13a3 3 0 0 0 2 5.5A3 3 0 0 0 12 20" />
          <path d="M12 8a3 3 0 0 1 5.8-1.1A3.5 3.5 0 0 1 19 13a3 3 0 0 1-2 5.5A3 3 0 0 1 12 20" />
          <path d="M8 11a2 2 0 0 1 2 2" />
          <path d="M16 11a2 2 0 0 0-2 2" />
          <path d="M9 16a2 2 0 0 1 2-2" />
          <path d="M15 16a2 2 0 0 0-2-2" />
        </svg>
      </div>

      {/* STATISTICS */}

      <div className="grid grid-cols-2 gap-x-4 gap-y-6">
        <div>
          <p className="text-3xl font-black leading-tight tracking-tight text-black sm:text-[30px]">
            {stats.last7Days.completed}
          </p>
          <p className="mt-1 text-sm font-medium text-black sm:text-base">
            Last 7 days
          </p>
        </div>

        <div>
          <p className="text-3xl font-black leading-tight tracking-tight text-black sm:text-[30px]">
            {stats.last7Days.averageScore.toFixed(1)}/5
          </p>
          <p className="mt-1 text-sm font-medium text-black sm:text-base">
            Avg. score (7d)
          </p>
        </div>

        <div>
          <p className="text-3xl font-black leading-tight tracking-tight text-black sm:text-[30px]">
            {stats.last30Days.completed}
          </p>
          <p className="mt-1 text-sm font-medium text-black sm:text-base">
            Last 30 days
          </p>
        </div>

        <div>
          <p className="text-3xl font-black leading-tight tracking-tight text-black sm:text-[30px]">
            {stats.last30Days.averageScore.toFixed(1)}/5
          </p>
          <p className="mt-1 text-sm font-medium text-black sm:text-base">
            Avg. score (30d)
          </p>
        </div>
      </div>

      {/* PLAY TODAY */}

      <div className="mt-7">
        <Link
          href={`/students/${studentId}/daily-challenge`}
          className="inline-flex items-center gap-4 rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-neutral-800 hover:shadow-md"
        >
          Play today's
          <svg
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 12h14m-6-6 6 6-6 6"
            />
          </svg>
        </Link>
      </div>
    </div>
  );
}
