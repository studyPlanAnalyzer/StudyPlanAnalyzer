'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import clsx from 'clsx';
import { Badge } from '@/components/ui/Badge';
import { Notice } from '@/components/ui/Notice';
import { buttonClass } from '@/components/ui/Button';
import { formatDay, todayKey } from '@/lib/utils/date-utils';

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

const statusTone: Record<PlanSession['status'], string> = {
  planned: 'bg-[#efeeec] text-[#666]',
  completed: 'bg-[#a4e5c7] text-[#145c3d]',
  partly_completed: 'bg-[#fce8b0] text-[#8a5b00]',
  skipped: 'bg-[#fee2e2] text-[#b42318]',
};

/**
 * The status badge. An optional session nobody did isn't a missed one, so it
 * reads a neutral "Not done", not a red "Skipped". That includes one still
 * "planned" on a past day: only the next rebuild marks those.
 */
export function sessionBadge(
  s: Pick<PlanSession, 'status' | 'isFiller'>,
  date: string,
  today: string,
) {
  const notDone =
    s.isFiller &&
    (s.status === 'skipped' || (s.status === 'planned' && date < today));
  return notDone
    ? { label: 'Not done', className: statusTone.planned }
    : { label: statusLabel[s.status], className: statusTone[s.status] };
}

function formatDate(dateStr: string) {
  return formatDay(
    dateStr,
    { weekday: 'long', month: 'short', day: 'numeric' },
    'en-US',
  );
}

export function WeeklyPlanView({ weeks }: { weeks: PlanWeek[] }) {
  const [activeWeek, setActiveWeek] = useState(weeks[0]?.weekNumber ?? 1);
  const current = weeks.find((w) => w.weekNumber === activeWeek) ?? weeks[0];
  const studentId = useParams<{ id: string }>()?.id;
  const today = todayKey();

  if (!weeks.length) return null;

  const hasOptional = current.days.some((d) => d.sessions.some((s) => s.isFiller));

  return (
    <div className="w-full">
      {/* Week navigation */}
      <div className="mb-7 flex flex-wrap items-center gap-2">
        {weeks.map((w) => (
          <button
            key={w.weekNumber}
            onClick={() => setActiveWeek(w.weekNumber)}
            className={clsx(
              'rounded-full px-6 py-3 text-sm font-semibold transition-all duration-200',
              w.weekNumber === activeWeek
                ? 'bg-black text-white'
                : 'bg-[#efeeec] text-black hover:bg-[#e4e2df]',
            )}
          >
            Week {w.weekNumber}
          </button>
        ))}
      </div>

      {hasOptional && (
        <Notice tone="info" className="mb-5">
          <strong>Optional sessions</strong> fill spare time. No rating is
          needed, and your child can study any subject they choose instead.
          They aren&apos;t part of the review schedule, so they won&apos;t change
          when topics come back for review. Required sessions may take their
          place as review dates get closer.
        </Notice>
      )}

      {/* Weekly sessions */}
      {current && (
        <div className="flex flex-col gap-5">
          {current.days.map((day) => (
            <div
              key={day.date}
              className="min-w-0 rounded-[24px] bg-[#f8f7f5] p-4 sm:p-5"
            >
              {/* Day heading */}
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-base font-bold text-black sm:text-lg">
                  {formatDate(day.date)}
                </h4>

                <span className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-[#666]">
                  {day.totalMinutes} min planned
                </span>
              </div>

              {/* Sessions */}
              <ul className="flex min-w-0 flex-col gap-3">
                {day.sessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:p-4"
                  >
                    {/* Session information */}
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-2">
                      <Badge tone={sessionTypeTone[s.sessionType]}>
                        {s.sessionType}
                      </Badge>

                      <span className="min-w-0 break-words text-base font-semibold text-black">
                        {s.topicName ?? s.subjectName ?? 'Session'}
                      </span>

                      {s.isFiller && <Badge tone="neutral">Optional</Badge>}

                      {s.subjectName && s.topicName && (
                        <span className="min-w-0 break-words text-sm text-[#888]">
                          · {s.subjectName}
                        </span>
                      )}
                    </div>

                    {/* Session actions and status */}
                    <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-[#555]">
                      {day.date === today &&
                        s.status === 'planned' &&
                        studentId && (
                          <Link
                            href={`/students/${studentId}/today`}
                            className={buttonClass('yellow')}
                          >
                            {s.isFiller
                              ? "Open today's session"
                              : "Rate today's session"}
                          </Link>
                        )}

                      <span className="whitespace-nowrap rounded-full bg-[#f5f4f2] px-3 py-2 text-sm">
                        {s.durationMinutes} min
                      </span>

                      <span
                        className={clsx(
                          'whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold',
                          sessionBadge(s, day.date, today).className,
                        )}
                      >
                        {sessionBadge(s, day.date, today).label}
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
