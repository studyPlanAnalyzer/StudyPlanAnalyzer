import type { DayCompletion } from '@/lib/types/todo';

function isFullyDone(day: DayCompletion | undefined): boolean {
  return !!day && day.total > 0 && day.completed === day.total;
}

function prevDateKey(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/**
 * currentStreak: consecutive fully-completed days counting back from today.
 * If today isn't fully done yet (or has no tasks at all), that doesn't break
 * the streak — the day isn't over — so counting starts from yesterday instead.
 *
 * longestStreak: the longest run of consecutive fully-completed calendar days
 * anywhere in the history. A day with no todos at all (a gap) breaks a run,
 * same as an incomplete day does.
 */
export function computeStreaks(days: DayCompletion[], todayKey: string) {
  const byDate = new Map(days.map((d) => [d.date, d]));

  let cursor = todayKey;
  if (!isFullyDone(byDate.get(cursor))) {
    cursor = prevDateKey(cursor);
  }
  let currentStreak = 0;
  while (isFullyDone(byDate.get(cursor))) {
    currentStreak++;
    cursor = prevDateKey(cursor);
  }

  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  let longestStreak = 0;
  let running = 0;
  let prevDate: string | null = null;

  for (const day of sorted) {
    const done = isFullyDone(day);
    const consecutive = prevDate !== null && prevDateKey(day.date) === prevDate;
    if (done && consecutive) {
      running += 1;
    } else if (done) {
      running = 1;
    } else {
      running = 0;
    }
    longestStreak = Math.max(longestStreak, running);
    prevDate = day.date;
  }

  return { currentStreak, longestStreak };
}
