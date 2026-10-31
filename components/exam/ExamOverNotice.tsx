import Link from 'next/link';

/**
 * Shown instead of a study plan once the exam it was built for is over (the
 * plan is removed at that point). Offers the two ways forward.
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
            {new Date(examDate).toLocaleDateString()}, so its plan has been
            cleared. Start the next exam cycle to get a new plan, or begin a new
            academic session if your child has moved on.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/students/${studentId}/new-exam`}
              className="inline-flex items-center justify-center rounded-full bg-[#F7CC46] px-6 py-3.5 text-sm font-semibold text-black shadow-[0_5px_12px_rgba(0,0,0,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F0C33A] hover:shadow-[0_7px_16px_rgba(0,0,0,0.10)] active:scale-95 sm:px-7 sm:py-4 sm:text-base"
            >
              Start new exam cycle
            </Link>

            <Link
              href={`/students/${studentId}/new-session`}
              className="inline-flex items-center justify-center rounded-full bg-[#F0EFED] px-6 py-3.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-[#E7E5E2] active:scale-95 sm:px-7 sm:py-4 sm:text-base"
            >
              Start a new academic session with no previous exams
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
