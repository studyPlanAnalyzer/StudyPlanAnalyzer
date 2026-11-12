'use client';

import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import { api, ApiError } from '@/lib/api-client';
import { Notice } from '@/components/ui/Notice';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatDay, todayKey } from '@/lib/utils/date-utils';
import { agoText, type EarlierTopic, type RevisionHeading } from '@/lib/utils/revision';
import type { RevisionState } from '@/lib/revision';

// Revising topics from earlier exams (lib/utils/revision.ts). Shown on the
// Today screen on revision days, and on its own page any day.

const HEADING: Record<RevisionHeading, { title: string; note: string }> = {
  final: {
    title: 'Final look before the exam',
    note: 'Everything from earlier exams, the one studied longest ago first, so each gets a last look.',
  },
  hard: { title: 'Rated hard', note: 'Felt hard last time. Start here.' },
  needs: {
    title: 'Needs it most',
    note: 'Not revised for this exam yet, and the most likely to be weak: rated hard before, marked not sure, low test marks, or a hard topic.',
  },
  anotherLook: {
    title: 'Time for another look',
    note: 'Revised more than 4 weeks ago. Worth a quick check.',
  },
  notYet: {
    title: 'Not yet revised for this exam',
    note: 'The ones that need it most are on top.',
  },
  known: {
    title: 'Known well, not revised yet',
    note: 'Marked know it well, or always easy so far. A quick check is enough.',
  },
  revised: { title: 'Revised for this exam', note: 'Done recently. They come back after 4 weeks.' },
  easy: { title: 'What you found easy', note: 'Felt easy. They come back after 4 weeks.' },
  back: {
    title: 'Back on your daily list',
    note: "Rated Again: it's on the daily list until the exam, so it gets reviewed properly.",
  },
};

