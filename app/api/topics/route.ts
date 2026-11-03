import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq, inArray } from 'drizzle-orm';
import {
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { paymentRequiredResponse } from '@/lib/billing/guard';
import { revertTopicTrends } from '@/lib/test-trend';

async function assertOwnsSubject(subjectId: string, parentId: string) {
  const [row] = await db
    .select({ studentId: schema.subjects.studentId })
    .from(schema.subjects)
    .where(eq(schema.subjects.id, subjectId))
    .limit(1);
  if (!row) return null;
  const [student] = await db
    .select({
      id: schema.students.id,
      paidUntil: schema.students.paidUntil,
      paymentStatus: schema.students.paymentStatus,
    })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.id, row.studentId),
        eq(schema.students.parentId, parentId),
      ),
    )
    .limit(1);
  return student ?? null;
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
  const denied = paymentRequiredResponse(owns);
  if (denied) return denied;

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
  }

  // One transaction: a topic is never left without its spaced-repetition
  // state, and a parent never half-way through gaining sub-topics.
  const inserted = await db.transaction(async (tx) => {
    // A topic with sub-topics is judged through them from now on. Its own
    // test marks stay linked to it as history (they don't turn into
    // whole-subject marks), and the trend adjustments they made to it are
    // taken back so nothing stale is left if it later loses its sub-topics.
    if (parentTopicId) await revertTopicTrends(tx, [parentTopicId]);

    const rows = await tx
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
    await tx.insert(schema.topicSpacedState).values(
      rows.map((topic) => ({
        topicId: topic.id,
        intervalDays: 0,
        easeFactor: '2.5',
        repetitionCount: 0,
        status: 'new' as const,
      })),
    );
    return rows;
  });

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
  const denied = paymentRequiredResponse(owns);
  if (denied) return denied;

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
