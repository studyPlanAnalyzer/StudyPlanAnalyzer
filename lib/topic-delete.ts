import { and, eq, inArray } from 'drizzle-orm';
import { schema } from '@/lib/db';
import {
  recomputeTopicMastery,
  type Executor,
} from '@/lib/utils/topic-mastery';
import { applyTestTrends, revertTestEffects } from '@/lib/test-trend';

/**
 * Deletes topics, their sub-topics, and everything that existed only for them.
 * Call inside a transaction.
 *
 * - Planned and skipped sessions for them are removed; completed sessions stay
 *   as history with topicId = null (ON DELETE SET NULL).
 * - A test mark scoped only to deleted topics is deleted with them. Left
 *   alone, the cascade on mark_topics would strip its topics and turn it into
 *   a whole-subject mark, silently changing the subject's score.
 * - A mark that also covers other topics just loses the deleted ones; its
 *   effect on the remaining topics is recalculated.
 * - A test left with no marks is removed too.
 */
export async function deleteTopics(ex: Executor, topicIds: string[]) {
  if (topicIds.length === 0) return;

  const children = await ex
    .select({ id: schema.topics.id })
    .from(schema.topics)
    .where(inArray(schema.topics.parentTopicId, topicIds));
  const removed = new Set([...topicIds, ...children.map((c) => c.id)]);
  const removedIds = Array.from(removed);

  // Every link of every mark that touches a removed topic.
  const touching = ex
    .select({ markId: schema.markTopics.markId })
    .from(schema.markTopics)
    .where(inArray(schema.markTopics.topicId, removedIds));
  const links = await ex
    .select({
      markId: schema.markTopics.markId,
      topicId: schema.markTopics.topicId,
      assessmentId: schema.marks.assessmentId,
    })
    .from(schema.markTopics)
    .innerJoin(schema.marks, eq(schema.marks.id, schema.markTopics.markId))
    .where(inArray(schema.markTopics.markId, touching));

  const keptTopicsByMark = new Map<string, string[]>();
  const assessmentOfMark = new Map<string, string>();
  for (const l of links) {
    assessmentOfMark.set(l.markId, l.assessmentId);
    const kept = keptTopicsByMark.get(l.markId) ?? [];
    if (!removed.has(l.topicId)) kept.push(l.topicId);
    keptTopicsByMark.set(l.markId, kept);
  }
  const goneMarks = Array.from(keptTopicsByMark)
    .filter(([, kept]) => kept.length === 0)
    .map(([id]) => id);
  const partialMarks = Array.from(keptTopicsByMark)
    .filter(([, kept]) => kept.length > 0)
    .map(([markId, kept]) => ({ markId, topicIds: kept }));

  await revertTestEffects(ex, Array.from(keptTopicsByMark.keys()));

  await ex
    .delete(schema.studySessions)
    .where(
      and(
        inArray(schema.studySessions.topicId, removedIds),
        inArray(schema.studySessions.status, ['planned', 'skipped']),
      ),
    );
  if (goneMarks.length > 0)
    await ex.delete(schema.marks).where(inArray(schema.marks.id, goneMarks));
  // Sub-topics, SM-2 state, review history and mark links go with their topic.
  await ex.delete(schema.topics).where(inArray(schema.topics.id, removedIds));

  // Tests whose only marks were just deleted.
  const affectedTests = Array.from(
    new Set(goneMarks.map((id) => assessmentOfMark.get(id)!)),
  );
  if (affectedTests.length > 0) {
    const stillUsed = new Set(
      (
        await ex
          .select({ assessmentId: schema.marks.assessmentId })
          .from(schema.marks)
          .where(inArray(schema.marks.assessmentId, affectedTests))
      ).map((r) => r.assessmentId),
    );
    const empty = affectedTests.filter((id) => !stillUsed.has(id));
    if (empty.length > 0)
      await ex
        .delete(schema.assessments)
        .where(inArray(schema.assessments.id, empty));
  }

  // Marks that keep some of their topics count again for those alone.
  if (partialMarks.length > 0) {
    await recomputeTopicMastery(
      partialMarks.flatMap((m) => m.topicIds),
      ex,
    );
    await applyTestTrends(ex, partialMarks);
  }
}
