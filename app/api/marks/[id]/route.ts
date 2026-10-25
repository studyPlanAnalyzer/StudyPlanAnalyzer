import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq, inArray } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import {
  recomputeTopicMastery,
  type Executor,
} from '@/lib/utils/topic-mastery';
import { expandToLeaves } from '@/lib/topic-leaves';
import { applyTestTrend, revertTestEffects } from '@/lib/test-trend';
import { withErrorHandling } from '@/lib/api/handler';

async function loadOwnedMark(markId: string, parentId: string) {
  const [row] = await db
    .select({ mark: schema.marks })
    .from(schema.marks)
    .innerJoin(
      schema.assessments,
      eq(schema.assessments.id, schema.marks.assessmentId),
    )
    .innerJoin(
      schema.students,
      eq(schema.students.id, schema.assessments.studentId),
    )
    .where(
      and(eq(schema.marks.id, markId), eq(schema.students.parentId, parentId)),
    )
    .limit(1);
  return row?.mark ?? null;
}

async function linkedTopicIds(ex: Executor, markId: string): Promise<string[]> {
  const rows = await ex
    .select({ topicId: schema.markTopics.topicId })
    .from(schema.markTopics)
    .where(eq(schema.markTopics.markId, markId));
  return rows.map((r) => r.topicId);
}

const updateMarkSchema = z.object({
  obtainedMarks: z.number().int().min(0).optional(),
  fullMarks: z.number().int().positive().optional(),
  confidenceLevel: z.enum(['low', 'medium', 'high']).nullable().optional(),
  // Replaces the mark's topic scope. [] makes it a whole-subject mark again.
  topicIds: z.array(z.string().uuid()).optional(),
});

export const PUT = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const body = await req.json();
    const parsed = updateMarkSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { topicIds, ...markFields } = parsed.data;

    // The mark (with its owner check) and the topics to be linked are read
    // together: one round instead of two in a row.
    const [existing, topicRows] = await Promise.all([
      loadOwnedMark(params.id, userId),
      topicIds && topicIds.length > 0
        ? db
            .select()
            .from(schema.topics)
            .where(inArray(schema.topics.id, topicIds))
        : Promise.resolve([]),
    ]);
    if (!existing)
      return NextResponse.json({ error: 'Mark not found' }, { status: 404 });

    const obtained = markFields.obtainedMarks ?? existing.obtainedMarks;
    const full = markFields.fullMarks ?? existing.fullMarks;
    if (obtained > full) {
      return NextResponse.json(
        { error: 'obtainedMarks cannot exceed fullMarks' },
        { status: 400 },
      );
    }

    if (topicIds && topicIds.length > 0) {
      if (topicRows.length !== new Set(topicIds).size) {
        return NextResponse.json(
          { error: 'One or more topics not found' },
          { status: 404 },
        );
      }
      if (topicRows.some((t) => t.subjectId !== existing.subjectId)) {
        return NextResponse.json(
          { error: 'Selected topics must belong to the same subject' },
          { status: 400 },
        );
      }
    }

    // One transaction: undo what this mark did, apply the corrected mark, and
    // run the mastery and trend calculations again as if it had been logged so.
    const result = await db.transaction(async (tx) => {
      const previousTopicIds = await linkedTopicIds(tx, params.id);
      await revertTestEffects(tx, params.id);

      let updatedMark: typeof existing | undefined;
      if (Object.keys(markFields).length > 0) {
        [updatedMark] = await tx
          .update(schema.marks)
          .set(markFields)
          .where(eq(schema.marks.id, params.id))
          .returning();
      }

      let currentTopicIds = previousTopicIds;
      if (topicIds) {
        currentTopicIds = await expandToLeaves(
          existing.subjectId,
          topicIds,
          tx,
        );
        await tx
          .delete(schema.markTopics)
          .where(eq(schema.markTopics.markId, params.id));
        if (currentTopicIds.length > 0) {
          await tx.insert(schema.markTopics).values(
            currentTopicIds.map((topicId) => ({
              markId: params.id,
              topicId,
            })),
          );
        }
      }

      // Topics that gained, lost, or kept this mark all need their mastery redone.
      await recomputeTopicMastery(
        [...previousTopicIds, ...currentTopicIds],
        tx,
      );
      await applyTestTrend(tx, currentTopicIds, params.id);

      const mark =
        updatedMark ??
        (
          await tx
            .select()
            .from(schema.marks)
            .where(eq(schema.marks.id, params.id))
            .limit(1)
        )[0];
      return { mark, currentTopicIds };
    });

    return NextResponse.json({
      mark: result.mark,
      topicIds: result.currentTopicIds,
      scopedToTopics: result.currentTopicIds.length > 0,
    });
  },
);

export const DELETE = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const existing = await loadOwnedMark(params.id, userId);
    if (!existing)
      return NextResponse.json({ error: 'Mark not found' }, { status: 404 });

    await db.transaction(async (tx) => {
      const topicIds = await linkedTopicIds(tx, params.id);
      await revertTestEffects(tx, params.id);
      // mark_topics rows go with it (ON DELETE CASCADE).
      await tx.delete(schema.marks).where(eq(schema.marks.id, params.id));
      await recomputeTopicMastery(topicIds, tx);
    });

    return NextResponse.json({ success: true });
  },
);
