import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq, inArray } from 'drizzle-orm';
import {
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';

async function assertOwnsSubject(subjectId: string, parentId: string) {
  const [row] = await db
    .select({ studentId: schema.subjects.studentId })
    .from(schema.subjects)
    .where(eq(schema.subjects.id, subjectId))
    .limit(1);
  if (!row) return false;
  const [student] = await db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.id, row.studentId),
        eq(schema.students.parentId, parentId),
      ),
    )
    .limit(1);
  return !!student;
}

const createTopicsSchema = z.object({
  subjectId: z.string().uuid(),
  // Set to add the topics as sub-topics of this (top-level) topic.
  parentTopicId: z.string().uuid().optional(),
  topics: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        difficultyRating: z.number().int().min(1).max(5).optional().default(2),
        estimatedMastery: z.number().int().min(0).max(100).optional(),
      }),
    )
    .min(1),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();

  const body = await req.json();
  const parsed = createTopicsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const owns = await assertOwnsSubject(parsed.data.subjectId, user.id);
  if (!owns)
    return NextResponse.json({ error: 'Subject not found' }, { status: 404 });

  const { parentTopicId } = parsed.data;
  if (parentTopicId) {
    const [parent] = await db
      .select()
      .from(schema.topics)
      .where(eq(schema.topics.id, parentTopicId))
      .limit(1);
    if (!parent || parent.subjectId !== parsed.data.subjectId) {
      return NextResponse.json(
        { error: 'Parent topic not found' },
        { status: 404 },
      );
    }
    if (parent.parentTopicId) {
      return NextResponse.json(
        { error: 'Sub-topics cannot have their own sub-topics' },
        { status: 400 },
      );
    }
    // The topic stops being scheduled itself, so a test mark scoped to it
    // goes back to counting for the whole subject.
    await db
      .delete(schema.markTopics)
      .where(eq(schema.markTopics.topicId, parentTopicId));
  }

  const inserted = await db
    .insert(schema.topics)
    .values(
      parsed.data.topics.map((t) => ({
        subjectId: parsed.data.subjectId,
        parentTopicId: parentTopicId ?? null,
        name: t.name,
        difficultyRating: t.difficultyRating,
        estimatedMastery: t.estimatedMastery ?? null,
      })),
    )
    .returning();

  // Initialize spaced-repetition state for every new topic.
  if (inserted.length > 0) {
    await db.insert(schema.topicSpacedState).values(
      inserted.map((topic) => ({
        topicId: topic.id,
        intervalDays: 0,
        easeFactor: '2.5',
        repetitionCount: 0,
        status: 'new' as const,
      })),
    );
  }

  return NextResponse.json({ topics: inserted }, { status: 201 });
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();

  const subjectId = req.nextUrl.searchParams.get('subjectId');
  if (!subjectId)
    return NextResponse.json(
      { error: 'subjectId is required' },
      { status: 400 },
    );

  const owns = await assertOwnsSubject(subjectId, user.id);
  if (!owns)
    return NextResponse.json({ error: 'Subject not found' }, { status: 404 });

  const topicRows = await db
    .select()
    .from(schema.topics)
    .where(eq(schema.topics.subjectId, subjectId));
  const stateRows =
    topicRows.length > 0
      ? await db
          .select()
          .from(schema.topicSpacedState)
          .where(
            inArray(
              schema.topicSpacedState.topicId,
              topicRows.map((t) => t.id),
            ),
          )
      : [];
  const stateByTopic = new Map(stateRows.map((s) => [s.topicId, s]));

  const topics = topicRows.map((t) => ({
    ...t,
    spacedState: stateByTopic.get(t.id) ?? null,
  }));

  return NextResponse.json({ topics });
});
