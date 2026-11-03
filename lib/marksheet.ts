import { eq, inArray } from 'drizzle-orm';
import { schema } from '@/lib/db';
import { RequestError } from '@/lib/api/handler';
import type { Executor } from '@/lib/utils/topic-mastery';

/**
 * One test can't hold two marks for the same thing. Per subject it has either
 * one mark for the whole subject, or marks for its topics with no topic
 * marked twice, never both. (Two separate tests may of course both mark it.)
 *
 * Checked on what is saved, inside the caller's transaction, for the
 * (test, subject) pairs the caller wrote to; a broken rule throws a
 * RequestError, so the transaction rolls back and the parent gets a 400.
 */
export async function checkMarksheets(
  ex: Executor,
  pairs: { assessmentId: string; subjectId: string }[],
) {
  const wanted = new Set(pairs.map((p) => `${p.assessmentId}|${p.subjectId}`));
  if (wanted.size === 0) return;

  const rows = await ex
    .select({
      markId: schema.marks.id,
      assessmentId: schema.marks.assessmentId,
      subjectId: schema.marks.subjectId,
      topicId: schema.markTopics.topicId,
      testName: schema.assessments.assessmentName,
      subjectName: schema.subjects.name,
      topicName: schema.topics.name,
    })
    .from(schema.marks)
    .innerJoin(schema.assessments, eq(schema.assessments.id, schema.marks.assessmentId))
    .innerJoin(schema.subjects, eq(schema.subjects.id, schema.marks.subjectId))
    .leftJoin(schema.markTopics, eq(schema.markTopics.markId, schema.marks.id))
    .leftJoin(schema.topics, eq(schema.topics.id, schema.markTopics.topicId))
    .where(
      inArray(
        schema.marks.assessmentId,
        Array.from(new Set(pairs.map((p) => p.assessmentId))),
      ),
    );

  const groups = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = `${r.assessmentId}|${r.subjectId}`;
    if (!wanted.has(key)) continue;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }

  for (const list of Array.from(groups.values())) {
    const { testName, subjectName } = list[0];
    const topicsOf = new Map<string, string[]>();
    for (const r of list) {
      const t = topicsOf.get(r.markId) ?? [];
      if (r.topicId) t.push(r.topicId);
      topicsOf.set(r.markId, t);
    }
    const whole = Array.from(topicsOf.values()).filter((t) => t.length === 0).length;
    const scoped = topicsOf.size - whole;
    if (whole > 1)
      throw new RequestError(
        `"${subjectName}" has more than one mark in "${testName}". A test can have one mark per subject; log another test for a second result.`,
      );
    if (whole === 1 && scoped > 0)
      throw new RequestError(
        `"${subjectName}" in "${testName}" has a mark for the whole subject and marks for its topics. Use one or the other.`,
      );
    // Topic -> the mark it first appeared in.
    const markOfTopic = new Map<string, string>();
    for (const r of list) {
      if (!r.topicId) continue;
      const first = markOfTopic.get(r.topicId);
      if (first && first !== r.markId)
        throw new RequestError(
          `"${r.topicName}" has more than one mark in "${testName}". Each topic can only be marked once per test.`,
        );
      markOfTopic.set(r.topicId, r.markId);
    }
  }
}
