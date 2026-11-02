import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import {
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { paymentRequiredResponse } from '@/lib/billing/guard';
import { deleteTopics } from '@/lib/topic-delete';

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
    .select({
      id: schema.students.id,
      paidUntil: schema.students.paidUntil,
      paymentStatus: schema.students.paymentStatus,
    })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.id, subject.studentId),
        eq(schema.students.parentId, parentId),
      ),
    )
    .limit(1);
  return student ? { topic, student } : null;
}

const updateTopicSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  difficultyRating: z.number().int().min(1).max(5).optional(),
  estimatedMastery: z.number().int().min(0).max(100).nullable().optional(),
});

export const PUT = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const owned = await loadOwnedTopic(params.id, user.id);
    if (!owned)
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    const denied = paymentRequiredResponse(owned.student);
    if (denied) return denied;
    const existing = owned.topic;

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

// Deletes the topic, its sub-topics and what existed only for them (open
// sessions, marks scoped only to them), in one transaction: see deleteTopics.
// Completed sessions stay with topicId = null.
export const DELETE = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const owned = await loadOwnedTopic(params.id, user.id);
    if (!owned)
      return NextResponse.json({ error: 'Topic not found' }, { status: 404 });
    const denied = paymentRequiredResponse(owned.student);
    if (denied) return denied;

    await db.transaction((tx) => deleteTopics(tx, [params.id]));
    return NextResponse.json({ success: true });
  },
);
