'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Badge } from '@/components/ui/Badge';

export interface PlanSession {
  id: string;
  scheduledDate: string;
  durationMinutes: number;
  sessionType: 'learn' | 'practice' | 'review' | 'mock';
  status: 'planned' | 'completed' | 'partly_completed' | 'skipped';
  topicName: string | null;
  subjectName: string | null;
  isFiller?: boolean;
}

export interface PlanDay {
  date: string;
  totalMinutes: number;
  sessions: PlanSession[];
}

export interface PlanWeek {
  weekNumber: number;
  days: PlanDay[];
}

const sessionTypeTone: Record<
  PlanSession['sessionType'],
  'brand' | 'medium' | 'strong' | 'neutral'
> = {
  learn: 'brand',
  practice: 'medium',
  review: 'neutral',
  mock: 'strong',
};

const statusLabel: Record<PlanSession['status'], string> = {
  planned: 'Planned',
  completed: 'Completed',
  partly_completed: 'Partly done',
  skipped: 'Skipped',
};

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00Z').toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function WeeklyPlanView({ weeks }: { weeks: PlanWeek[] }) {
  const [activeWeek, setActiveWeek] = useState(weeks[0]?.weekNumber ?? 1);
  const current = weeks.find((w) => w.weekNumber === activeWeek) ?? weeks[0];

  if (!weeks.length) return null;

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-200 pb-2">
        {weeks.map((w) => (
          <button
            key={w.weekNumber}
            onClick={() => setActiveWeek(w.weekNumber)}
            className={clsx(
              'rounded-t-lg px-4 py-2 text-sm font-medium transition-colors',
              w.weekNumber === activeWeek
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
            )}
          >
            Week {w.weekNumber}
          </button>
        ))}
      </div>

      {current && (
        <div className="flex flex-col gap-4">
          {current.days.map((day) => (
            <div
              key={day.date}
              className="rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-slate-800">
                  {formatDate(day.date)}
                </h4>
                <span className="text-xs text-slate-500">
                  {day.totalMinutes} min planned
                </span>
              </div>
              <ul className="flex flex-col gap-2">
                {day.sessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm"
                  >
                    {/* flex-wrap lets the tags and subject drop to the next
                        line instead of overflowing the card on small screens */}
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <Badge tone={sessionTypeTone[s.sessionType]}>
                        {s.sessionType}
                      </Badge>
                      <span className="break-words font-medium text-slate-800">
                        {s.topicName ?? s.subjectName ?? 'Session'}
                      </span>
                      {s.isFiller && <Badge tone="neutral">Optional</Badge>}
                      {s.subjectName && s.topicName && (
                        <span className="break-words text-xs text-slate-400">
                          · {s.subjectName}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500">
                      <span>{s.durationMinutes} min</span>
                      <span
                        className={clsx(
                          'font-medium',
                          s.status === 'completed' && 'text-green-600',
                          s.status === 'partly_completed' && 'text-amber-600',
                          s.status === 'skipped' && 'text-red-500',
                        )}
                      >
                        {statusLabel[s.status]}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
