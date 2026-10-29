import { randomInt } from 'crypto';

// No 0/O/1/I so a code read from a screen or a statement isn't misread.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomChars(n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/**
 * The code a parent puts in the payment remark. It includes the child's name
 * so it is recognisable in a statement, e.g. "SP-ARJUN-K7Q2M9".
 */
export function makeRemarkCode(childName: string): string {
  const name =
    childName
      .normalize('NFKD')
      .replace(/[^A-Za-z0-9]/g, '')
      .toUpperCase()
      .slice(0, 8) || 'CHILD';
  return `SP-${name}-${randomChars(6)}`;
}

/** The reference code a school hands to its parents, e.g. "SCH-7KQ9-2MXD". */
export function makeSchoolCode(): string {
  return `SCH-${randomChars(4)}-${randomChars(4)}`;
}

/** How a typed school code is compared: case, spaces and dashes don't matter. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * A typed school code in its stored form ("SCH-7KQ9-2MXD"), or null if it
 * can't be one. Capitals, spaces and dashes don't matter.
 */
export function canonicalSchoolCode(input: string): string | null {
  const k = normalizeCode(input);
  if (!/^SCH[A-Z0-9]{8}$/.test(k)) return null;
  return `SCH-${k.slice(3, 7)}-${k.slice(7, 11)}`;
}
