import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq, inArray } from 'drizzle-orm';
import {
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';

async function loadOwnedTopic(topicId: string, parentId: string) {
  const [topic] = await db
    .select()
    .from(schema.topics)
    .where(eq(schema.topics.id, topicId))
    .limit(1);
  if (!topic) return null;
  const [subject] = await db
    .select()
    .from(schema.subjects)
    .where(eq(schema.subjects.id, topic.subjectId))
    .limit(1);
  if (!subject) return null;
  const [student] = await db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.id, subject.studentId),
        eq(schema.students.parentId, parentId),
      ),
    )
    .limit(1);
  return student ? topic : null;
}

const updateTopicSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  difficultyRating: z.number().int().min(1).max(5).optional(),
  estimatedMastery: z.number().int().min(0).max(100).nullable().optional(),
});

export const PUT = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const existing = await loadOwnedTopic(params.id, user.id);
    if (!existing)
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });

    const body = await req.json();
    const parsed = updateTopicSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const [topic] = await db
      .update(schema.topics)
      .set(parsed.data)
      .where(eq(schema.topics.id, params.id))
      .returning();

    return NextResponse.json({ topic });
  },
);

// Cascades to the topic's sub-topics, spaced-repetition state, review history and
// mark_topics links. Planned/skipped sessions for the topic are removed so they
// don't show up as blank sessions; completed sessions stay with topicId = null.
export const DELETE = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const existing = await loadOwnedTopic(params.id, user.id);
    if (!existing)
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });

    // Sub-topics go with their topic, so clear their open sessions too.
    const children = await db
      .select({ id: schema.topics.id })
      .from(schema.topics)
      .where(eq(schema.topics.parentTopicId, params.id));
    await db
      .delete(schema.studySessions)
      .where(
        and(
          inArray(schema.studySessions.topicId, [
            params.id,
            ...children.map((c) => c.id),
          ]),
          inArray(schema.studySessions.status, ['planned', 'skipped']),
        ),
      );
    await db.delete(schema.topics).where(eq(schema.topics.id, params.id));
    return NextResponse.json({ success: true });
  },
);
