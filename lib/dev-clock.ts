import fs from 'node:fs';
import path from 'node:path';
import { isRealDateString } from '@/lib/utils/date-utils';

/**
 * Development-only fake "today" for testing day-by-day behaviour (SM-2
 * reviews, plan rebuilds, catch-up, exam expiry) without waiting real days.
 *
 * The day is kept in a git-ignored .dev-today file in the project root, so it
 * survives dev-server restarts and is shared by every request. appDay() in
 * date-utils reads it through globalThis.__devToday. Nothing here does
 * anything unless NODE_ENV is "development".
 */
export const DEV_CLOCK_ENABLED = process.env.NODE_ENV === 'development';

const FILE = path.join(process.cwd(), '.dev-today');

export function readDevToday(): string | null {
  if (!DEV_CLOCK_ENABLED) return null;
  try {
    const value = fs.readFileSync(FILE, 'utf8').trim();
    return isRealDateString(value) ? value : null;
  } catch {
    return null;
  }
}

/** Sets the fake day, or clears it (back to the real day) with null. */
export function writeDevToday(day: string | null) {
  if (!DEV_CLOCK_ENABLED) return;
  if (day === null) fs.rmSync(FILE, { force: true });
  else fs.writeFileSync(FILE, `${day}\n`);
}

/** Points appDay() on the server at the .dev-today file. Safe to call often. */
export function installDevClock() {
  if (DEV_CLOCK_ENABLED) globalThis.__devToday = readDevToday;
}