const RATINGS: { value: 1 | 2 | 3 | 4; label: string; tone: string }[] = [
  { value: 1, label: 'Again', tone: 'bg-red-100 text-red-700 hover:bg-red-200' },
  { value: 2, label: 'Hard', tone: 'bg-orange-100 text-orange-700 hover:bg-orange-200' },
  { value: 3, label: 'Good', tone: 'bg-green-100 text-green-700 hover:bg-green-200' },
  { value: 4, label: 'Easy', tone: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' },
];

function statusText(heading: RevisionHeading, t: EarlierTopic, today: string): string {
  const latest = t.latest ? agoText(t.latest.on, today) : null;
  switch (heading) {
    case 'final':
      return t.lastStudied ? `Last studied ${agoText(t.lastStudied, today)}` : 'Not studied yet';
    case 'hard':
      return `Rated hard ${latest}`;
    case 'anotherLook':
      return `Last revised ${latest}`;
    case 'notYet':
      return t.lastStudied ? `Last studied ${agoText(t.lastStudied, today)}` : 'Not studied yet';
    case 'needs':
    case 'known':
      return `${t.standingReason} · ${t.lastStudied ? `last studied ${agoText(t.lastStudied, today)}` : 'not studied yet'}`;
    case 'revised':
      return `Revised ${latest}`;
    case 'easy':
      return `Marked easy ${latest}`;
    case 'back':
      return 'On the daily list';
  }
}

function TopicRow({
  topic,
  heading,
  today,
  onRate,
}: {
  topic: EarlierTopic;
  heading: RevisionHeading;
  today: string;
  onRate: (topicId: string, rating: 1 | 2 | 3 | 4) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  return (
    <li className="rounded-2xl bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words text-base font-semibold text-black">{topic.name}</p>
          <p className="mt-0.5 text-sm text-[#65615D]">
            {topic.subjectName}
            {topic.examName ? ` · ${topic.examName}` : ''} · {statusText(heading, topic, today)}
          </p>
        </div>
        {heading !== 'back' && !open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-10 items-center rounded-full bg-black px-4 text-sm font-semibold text-white transition hover:bg-black/80"
          >
            I revised this
          </button>
        )}
      </div>
      {open && (
        <div className="mt-3">
          <p className="mb-2 text-sm font-bold">How did it go?</p>
          <div className="flex flex-wrap gap-2">
            {RATINGS.map((r) => (
              <button
                key={r.value}
                type="button"
                disabled={saving}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await onRate(topic.id, r.value);
                  } finally {
                    setSaving(false);
                  }
                }}
                className={clsx('inline-flex h-10 items-center rounded-full px-4 text-sm font-semibold', r.tone)}
              >
                {r.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-10 items-center rounded-full bg-[#F0EFED] px-4 text-sm font-semibold text-black"
            >
              Cancel
            </button>
          </div>
          <p className="mt-2 text-sm text-[#65615D]">
            Again puts it back on the daily list until the exam. Hard keeps it at the top here.
          </p>
        </div>
      )}
    </li>
  );
}

export function RevisionPanel({ studentId, weekendNote = false }: { studentId: string; weekendNote?: boolean }) {
  const [data, setData] = useState<RevisionState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [openHeadings, setOpenHeadings] = useState<Set<RevisionHeading> | null>(null);
  const today = todayKey();

  const load = useCallback(async () => {
    try {
      setData(await api.get<RevisionState>(`/api/students/${studentId}/revision`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't load the revision list. Please try refreshing.");
    }
  }, [studentId]);

  useEffect(() => {
    load();
  }, [load]);

  // The first two headings start open, the rest collapsed.
  useEffect(() => {
    if (data?.state === 'active' && openHeadings === null)
      setOpenHeadings(new Set(data.headings.filter((h) => h.heading !== 'back').slice(0, 2).map((h) => h.heading)));
  }, [data, openHeadings]);

  async function rate(topicId: string, rating: 1 | 2 | 3 | 4) {
    setError(null);
    try {
      const res = await api.post<{ backOnDailyList: boolean; revision: RevisionState }>(
        `/api/students/${studentId}/revision`,
        { topicId, rating },
      );
      setData(res.revision);
      setMessage(
        res.backOnDailyList
          ? "Saved. It's back on the daily list from the next school day."
          : 'Saved.',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that. Please try again.");
    }
  }

  if (error && !data) return <Notice>{error}</Notice>;
  if (!data) return <SkeletonCard />;

  if (data.state === 'noExam')
    return (
      <Notice tone="neutral">There is no upcoming exam yet, so there is nothing to revise for.</Notice>
    );
  if (data.state === 'noEarlierTopics')
    return (
      <Notice tone="neutral">
        Nothing from earlier exams yet. After {data.examName}, its topics come here for revision on
        Saturdays (and Sundays), while the next exam&apos;s topics follow the daily list.
      </Notice>
    );
  if (data.state === 'stopped')
    return (
      <Notice tone="neutral">
        The week before {data.examName} ({formatDay(data.examDate)}) is a free week: no study list and
        no revision suggestions. You can change this in Settings (buffer week).
      </Notice>
    );

  const total = data.headings.reduce((n, h) => n + (h.heading === 'back' ? 0 : h.topics.length), 0);
  return (
    <div className="flex flex-col gap-4">
      {weekendNote && (
        <Notice tone="info">
          Weekends have more time, so they&apos;re for revising what you studied for earlier exams.
          Pick anything you like; the ones on top need it most. Mark what you revised and how it went.
        </Notice>
      )}
      {data.finalLook && (
        <Notice tone="warning">
          {data.examName} is close: give every earlier topic a final look, starting from the top.
        </Notice>
      )}
      {message && (
        <Notice tone="neutral" role="status">
          {message}
        </Notice>
      )}
      {error && <Notice>{error}</Notice>}
      <p className="text-sm font-semibold text-[#65615D]">
        {total} topic{total === 1 ? '' : 's'} from earlier exams
      </p>
      {data.headings.map(({ heading, topics }) => {
        const isOpen = openHeadings?.has(heading) ?? false;
        return (
          <section key={heading} className="rounded-[24px] bg-[#f8f7f5] p-4 sm:p-5">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() =>
                setOpenHeadings((prev) => {
                  const next = new Set(prev ?? []);
                  if (next.has(heading)) next.delete(heading);
                  else next.add(heading);
                  return next;
                })
              }
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span>
                <span className="block text-lg font-extrabold tracking-tight">
                  {HEADING[heading].title} ({topics.length})
                </span>
                <span className="mt-0.5 block text-sm text-[#65615D]">{HEADING[heading].note}</span>
              </span>
              <span aria-hidden="true" className="text-xl">
                {isOpen ? '−' : '+'}
              </span>
            </button>
            {isOpen && (
              <ul className="mt-4 flex flex-col gap-2">
                {topics.map((t) => (
                  <TopicRow key={t.id} topic={t} heading={heading} today={today} onRate={rate} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
