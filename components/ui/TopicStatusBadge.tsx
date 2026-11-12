import clsx from 'clsx';

/** What "mastered" means, for parents and children (the badge's tooltip). */
export const MASTERED_NOTE =
  'Rated Easy on 3 reviews in a row. It now comes back less often, for a quick check, and once more just before the exam. A Hard or Again rating puts it back on the normal schedule.';

/** What "Needs practice" means, for parents and children (the badge's tooltip). */
export const NEEDS_PRACTICE_NOTE =
  'Rated Hard or Again on 2 of the last 3 sessions. Sessions on it are a bit longer until it gets easier, and it comes first among the topics to focus on.';

const SIZE = {
  sm: 'px-2.5 py-0.5 text-xs',
  md: 'px-3 py-1 text-sm',
  // Matches the session card's Tag row.
  lg: 'px-5 py-2 text-sm',
};

type Size = keyof typeof SIZE;

function StatusBadge({
  label,
  icon,
  note,
  tone,
  size,
  className,
}: {
  label: string;
  icon: string;
  note: string;
  tone: string;
  size: Size;
  className?: string;
}) {
  return (
    <span
      title={note}
      className={clsx(
        'inline-flex w-fit items-center gap-1 whitespace-nowrap rounded-full font-bold',
        tone,
        SIZE[size],
        className,
      )}
    >
      <span aria-hidden="true">{icon}</span> {label}
    </span>
  );
}

/**
 * A topic the child has mastered (topic_spaced_state.status "mastered"; see
 * MASTERY_EASY_STREAK in lib/utils/spaced-repetition.ts).
 */
export function MasteredBadge({ size = 'md', className }: { size?: Size; className?: string }) {
  return (
    <StatusBadge
      label="Mastered"
      icon="★"
      note={MASTERED_NOTE}
      tone="bg-[#9DDFC2] text-[#145c3d]"
      size={size}
      className={className}
    />
  );
}

/**
 * Needs practice: a topic rated Hard or Again on 2 of its last 3 sessions
 * (isStruggling in lib/utils/topic-status.ts; the code keeps that name).
 */
export function NeedsPracticeBadge({ size = 'md', className }: { size?: Size; className?: string }) {
  return (
    <StatusBadge
      label="Needs practice"
      icon="↻"
      note={NEEDS_PRACTICE_NOTE}
      tone="bg-[#F1B5AE] text-[#7a2e26]"
      size={size}
      className={className}
    />
  );
}

/** The topic's status badge, if it has one (a topic is never both). */
export function TopicStatusBadge({
  mastered,
  struggling,
  size = 'md',
}: {
  mastered?: boolean;
  struggling?: boolean;
  size?: Size;
}) {
  if (struggling) return <NeedsPracticeBadge size={size} />;
  if (mastered) return <MasteredBadge size={size} />;
  return null;
}
