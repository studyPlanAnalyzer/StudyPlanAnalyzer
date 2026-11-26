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

export const taughtTopicSchema = z
  .object({
    name: nameSchema,
    difficultyRating: difficultySchema,
    subTopics: z.array(z.object({ name: nameSchema, difficultyRating: difficultySchema })).max(50).default([]),
  })
  .refine((t) => new Set(t.subTopics.map((s) => norm(s.name))).size === t.subTopics.length, {
    message: 'A sub-topic name can be used once under its topic',
    path: ['subTopics'],
  });

export type TaughtTopic = z.infer<typeof taughtTopicSchema>;

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
  items: (TaughtTopic & { subjectId: string })[],
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
      parentTopicId: null,
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
