/** Top-level topic suggestions shown when adding a subject. Sub-topics (e.g.
 * Force and motion under Physics) are added by the user as they are taught.
 * Matched loosely against the subject name. */
export const COMMON_TOPICS: Record<string, string[]> = {
  mathematics: [
    'Arithmetic',
    'Algebra',
    'Geometry',
    'Trigonometry',
    'Mensuration',
    'Statistics',
    'Functions',
  ],
  math: [
    'Arithmetic',
    'Algebra',
    'Geometry',
    'Trigonometry',
    'Mensuration',
    'Statistics',
    'Functions',
  ],
  science: ['Physics', 'Chemistry', 'Biology'],
  english: ['Grammar', 'Reading comprehension', 'Writing', 'Literature'],
  'social studies': ['History', 'Geography', 'Civics', 'Economics'],
  'computer science': ['Programming', 'Data and algorithms', 'Networking'],
  nepali: [
    'Vyakaran (grammar)',
    'Rachana (composition)',
    'Sahitya (literature)',
  ],
};

export function suggestTopicsFor(subjectName: string): string[] {
  const key = subjectName.trim().toLowerCase();
  if (COMMON_TOPICS[key]) return COMMON_TOPICS[key];
  const partialMatch = Object.keys(COMMON_TOPICS).find(
    (k) => key.includes(k) || k.includes(key),
  );
  return partialMatch ? COMMON_TOPICS[partialMatch] : [];
}
