import { z } from 'zod';

/** A subject name as it is stored: trimmed, with inner runs of spaces collapsed. */
export function cleanSubjectName(name: string): string {
  return name.replace(/\s+/g, ' ').trim();
}

/** Request-body schema for a subject name (cleaned, 1 to 200 characters). */
export const subjectNameSchema = z
  .string()
  .max(200)
  .transform(cleanSubjectName)
  .refine((v) => v.length > 0, 'Subject name is required');

// Different ways of writing the SAME subject. Only whole names are matched
// (after the cleaning below), so "Optional Math" stays a different subject
// from "Math". Add more here as needed; every route uses this one list.
const ALIASES: Record<string, string> = {
  math: 'mathematics',
  maths: 'mathematics',
  mathematic: 'mathematics',
  eng: 'english',
  sci: 'science',
  'science and technology': 'science',
  'science and tech': 'science',
  social: 'social studies',
  'social study': 'social studies',
  computer: 'computer science',
  'computer studies': 'computer science',
};

/**
 * What two subject names are compared by: capitals, extra spaces, punctuation
 * and "&" vs "and" don't matter, and known aliases (Maths, Math, Mathematics)
 * count as one subject.
 */
export function subjectKey(name: string): string {
  const k = name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return ALIASES[k] ?? k;
}

/**
 * The first two names in the list that are the same subject, or null. Pass
 * every name that will exist together (existing + new + renamed).
 */
export function findSubjectClash(
  names: string[],
): { first: string; second: string } | null {
  const seen = new Map<string, string>();
  for (const n of names) {
    const key = subjectKey(n);
    const earlier = seen.get(key);
    if (earlier !== undefined) return { first: earlier, second: n };
    seen.set(key, n);
  }
  return null;
}

/**
 * The first incoming name that is the same subject as an existing name, or as
 * an earlier incoming name. Clashes among the EXISTING names are ignored, so
 * data saved before this check can't block an unrelated edit.
 */
export function findNameClash(
  existing: string[],
  incoming: string[],
): { first: string; second: string } | null {
  const seen = new Map<string, string>();
  for (const n of existing) {
    const key = subjectKey(n);
    if (!seen.has(key)) seen.set(key, n);
  }
  for (const n of incoming) {
    const key = subjectKey(n);
    const earlier = seen.get(key);
    if (earlier !== undefined) return { first: earlier, second: n };
    seen.set(key, n);
  }
  return null;
}

export function clashMessage(c: { first: string; second: string }): string {
  return c.first.trim().toLowerCase() === c.second.trim().toLowerCase()
    ? `"${c.second}" is listed twice. Each subject can only be listed once.`
    : `"${c.second}" is the same subject as "${c.first}". Each subject can only be listed once.`;
}

/**
 * The message to show next to a subject name that is the same subject as one
 * of `others`, or null. Used by the pages to warn as the parent types, with
 * the same rule the server applies.
 */
export function subjectClashFor(name: string, others: string[]): string | null {
  if (!name.trim()) return null;
  const clash = findNameClash(
    others.filter((o) => o.trim()),
    [name],
  );
  return clash ? clashMessage(clash) : null;
}
