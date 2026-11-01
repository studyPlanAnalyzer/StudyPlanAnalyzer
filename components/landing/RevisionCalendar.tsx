import { Reveal } from './Reveal';

// Illustrative four weeks before an exam: one topic is first studied, then
// revised with growing gaps, then the optional final week, then the exam.
const DAYS = 28;
const FIRST_STUDY = 0;
const REVISIONS = [1, 4, 10];
const FINAL_WEEK_START = 20;
const EXAM = DAYS - 1;

function delayFor(day: number) {
  return `${150 + day * 55}ms`;
}

export function RevisionCalendar() {
  return (
    <Reveal>
      <div
        role="img"
        aria-label="Example: a topic is first studied on day 1 and revised on days 2, 5 and 11, with longer gaps each time. The last week before the exam is kept for final review."
        className="grid grid-cols-7 gap-1.5 sm:gap-2.5"
      >
        {Array.from({ length: DAYS }, (_, day) => {
          const isFinal = day >= FINAL_WEEK_START && day < EXAM;
          return (
            <div
              key={day}
              className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-[10px] sm:rounded-[14px] ${
                day === EXAM ? 'bg-black' : 'bg-[#F0EFED]'
              }`}
            >
              {isFinal && (
                <span
                  className="lp-pop absolute inset-0 bg-[#9DDFC2]"
                  style={{ animationDelay: delayFor(day) }}
                />
              )}
              {day === FIRST_STUDY && (
                <span
                  className="lp-pop h-1/2 w-1/2 rounded-full border-2 border-black bg-[#F7CC46]"
                  style={{ animationDelay: delayFor(day) }}
                />
              )}
              {REVISIONS.includes(day) && (
                <span
                  className="lp-pop h-[38%] w-[38%] rounded-full bg-black"
                  style={{ animationDelay: delayFor(day) }}
                />
              )}
              {day === EXAM && (
                <svg viewBox="0 0 24 24" className="lp-pop h-1/2 w-1/2" style={{ animationDelay: delayFor(day) }}>
                  <path
                    d="M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.3l-5.8 3.1 1.1-6.5-4.7-4.6 6.5-.9z"
                    fill="#F7CC46"
                  />
                </svg>
              )}
            </div>
          );
        })}
      </div>

      <ul className="mt-6 grid gap-x-6 gap-y-3 text-base text-black sm:grid-cols-2">
        <li className="flex items-center gap-3">
          <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-full border-2 border-black bg-[#F7CC46]" />
          First time studying the topic
        </li>
        <li className="flex items-center gap-3">
          <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full bg-black" />
          Revision, with longer gaps each time
        </li>
        <li className="flex items-center gap-3">
          <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-[5px] bg-[#9DDFC2]" />
          Final review week (if you choose it)
        </li>
        <li className="flex items-center gap-3">
          <span aria-hidden="true" className="h-4 w-4 shrink-0 rounded-[5px] bg-black" />
          Exam day
        </li>
      </ul>
    </Reveal>
  );
}
