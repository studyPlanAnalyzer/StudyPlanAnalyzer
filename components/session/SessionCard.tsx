'use client';

import { useState } from 'react';
import clsx from 'clsx';

import { buttonClass } from '@/components/ui/Button';
import { Tag } from '@/components/ui/Tag';

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

// Card colour by session type (planned sessions only).
const typeColors: Record<SessionItem['sessionType'], string> = {
  learn: 'bg-[#a8acf0]',
  practice: 'bg-[#F7CC46]',
  review: 'bg-[#EDB1AA]',
  mock: 'bg-[#8fd3f4]',
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
        'rounded-[32px] p-6 sm:p-8',
        isDone
          ? 'bg-[#a4e5c7]'
          : isSkipped
            ? 'bg-[#F0EFED] opacity-70'
            : typeColors[session.sessionType],
      )}
    >
      {/* TOP ROW: type, free choice, duration */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Tag className="px-5 py-2">{session.sessionType}</Tag>

          {session.isFiller && (
            <Tag tone="white" className="px-5 py-2">Free Choice</Tag>
          )}
        </div>

        <span className="whitespace-nowrap rounded-full bg-white/60 px-4 py-2 text-sm font-bold text-black">
          {session.durationMinutes} min
        </span>
      </div>

      {/* TITLE */}
      <h3 className="mt-5 text-2xl font-extrabold tracking-tight sm:text-3xl">
        {session.topicName ?? session.subjectName ?? 'Study session'}
      </h3>

      {session.subjectName && session.topicName && (
        <p className="mt-1 text-sm font-semibold text-black/60 sm:text-base">
          {session.subjectName}
        </p>
      )}

      {session.isFiller && !isDone && !isSkipped && (
        <p className="mt-3 text-sm leading-6 text-black/70">
          Flexible session: study this topic or any other topic you like, then
          log what you studied.
        </p>
      )}

      <p className="mt-3 text-sm leading-6 text-black/80 sm:text-base">
        {sessionInstructions[session.sessionType]}
      </p>

      {/* STATUS */}
      {isDone && (
        <p className="mt-5 inline-flex rounded-full bg-white/70 px-5 py-2.5 text-sm font-bold text-black">
          ✓ {session.status === 'completed' ? 'Completed' : 'Partly completed'}
          {session.rating
            ? ` · rated ${RATINGS.find((r) => r.value === session.rating)?.label}`
            : ''}
        </p>
      )}
      {isSkipped && (
        <p className="mt-5 inline-flex rounded-full bg-white/70 px-5 py-2.5 text-sm font-bold text-black/70">
          Skipped
        </p>
      )}

      {/* RATING + ACTIONS */}
      {!isDone && !isSkipped && (
        <div className="mt-6 rounded-[26px] bg-white/60 p-5 sm:p-6">
          <p className="mb-3 text-sm font-bold uppercase tracking-wide text-black">
            How did it go?
          </p>

          <div className="flex flex-wrap gap-2">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRating(r.value)}
                aria-pressed={rating === r.value}
                className={clsx(
                  'inline-flex h-11 items-center rounded-full px-5 text-sm font-semibold transition-all duration-200 active:scale-95',
                  r.tone,
                  rating === r.value && 'ring-2 ring-black ring-offset-2',
                )}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={handleComplete}
              disabled={rating === null || isSaving}
              className={buttonClass('primary', 'lg')}
            >
              {isSaving ? 'Saving…' : 'Mark completed'}
            </button>

            <button
              type="button"
              onClick={() => onSkip()}
              className={buttonClass('white', 'lg')}
            >
              Skip
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
