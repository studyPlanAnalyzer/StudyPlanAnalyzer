import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { Executor } from '@/lib/utils/topic-mastery';

export type Level = 'low' | 'medium' | 'high';

/**
 * The confidence the parent gave with each lowest-level topic's latest test:
 * topic id -> level. Only marks logged for that topic count (a whole-subject
 * mark carries the subject's confidence, which is kept separately). The
 * latest test wins; the same day is broken by when it was saved.
 */
export async function loadLeafConfidence(
  studentId: string,
  ex: Executor = db,
): Promise<Map<string, Level>> {
  const rows = await ex
    .select({
      topicId: schema.markTopics.topicId,
      level: schema.marks.confidenceLevel,
      date: schema.assessments.assessmentDate,
      savedAt: schema.marks.createdAt,
    })
    .from(schema.markTopics)
    .innerJoin(schema.marks, eq(schema.marks.id, schema.markTopics.markId))
    .innerJoin(
      schema.assessments,
      eq(schema.assessments.id, schema.marks.assessmentId),
    )
    .where(eq(schema.assessments.studentId, studentId));

  const latest = new Map<string, { level: Level; date: string; at: number }>();
  for (const r of rows) {
    if (r.level !== 'low' && r.level !== 'medium' && r.level !== 'high')
      continue;
    const at = r.savedAt.getTime();
    const cur = latest.get(r.topicId);
    if (!cur || r.date > cur.date || (r.date === cur.date && at > cur.at))
      latest.set(r.topicId, { level: r.level, date: r.date, at });
  }
  return new Map(Array.from(latest, ([id, v]) => [id, v.level]));
}
