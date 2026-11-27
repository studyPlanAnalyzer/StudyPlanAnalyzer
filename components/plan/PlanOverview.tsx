import clsx from 'clsx';
import { Badge } from '@/components/ui/Badge';
import { TopicStatusBadge } from '@/components/ui/TopicStatusBadge';
import { formatDay } from '@/lib/utils/date-utils';
import { planStatusText, type PlanStatus } from '@/lib/utils/plan-status';

// The plan page, without a timetable: future days are a forecast once there
// is no minutes budget (every due topic is listed and ratings move them), so
// the page shows how this week has gone, the parent's status, and the topics
// coming up, not a fixed list per day.

export interface WeekDay {
  date: string;
  /** A revision day for earlier-exam topics (no SM-2 sessions). */
  revisionDay: boolean;
  when: 'past' | 'today' | 'ahead';
  /** Topics on that day's list, and how many were done. */
  listed: number;
  done: number;
  /** Earlier-exam topics revised that day. */
  revised: number;
}

export interface ComingUpTopic {
  topicId: string;
  topicName: string | null;
  subjectName: string | null;
  sessionType: 'learn' | 'practice' | 'review' | 'mock';
  topicMastered: boolean;
  topicStruggling: boolean;
}

/** What a day of "This week" says, and its colour. */
export function weekDayState(d: WeekDay): { label: string; tone: string } {
  if (d.revisionDay) {
    if (d.when === 'ahead') return { label: 'Revision day', tone: 'bg-[#EEF0FF] text-black/70' };
    if (d.revised > 0) return { label: `Revised ${d.revised}`, tone: 'bg-[#a8acf0] text-black' };
    return {
      label: d.when === 'today' ? 'Revision day' : 'Nothing revised',
      tone: 'bg-[#EEF0FF] text-black/70',
    };
  }
  if (d.when === 'ahead') return { label: 'Study day', tone: 'bg-[#F0EFED] text-black/70' };
  if (d.listed === 0) return { label: 'Nothing listed', tone: 'bg-white text-black/50' };
  if (d.done >= d.listed)
    return { label: `All ${d.listed} done`, tone: 'bg-[#a4e5c7] text-[#145c3d]' };
  if (d.when === 'today')
    return { label: `${d.done} of ${d.listed} so far`, tone: 'bg-[#F7CC46] text-black' };
  return { label: `${d.done} of ${d.listed} done`, tone: 'bg-[#F1B5AE]/60 text-[#7a2e26]' };
}

export function ThisWeek({ days }: { days: WeekDay[] }) {
  const past = days.filter((d) => d.when !== 'ahead');
  const listed = past.reduce((n, d) => n + d.listed, 0);
  const done = past.reduce((n, d) => n + d.done, 0);
  const revised = past.reduce((n, d) => n + d.revised, 0);
  return (
    <section aria-labelledby="this-week">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="this-week"
          className="text-2xl font-extrabold tracking-tight sm:text-3xl"
        >
          This week
        </h2>
        {(listed > 0 || revised > 0) && (
          <p className="text-sm font-semibold text-[#65615D]">
            {done} of {listed} topics done so far
            {revised > 0 ? ` · ${revised} earlier topic${revised === 1 ? '' : 's'} revised` : ''}
          </p>
        )}
      </div>

      <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {days.map((d) => {
          const state = weekDayState(d);
          return (
            <li
              key={d.date}
              className={clsx(
                'flex min-w-0 flex-col gap-2 rounded-[22px] bg-[#f8f7f5] p-4',
                d.when === 'today' && 'ring-2 ring-black',
              )}
            >
              <p className="text-sm font-bold text-black">
                {d.when === 'today'
                  ? 'Today'
                  : formatDay(
                      d.date,
                      { weekday: 'short', day: 'numeric' },
                      'en-US',
                    )}
              </p>
              <span
                className={clsx(
                  'w-fit rounded-full px-3 py-1 text-xs font-bold',
                  state.tone,
                )}
              >
                {state.label}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

const typeLabel = (t: ComingUpTopic) =>
  t.sessionType === 'learn'
    ? { label: 'New', tone: 'brand' as const }
    : t.topicMastered
      ? { label: 'Quick check', tone: 'strong' as const }
      : { label: 'Review', tone: 'neutral' as const };

export function ComingUp({
  topics,
  childName,
}: {
  topics: ComingUpTopic[];
  childName: string;
}) {
  return (
    <section aria-labelledby="coming-up">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2
          id="coming-up"
          className="text-2xl font-extrabold tracking-tight sm:text-3xl"
        >
          Coming up
        </h2>
        <p className="text-sm font-semibold text-[#65615D]">
          {topics.length} topic{topics.length === 1 ? '' : 's'} in the next 7
          days
        </p>
      </div>
      <p className="mb-5 max-w-3xl text-sm leading-6 text-[#65615D]">
        A forecast, not a timetable. Each topic comes back when it is due, and{' '}
        {childName}&apos;s ratings move it: Easy pushes it further out, Hard or
        Again brings it back sooner all following the SM-2 principle.
      </p>

      {topics.length === 0 ? (
        <p className="rounded-[22px] bg-[#f8f7f5] p-5 text-sm font-semibold text-black/70">
          Nothing is due in the next 7 days.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {topics.map((t) => {
            const type = typeLabel(t);
            return (
              <li
                key={t.topicId}
                className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2 rounded-2xl bg-[#f8f7f5] p-3 sm:p-4"
              >
                <Badge tone={type.tone}>{type.label}</Badge>
                <span className="min-w-0 break-words text-base font-semibold text-black">
                  {t.topicName ?? t.subjectName ?? 'Topic'}
                </span>
                {t.subjectName && t.topicName && (
                  <span className="min-w-0 break-words text-sm text-[#888]">
                    · {t.subjectName}
                  </span>
                )}
                <TopicStatusBadge
                  mastered={t.topicMastered && t.sessionType !== 'learn'}
                  struggling={t.topicStruggling}
                  size="sm"
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

const statusTone: Record<PlanStatus['kind'], string> = {
  new: 'bg-[#EEF0FF]',
  on_track: 'bg-[#a4e5c7]',
  behind: 'bg-[#F1B5AE]',
};

/** The parent's status: pace against what the plan needs, and what's overdue. */
export function PlanStatusCard({
  status,
  childName,
}: {
  status: PlanStatus;
  childName: string;
}) {
  const text = planStatusText(status, childName);
  return (
    <section
      aria-labelledby="plan-status"
      className={clsx('rounded-[26px] p-5 sm:p-6', statusTone[status.kind])}
    >
      <p className="text-[11px] font-extrabold uppercase tracking-wide text-black/70">
        Status
      </p>
      <h2
        id="plan-status"
        className="mt-1 text-xl font-extrabold tracking-tight sm:text-2xl"
      >
        {text.headline}
      </h2>
      {text.lines.map((line) => (
        <p
          key={line}
          className="mt-2 max-w-3xl text-sm leading-6 text-black/85 sm:text-base"
        >
          {line}
        </p>
      ))}
    </section>
  );
}
