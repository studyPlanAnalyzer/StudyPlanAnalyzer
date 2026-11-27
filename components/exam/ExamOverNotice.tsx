import { ButtonLink } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Notice';
import { formatDay, todayKey } from '@/lib/utils/date-utils';
import { breakReminder, breakReminderText } from '@/lib/utils/exam-break';

/**
 * Shown instead of a study plan once the exam it was built for is over (the
 * plan is removed at that point). Offers the two ways forward. From 2 weeks
 * after the exam it also nudges, gently at first and more firmly from 3
 * weeks (see breakReminder): the review clock is paused, but memory isn't.
 */
export function ExamOverNotice({
  studentId,
  examName,
  examDate,
}: {
  studentId: string;
  examName: string;
  examDate: string;
}) {
  const reminder = breakReminder(examDate, todayKey());
  return (
    <div className="rounded-[32px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-8 lg:p-10">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[22px] bg-[#F7CC46] text-3xl">
          🏁
        </div>

        <div className="min-w-0 flex-1">
          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            This study plan is over.
          </h2>

          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#65615D] sm:text-base">
            <span className="font-bold text-black">{examName}</span> was on{' '}
            {formatDay(examDate)}, so its plan has been
            cleared. Start the next exam cycle to get a new plan, or begin a new
            academic session if your child has moved on.
          </p>

          {reminder && (
            <Notice
              tone={reminder.stage === 'firm' ? 'warning' : 'info'}
              className="mt-5"
              role="status"
            >
              {breakReminderText(reminder)}
            </Notice>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink
              href={`/students/${studentId}/new-exam`}
              variant="yellow"
              size="lg"
            >
              Start new exam cycle
            </ButtonLink>

            <ButtonLink
              href={`/students/${studentId}/new-session`}
              variant="secondary"
              size="lg"
              wrap
            >
              Start a new academic session with no previous exams
            </ButtonLink>
          </div>
        </div>
      </div>
    </div>
  );
}
