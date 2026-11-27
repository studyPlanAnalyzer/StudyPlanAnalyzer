/**
 * Topic status from session ratings, alongside priority (which comes from
 * marks only, never ratings):
 *
 * - Mastered: three Easy reviews in a row (topic_spaced_state.status; see
 *   MASTERY_EASY_STREAK in spaced-repetition.ts).
 * - Struggling: Again or Hard on at least STRUGGLE_MIN_HARD of the last
 *   STRUGGLE_WINDOW rated sessions. Sessions on it get the next tier's
 *   (longer) lengths, and it leads the focus lists. It clears by itself after
 *   two Good or Easy ratings in a row. A topic can't be both: mastery needs
 *   the last three ratings to be Easy.
 */
export const STRUGGLE_WINDOW = 3;
export const STRUGGLE_MIN_HARD = 2;

/** `ratings` newest first (1 Again, 2 Hard, 3 Good, 4 Easy). */
export function isStruggling(ratings: number[]): boolean {
  return (
    ratings.slice(0, STRUGGLE_WINDOW).filter((r) => r <= 2).length >=
    STRUGGLE_MIN_HARD
  );
}

/**
 * Order for focus lists: struggling topics first, then the rest, then
 * mastered ones; by priority within each group.
 */
export function sortForFocus<
  T extends { priority: number; mastered: boolean; struggling: boolean },
>(topics: T[]): T[] {
  const group = (t: T) => (t.struggling ? 0 : t.mastered ? 2 : 1);
  return [...topics].sort(
    (a, b) => group(a) - group(b) || b.priority - a.priority,
  );
}

/** "Topics to focus on": struggling first, never a mastered topic. */
export function topFocusTopics<
  T extends { priority: number; mastered: boolean; struggling: boolean },
>(topics: T[], count = 3): T[] {
  return sortForFocus(topics)
    .filter((t) => !t.mastered)
    .slice(0, count);
}
