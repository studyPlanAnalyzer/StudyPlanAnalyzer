import { eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { blendedPercent } from '@/lib/utils/scoring';

// Anything with the query methods of `db`, including a transaction.
export type Executor = Pick<
  typeof db,
  'select' | 'insert' | 'update' | 'delete' | 'execute'
>;

/**
 * Recomputes `topics.estimatedMastery` from the marks currently linked to each
 * topic through `mark_topics`. This is the same calculation POST /api/marks
 * runs when a topic-scoped mark is created (blend of the last 3 marks, sorted
 * by assessment date), so editing or deleting a mark stays consistent with it.
 *
 * A topic with no linked marks left is reset to null (no estimate), so a
 * deleted test can't leave a stale mastery value behind.
 */
export async function recomputeTopicMastery(
  topicIds: string[],
  ex: Executor = db,
) {
  const unique = Array.from(new Set(topicIds));
  if (unique.length === 0) return;

  const rows = await ex
    .select({
      topicId: schema.markTopics.topicId,
      obtainedMarks: schema.marks.obtainedMarks,
      fullMarks: schema.marks.fullMarks,
      assessmentDate: schema.assessments.assessmentDate,
    })
    .from(schema.markTopics)
    .innerJoin(schema.marks, eq(schema.marks.id, schema.markTopics.markId))
    .innerJoin(
      schema.assessments,
      eq(schema.assessments.id, schema.marks.assessmentId),
    )
    .where(inArray(schema.markTopics.topicId, unique));

  // Group the history by topic once, then write every result with ONE update
  // (a CASE over the topic ids) instead of one round trip per topic.
  const byTopic = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = byTopic.get(r.topicId);
    if (list) list.push(r);
    else byTopic.set(r.topicId, [r]);
  }

  const mastery = new Map<string, number | null>();
  for (const topicId of unique) {
    const history = (byTopic.get(topicId) ?? []).sort((a, b) =>
      a.assessmentDate < b.assessmentDate
        ? -1
        : a.assessmentDate > b.assessmentDate
          ? 1
          : 0,
    );
    if (history.length === 0) {
      mastery.set(topicId, null);
      continue;
    }
    const records = history.map((m) => ({
      percent: Math.round((m.obtainedMarks / m.fullMarks) * 100),
      fullMarks: m.fullMarks,
    }));
    const latestPercent = records[records.length - 1].percent;
    const value = Math.round(blendedPercent(records, latestPercent));
    mastery.set(topicId, Math.max(0, Math.min(100, value)));
  }

  const cases = sql.join(
    unique.map((id) => {
      const v = mastery.get(id);
      return v === null || v === undefined
        ? sql`WHEN ${id}::uuid THEN NULL::integer`
        : sql`WHEN ${id}::uuid THEN ${v}::integer`;
    }),
    sql` `,
  );
  await ex
    .update(schema.topics)
    .set({ estimatedMastery: sql`CASE ${schema.topics.id} ${cases} END` })
    .where(inArray(schema.topics.id, unique));
}
