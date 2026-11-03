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
import { replayTestTrends, revertTestEffects } from '@/lib/test-trend';
import { withErrorHandling } from '@/lib/api/handler';
import { paymentRequiredResponse } from '@/lib/billing/guard';
import { testDateSchema } from '@/lib/validation';

async function loadOwnedAssessment(assessmentId: string, parentId: string) {
  const [row] = await db
    .select({ assessment: schema.assessments, student: schema.students })
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
  return row ?? null;
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
  assessmentDate: testDateSchema.optional(),
});

export const PUT = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const owned = await loadOwnedAssessment(params.id, user.id);
    if (!owned)
      return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    const denied = paymentRequiredResponse(owned.student);
    if (denied) return denied;
    const existing = owned.assessment;

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
      const [updated] = await tx
        .update(schema.assessments)
        .set(parsed.data)
        .where(eq(schema.assessments.id, params.id))
        .returning();

      // The date decides the order of the topic's tests, so mastery is
      // recalculated and every trend effect from the earlier of the two dates
      // on is redone in the new order.
      if (dateChanged) {
        const topicIds = (await marksWithTopics(tx, params.id)).flatMap(
          (m) => m.topicIds,
        );
        await recomputeTopicMastery(topicIds, tx);
        const from = [existing.assessmentDate, parsed.data.assessmentDate!].sort()[0];
        await replayTestTrends(tx, topicIds, from);
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
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const owned = await loadOwnedAssessment(params.id, user.id);
    if (!owned)
      return NextResponse.json({ error: 'Test not found' }, { status: 404 });
    const denied = paymentRequiredResponse(owned.student);
    if (denied) return denied;
    const existing = owned.assessment;

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
