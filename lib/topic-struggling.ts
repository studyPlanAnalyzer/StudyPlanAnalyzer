import { inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { isStruggling, STRUGGLE_WINDOW } from '@/lib/utils/topic-status';

type Executor = Pick<typeof db, 'select'>;

/**
 * What the ratings in topic_reviews say about each topic (every rated session
 * writes one, optional sessions none). One query however many topics.
 *
 * - `struggling`: Needs practice (see isStruggling), from the last
 *   STRUGGLE_WINDOW ratings.
 * - `ratedOnce`: the only rating so far is the learn session, so the next
 *   review is the topic's first follow-up.
 */
export async function loadTopicRatingSummary(
  topicIds: string[],
  ex: Executor = db,
): Promise<{ struggling: Set<string>; ratedOnce: Set<string> }> {
  if (topicIds.length === 0) return { struggling: new Set(), ratedOnce: new Set() };
  const ranked = ex
    .select({
      topicId: schema.topicReviews.topicId,
      rating: schema.topicReviews.rating,
      n: sql<number>`row_number() over (
        partition by ${schema.topicReviews.topicId}
        order by ${schema.topicReviews.completedDate} desc nulls last,
                 ${schema.topicReviews.createdAt} desc
      )`.as('n'),
      total: sql<number>`count(*) over (partition by ${schema.topicReviews.topicId})`.as('total'),
    })
    .from(schema.topicReviews)
    .where(inArray(schema.topicReviews.topicId, topicIds))
    .as('ranked');
  const rows = await ex
    .select({ topicId: ranked.topicId, rating: ranked.rating, total: ranked.total })
    .from(ranked)
    .where(sql`${ranked.n} <= ${STRUGGLE_WINDOW}`)
    .orderBy(ranked.topicId, ranked.n);

  const ratingsOf = new Map<string, number[]>();
  const ratedOnce = new Set<string>();
  for (const r of rows) {
    const list = ratingsOf.get(r.topicId);
    if (list) list.push(r.rating);
    else ratingsOf.set(r.topicId, [r.rating]);
    if (Number(r.total) === 1) ratedOnce.add(r.topicId);
  }
  return {
    struggling: new Set(
      Array.from(ratingsOf.entries())
        .filter(([, ratings]) => isStruggling(ratings))
        .map(([id]) => id),
    ),
    ratedOnce,
  };
}

/** Which of these topics are struggling (Needs practice). */
export async function loadStrugglingTopicIds(
  topicIds: string[],
  ex: Executor = db,
): Promise<Set<string>> {
  return (await loadTopicRatingSummary(topicIds, ex)).struggling;
}
