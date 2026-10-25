'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

export interface SessionItem {
  id: string;
  topicName: string | null;
  subjectName: string | null;
  sessionType: 'learn' | 'practice' | 'review' | 'mock';
  durationMinutes: number;
  status: 'planned' | 'completed' | 'partly_completed' | 'skipped';
  rating: number | null;
  isFiller?: boolean;
}

const RATINGS: { value: 1 | 2 | 3 | 4; label: string; tone: string }[] = [
  {
    value: 1,
    label: 'Again',
    tone: 'bg-red-100 text-red-700 hover:bg-red-200',
  },
  {
    value: 2,
    label: 'Hard',
    tone: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
  },
  {
    value: 3,
    label: 'Good',
    tone: 'bg-green-100 text-green-700 hover:bg-green-200',
  },
  {
    value: 4,
    label: 'Easy',
    tone: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200',
  },
];

const sessionInstructions: Record<SessionItem['sessionType'], string> = {
  learn:
    'Read through the topic and work a few guided examples until it clicks.',
  practice: 'Work independent practice problems without looking at notes.',
  review: "Quickly revisit the topic and check what's still fresh vs. fuzzy.",
  mock: 'Simulate exam conditions — timed, no notes, then check answers.',
};

export function SessionCard({
  session,
  onComplete,
  onSkip,
}: {
  session: SessionItem;
  onComplete: (rating: number) => Promise<void> | void;
  onSkip: () => Promise<void> | void;
}) {
  const [rating, setRating] = useState<number | null>(session.rating);
  const [isSaving, setIsSaving] = useState(false);
  const isDone =
    session.status === 'completed' || session.status === 'partly_completed';
  const isSkipped = session.status === 'skipped';

  async function handleComplete() {
    if (rating === null) return;
    setIsSaving(true);
    try {
      await onComplete(rating);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div
      className={clsx(
        'rounded-xl border p-4',
        isDone
          ? 'border-green-200 bg-green-50'
          : isSkipped
            ? 'border-slate-200 bg-slate-50 opacity-70'
            : 'border-slate-200 bg-white',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <Badge tone="brand">{session.sessionType}</Badge>
            <h3 className="text-sm font-semibold text-slate-900">
              {session.topicName ?? session.subjectName ?? 'Study session'}
            </h3>
          </div>

          <Badge tone="brand">{session.sessionType}</Badge>
          {session.isFiller && <Badge tone="neutral">Free Choice</Badge>}

          {session.isFiller && !isDone && !isSkipped && (
            <p className="mt-1 text-xs text-slate-500">
              Flexible session: study this topic or any other topic you like,
              then log what you studied.
            </p>
          )}

          {session.subjectName && session.topicName && (
            <p className="text-xs text-slate-400">{session.subjectName}</p>
          )}
        </div>
        <span className="whitespace-nowrap text-xs text-slate-500">
          {session.durationMinutes} min
        </span>
      </div>

      <p className="mt-2 text-sm text-slate-600">
        {sessionInstructions[session.sessionType]}
      </p>

      {isDone && (
        <p className="mt-3 text-sm font-medium text-green-700">
          {session.status === 'completed' ? 'Completed' : 'Partly completed'}
          {session.rating
            ? ` · rated ${RATINGS.find((r) => r.value === session.rating)?.label}`
            : ''}
        </p>
      )}
      {isSkipped && (
        <p className="mt-3 text-sm font-medium text-slate-500">Skipped</p>
      )}

      {!isDone && !isSkipped && (
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-500">
              How did it go?
            </p>
            <div className="flex gap-2">
              {RATINGS.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRating(r.value)}
                  className={clsx(
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    r.tone,
                    rating === r.value && 'ring-2 ring-offset-1 ring-slate-400',
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleComplete}
              disabled={rating === null}
              isLoading={isSaving}
            >
              Mark completed
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onSkip()}>
              Skip
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
