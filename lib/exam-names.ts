/**
 * The four exams of a school year in Nepal, offered by default wherever an
 * exam is named. Parents can type their own name instead.
 */
export const EXAM_NAMES = [
  'First Terminal Examination',
  'Second Terminal Examination',
  'Third Terminal Examination',
  'Final Examination',
] as const;

/** The first exam of an academic year. */
export const FIRST_EXAM_NAME = EXAM_NAMES[0];

/** The exam that usually follows `current` in the year, if any. */
export function nextExamName(current: string | null | undefined): string | null {
  const i = EXAM_NAMES.findIndex((n) => n.toLowerCase() === current?.trim().toLowerCase());
  return i >= 0 && i < EXAM_NAMES.length - 1 ? EXAM_NAMES[i + 1] : null;
}

/** The default exams that come before `current` in the year (for earlier topics). */
export function examNamesBefore(current: string | null | undefined): string[] {
  const i = EXAM_NAMES.findIndex((n) => n.toLowerCase() === current?.trim().toLowerCase());
  return i > 0 ? EXAM_NAMES.slice(0, i) : [];
}
