import { and, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import type { Executor } from '@/lib/utils/topic-mastery';
import type { EstimatedConfidence } from '@/lib/utils/scoring';

export const estimatedConfidenceSchema = z.enum(['low', 'medium', 'high']);

/**
 * Ids of the given subjects that have at least one whole-subject mark. A mark
 * scoped to specific topics doesn't count: it says nothing about the topics it
 * didn't cover, so those still lean on the subject's estimate.
 */
export async function subjectIdsWithMarks(
  subjectIds: string[],
  ex: Executor = db,
): Promise<Set<string>> {
  if (subjectIds.length === 0) return new Set();
  const rows = await ex
    .select({ subjectId: schema.marks.subjectId })
    .from(schema.marks)
    .leftJoin(schema.markTopics, eq(schema.markTopics.markId, schema.marks.id))
    .where(
      and(
        inArray(schema.marks.subjectId, subjectIds),
        isNull(schema.markTopics.markId),
      ),
    );
  return new Set(rows.map((r) => r.subjectId));
}

/**
 * Estimated confidence for the given subjects, keyed by subject id.
 *
 * An estimate is only a placeholder for "no whole-subject result yet", so a
 * subject with even one whole-subject mark (any exam cycle or assessment) is
 * left out entirely. Topic-scoped marks leave it alone. Every reader of estimates goes through this function, so
 * that rule lives in exactly one place.
 *
 * Such a stale row is also deleted here, so deleting the subject's marks later
 * can't bring the old estimate back.
 */
export async function loadActiveEstimates(
  subjectIds: string[],
  ex: Executor = db,
): Promise<Map<string, EstimatedConfidence>> {
  const estimates = new Map<string, EstimatedConfidence>();
  if (subjectIds.length === 0) return estimates;

  const [rows, withMarks] = await Promise.all([
    ex
      .select()
      .from(schema.subjectEstimatedConfidence)
      .where(inArray(schema.subjectEstimatedConfidence.subjectId, subjectIds)),
    subjectIdsWithMarks(subjectIds, ex),
  ]);

  const stale: string[] = [];
  for (const row of rows) {
    if (withMarks.has(row.subjectId)) {
      stale.push(row.subjectId);
      continue;
    }
    const parsed = estimatedConfidenceSchema.safeParse(row.level);
    if (parsed.success) estimates.set(row.subjectId, parsed.data);
  }
  if (stale.length > 0) {
    await ex
      .delete(schema.subjectEstimatedConfidence)
      .where(inArray(schema.subjectEstimatedConfidence.subjectId, stale));
  }
  return estimates;
}
