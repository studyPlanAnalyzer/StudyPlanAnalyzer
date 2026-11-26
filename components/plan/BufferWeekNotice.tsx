import Link from 'next/link';
import { Notice } from '@/components/ui/Notice';

/** What the buffer week says, wherever the plan has stopped for it. */
export const BUFFER_WEEK_TEXT =
  'You chose to end the plan a week before the exam, so you can revise by yourself in the final week.';

/** Shown alone on Today and Revise in the buffer week, and above the plan. */
export function BufferWeekNotice({ className }: { className?: string }) {
  return (
    <Notice tone="info" role="status" className={className}>
      {BUFFER_WEEK_TEXT}
    </Notice>
  );
}

/** The nudge to add what was taught today: it's learned tomorrow. */
export function TaughtTodayPrompt({ studentId, className }: { studentId: string; className?: string }) {
  return (
    <Notice tone="neutral" className={className}>
      Was anything new taught today? Add it on the{' '}
      <Link href={`/students/${studentId}/subjects`} className="font-semibold underline underline-offset-4">
        Subjects page
      </Link>{' '}
      and it&apos;s on tomorrow&apos;s list.
    </Notice>
  );
}
