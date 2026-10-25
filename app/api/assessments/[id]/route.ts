import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import {
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import {
  recomputeTopicMastery,
  type Executor,
} from '@/lib/utils/topic-mastery';
import { applyTestTrends, revertTestEffects } from '@/lib/test-trend';
import { withErrorHandling } from '@/lib/api/handler';

async function loadOwnedAssessment(assessmentId: string, parentId: string) {
  const [row] = await db
    .select({ assessment: schema.assessments })
    .from(schema.assessments)
    .innerJoin(
      schema.students,
      eq(schema.students.id, schema.assessments.studentId),
    )
    .where(
      and(
        eq(schema.assessments.id, assessmentId),
        eq(schema.students.parentId, parentId),
      ),
    )
    .limit(1);
  return row?.assessment ?? null;
}

// Each mark of the test with the topics it is linked to.
async function marksWithTopics(ex: Executor, assessmentId: string) {
  const marks = await ex
    .select({ id: schema.marks.id })
    .from(schema.marks)
    .where(eq(schema.marks.assessmentId, assessmentId));
  const links = await ex
    .select({
      markId: schema.markTopics.markId,
      topicId: schema.markTopics.topicId,
    })
    .from(schema.markTopics)
    .innerJoin(schema.marks, eq(schema.marks.id, schema.markTopics.markId))
    .where(eq(schema.marks.assessmentId, assessmentId));
  return marks.map((m) => ({
    markId: m.id,
    topicIds: links.filter((l) => l.markId === m.id).map((l) => l.topicId),
  }));
}

const updateAssessmentSchema = z.object({
  assessmentName: z.string().min(1).max(200).optional(),
  assessmentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
    .optional(),
});

export const PUT = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const existing = await loadOwnedAssessment(params.id, user.id);
    if (!existing)
      return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    const body = await req.json();
    const parsed = updateAssessmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const dateChanged =
      !!parsed.data.assessmentDate &&
      parsed.data.assessmentDate !== existing.assessmentDate;

    const assessment = await db.transaction(async (tx) => {
      // The date decides which test counts as the latest, so a date change
      // undoes this test's effect, recalculates mastery, then applies it again.
      const marks = dateChanged ? await marksWithTopics(tx, params.id) : [];
      await revertTestEffects(
        tx,
        marks.map((m) => m.markId),
      );

      const [updated] = await tx
        .update(schema.assessments)
        .set(parsed.data)
        .where(eq(schema.assessments.id, params.id))
        .returning();

      if (dateChanged) {
        await recomputeTopicMastery(
          marks.flatMap((m) => m.topicIds),
          tx,
        );
        await applyTestTrends(tx, marks);
      }
      return updated;
    });

    return NextResponse.json({ assessment });
  },
);

// Deletes the test and every mark recorded in it (marks and mark_topics are
// ON DELETE CASCADE). What each mark did to its topics' SM-2 state is undone
// first and topic mastery is recalculated, all in one transaction.
export const DELETE = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const existing = await loadOwnedAssessment(params.id, user.id);
    if (!existing)
      return NextResponse.json({ error: 'Test not found' }, { status: 404 });

    await db.transaction(async (tx) => {
      const marks = await marksWithTopics(tx, params.id);
      await revertTestEffects(
        tx,
        marks.map((m) => m.markId),
      );
      await tx
        .delete(schema.assessments)
        .where(eq(schema.assessments.id, params.id));
      await recomputeTopicMastery(
        marks.flatMap((m) => m.topicIds),
        tx,
      );
    });

    return NextResponse.json({ success: true });
  },
);
