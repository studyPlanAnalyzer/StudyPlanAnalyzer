import { randomUUID } from 'crypto';
import { inArray } from 'drizzle-orm';
import { schema } from '@/lib/db';
import { expandManyToLeaves } from '@/lib/topic-leaves';
import {
  recomputeTopicMastery,
  type Executor,
} from '@/lib/utils/topic-mastery';
import { applyTestTrends } from '@/lib/test-trend';

export type NewMark = {
  assessmentId: string;
  subjectId: string;
  obtainedMarks: number;
  fullMarks: number;
  confidenceLevel?: 'low' | 'medium' | 'high';
  topicIds: string[];
};

/**
 * Everything saving a set of marks involves, in a FIXED number of queries (at
 * most 7) however many marks there are: the marks, their topic links, the
 * subject-estimate cleanup, the mastery update and the SM-2 trend adjustment.
 * Call it inside a transaction so all of it is saved together or not at all.
 */
export async function saveMarks(tx: Executor, newMarks: NewMark[]) {
  if (newMarks.length === 0) return [];

  // Ids are made here so each mark can be matched with its topics without
  // relying on the order rows come back in.
  const prepared = newMarks.map(({ topicIds, ...data }) => ({
    topicIds,
    row: { ...data, id: randomUUID() },
  }));
  const inserted = await tx
    .insert(schema.marks)
    .values(prepared.map((p) => p.row))
    .returning();
  const markById = new Map(inserted.map((m) => [m.id, m]));

  // A topic with sub-topics stands for all of them; mastery lives on leaves.
  const leaves = await expandManyToLeaves(
    prepared.map((p) => ({
      subjectId: p.row.subjectId,
      topicIds: p.topicIds,
    })),
    tx,
  );

  // A whole-subject mark replaces the subject's estimated confidence for good.
  // A topic-scoped one doesn't: the other topics still rely on the estimate.
  const wholeSubjectIds = Array.from(
    new Set(
      prepared
        .filter((_, i) => leaves[i].length === 0)
        .map((p) => p.row.subjectId),
    ),
  );
  if (wholeSubjectIds.length > 0) {
    await tx
      .delete(schema.subjectEstimatedConfidence)
      .where(
        inArray(schema.subjectEstimatedConfidence.subjectId, wholeSubjectIds),
      );
  }

  const links = prepared.flatMap((p, i) =>
    leaves[i].map((topicId) => ({ markId: p.row.id, topicId })),
  );
  if (links.length > 0) {
    await tx.insert(schema.markTopics).values(links);
    await recomputeTopicMastery(
      links.map((l) => l.topicId),
      tx,
    );
    await applyTestTrends(
      tx,
      prepared
        .map((p, i) => ({ markId: p.row.id, topicIds: leaves[i] }))
        .filter((x) => x.topicIds.length > 0),
    );
  }

  return prepared.map((p, i) => ({
    mark: markById.get(p.row.id)!,
    scopedToTopics: leaves[i].length > 0,
  }));
}

/** One mark; see saveMarks. */
export async function saveMark(tx: Executor, mark: NewMark) {
  const [saved] = await saveMarks(tx, [mark]);
  return saved;
}
