import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

/**
 * Topics are one level deep: a topic may have sub-topics. Everything that is
 * scored or scheduled works on "leaves" — sub-topics, or topics that have none.
 */
export function leafTopics<
  T extends { id: string; parentTopicId: string | null },
>(topics: T[]): T[] {
  const parentIds = new Set(topics.map((t) => t.parentTopicId));
  return topics.filter((t) => !parentIds.has(t.id));
}

/** Replaces any topic that has sub-topics with those sub-topics. */
export async function expandToLeaves(
  subjectId: string,
  topicIds: string[],
  ex: Pick<typeof db, 'select'> = db,
): Promise<string[]> {
  const all = await ex
    .select({
      id: schema.topics.id,
      parentTopicId: schema.topics.parentTopicId,
    })
    .from(schema.topics)
    .where(eq(schema.topics.subjectId, subjectId));
  const leafIds = new Set(leafTopics(all).map((t) => t.id));
  const out = new Set<string>();
  for (const id of topicIds) {
    if (leafIds.has(id)) out.add(id);
    else
      all.filter((t) => t.parentTopicId === id).forEach((t) => out.add(t.id));
  }
  return Array.from(out);
}

/**
 * expandToLeaves for several marks with ONE query. Returns the leaf topic ids
 * for each item, in the same order.
 */
export async function expandManyToLeaves(
  items: { subjectId: string; topicIds: string[] }[],
  ex: Pick<typeof db, 'select'> = db,
): Promise<string[][]> {
  const subjectIds = Array.from(new Set(items.map((i) => i.subjectId)));
  if (subjectIds.length === 0) return [];
  const all = await ex
    .select({
      id: schema.topics.id,
      subjectId: schema.topics.subjectId,
      parentTopicId: schema.topics.parentTopicId,
    })
    .from(schema.topics)
    .where(inArray(schema.topics.subjectId, subjectIds));
  const bySubject = new Map<string, typeof all>();
  for (const t of all) {
    const list = bySubject.get(t.subjectId);
    if (list) list.push(t);
    else bySubject.set(t.subjectId, [t]);
  }
  return items.map(({ subjectId, topicIds }) => {
    const topics = bySubject.get(subjectId) ?? [];
    const leafIds = new Set(leafTopics(topics).map((t) => t.id));
    const out = new Set<string>();
    for (const id of topicIds) {
      if (leafIds.has(id)) out.add(id);
      else
        topics
          .filter((t) => t.parentTopicId === id)
          .forEach((t) => out.add(t.id));
    }
    return Array.from(out);
  });
}

export type NewTopicRow = {
  subjectId: string;
  parentTopicId: string | null;
  name: string;
  difficultyRating?: number;
};

/**
 * Inserts topics (or sub-topics) with their SM-2 starting state, for any number
 * of subjects, in TWO queries in total. Returns the inserted topic rows.
 */
export async function insertTopicRows(
  ex: Pick<typeof db, 'insert'>,
  rows: NewTopicRow[],
) {
  if (rows.length === 0) return [];
  const inserted = await ex
    .insert(schema.topics)
    .values(
      rows.map((r) => ({
        subjectId: r.subjectId,
        parentTopicId: r.parentTopicId,
        name: r.name,
        difficultyRating: r.difficultyRating ?? 2,
      })),
    )
    .returning();
  await ex.insert(schema.topicSpacedState).values(
    inserted.map((t) => ({
      topicId: t.id,
      intervalDays: 0,
      easeFactor: '2.5',
      repetitionCount: 0,
      status: 'new' as const,
    })),
  );
  return inserted;
}

/** Inserts topics (or sub-topics, with a parent) of one subject. */
export async function insertTopics(
  ex: Pick<typeof db, 'insert'>,
  subjectId: string,
  parentTopicId: string | null,
  rows: { name: string; difficultyRating?: number }[],
) {
  await insertTopicRows(
    ex,
    rows.map((r) => ({ ...r, subjectId, parentTopicId })),
  );
}
