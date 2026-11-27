import { randomUUID } from 'crypto';
import { z } from 'zod';
import type { NewTopicRow } from '@/lib/topic-leaves';

/**
 * Topics already taught when a child is set up, a new session starts or a
 * new subject arrives with a new exam cycle: each with optional sub-topics,
 * as on the Subjects page. Sub-topic names are unique under their topic.
 */
const nameSchema = z.string().trim().min(1).max(200);
const difficultySchema = z.number().int().min(1).max(5).default(2);
const norm = (n: string) => n.trim().replace(/\s+/g, ' ').toLowerCase();

const taughtTopicBase = z.object({
  name: nameSchema,
  difficultyRating: difficultySchema,
  subTopics: z.array(z.object({ name: nameSchema, difficultyRating: difficultySchema })).max(50).default([]),
});
const uniqueSubTopics = (t: { subTopics: { name: string }[] }) =>
  new Set(t.subTopics.map((s) => norm(s.name))).size === t.subTopics.length;
const uniqueMessage = { message: 'A sub-topic name can be used once under its topic', path: ['subTopics'] };

export const taughtTopicSchema = taughtTopicBase.refine(uniqueSubTopics, uniqueMessage);

/**
 * A topic taught for the new exam in a subject the child already has (new
 * exam cycle): a new topic with optional sub-topics, or, with parentTopicId,
 * a new sub-topic under one of the subject's topics.
 */
export const existingSubjectTopicSchema = taughtTopicBase
  .extend({ subjectId: z.string().uuid(), parentTopicId: z.string().uuid().nullable().default(null) })
  .refine(uniqueSubTopics, uniqueMessage)
  .refine((t) => !t.parentTopicId || t.subTopics.length === 0, {
    message: 'A sub-topic cannot have its own sub-topics',
    path: ['subTopics'],
  });

export type TaughtTopic = z.infer<typeof taughtTopicSchema>;

/** The first name used twice in a list (ignoring case and spaces), or null. */
export function repeatedTopicName(names: string[]): string | null {
  const seen = new Set<string>();
  for (const n of names) {
    if (seen.has(norm(n))) return n.trim();
    seen.add(norm(n));
  }
  return null;
}
export { norm as normTopicName };

/** The topics that get studied: sub-topics, or a topic that has none. */
export function taughtLeafCount(topics: TaughtTopic[]): number {
  return topics.reduce((n, t) => n + (t.subTopics.length || 1), 0);
}

/**
 * Rows for insertTopicRows: each topic, then its sub-topics under it, all
 * tagged with the exam. `learnFrom` has one date per studied topic (see
 * taughtLeafCount), in order; a topic with sub-topics isn't studied itself.
 */
export function taughtTopicRows(
  items: (TaughtTopic & { subjectId: string; parentTopicId?: string | null })[],
  tag: { examId: string; examName: string },
  learnFrom: string[],
): NewTopicRow[] {
  const rows: NewTopicRow[] = [];
  let k = 0;
  for (const t of items) {
    const id = randomUUID();
    rows.push({
      id,
      subjectId: t.subjectId,
      parentTopicId: t.parentTopicId ?? null,
      name: t.name,
      difficultyRating: t.difficultyRating,
      ...tag,
      learnFrom: t.subTopics.length ? null : learnFrom[k++],
    });
    for (const s of t.subTopics)
      rows.push({
        subjectId: t.subjectId,
        parentTopicId: id,
        name: s.name,
        difficultyRating: s.difficultyRating,
        ...tag,
        learnFrom: learnFrom[k++],
      });
  }
  return rows;
}
