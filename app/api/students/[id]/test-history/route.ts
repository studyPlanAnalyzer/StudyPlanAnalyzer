import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq, inArray } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import {
  recomputeTopicMastery,
  type Executor,
} from '@/lib/utils/topic-mastery';
import { expandManyToLeaves } from '@/lib/topic-leaves';
import { applyTestTrends, revertTestEffects } from '@/lib/test-trend';
import { rebuildPlan } from '@/lib/plan-rebuild';
import { todayUTC } from '@/lib/utils/date-utils';

export const maxDuration = 60;

class PlanRebuildError extends Error {}

const uuid = z.string().uuid();

const bodySchema = z.object({
  planId: uuid.optional(),
  assessmentEdits: z
    .array(
      z.object({
        id: uuid,
        assessmentName: z.string().trim().min(1).max(200).optional(),
        assessmentDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .optional(),
      }),
    )
    .default([]),
  markEdits: z
    .array(
      z.object({
        id: uuid,
        obtainedMarks: z.number().int().min(0),
        fullMarks: z.number().int().positive(),
        confidenceLevel: z.enum(['low', 'medium', 'high']).nullable(),
        topicIds: z.array(uuid),
      }),
    )
    .default([]),
  deletedMarkIds: z.array(uuid).default([]),
  deletedAssessmentIds: z.array(uuid).default([]),
});

// The topics linked to each of the given marks, with ONE query.
async function linkedTopics(ex: Executor, markIds: string[]) {
  const out = new Map<string, string[]>(markIds.map((id) => [id, []]));
  if (markIds.length === 0) return out;
  const rows = await ex
    .select({
      markId: schema.markTopics.markId,
      topicId: schema.markTopics.topicId,
    })
    .from(schema.markTopics)
    .where(inArray(schema.markTopics.markId, markIds));
  for (const r of rows) out.get(r.markId)!.push(r.topicId);
  return out;
}

/**
 * Applies every staged change from the test history page in ONE transaction:
 * edits and deletes of tests and marks, with each mark's effect on its topics
 * undone and, for edited marks, applied again. The plan is rebuilt once
 * as part of the same transaction: if the rebuild fails, nothing is saved.
 */
export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const [student] = await db
      .select()
      .from(schema.students)
      .where(
        and(
          eq(schema.students.id, params.id),
          eq(schema.students.parentId, userId),
        ),
      )
      .limit(1);
    if (!student)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const {
      planId,
      assessmentEdits,
      markEdits,
      deletedMarkIds,
      deletedAssessmentIds,
    } = parsed.data;

    // Everything must belong to this student.
    const assessments = await db
      .select()
      .from(schema.assessments)
      .where(eq(schema.assessments.studentId, student.id));
    const assessmentById = new Map(assessments.map((a) => [a.id, a]));
    const marks =
      assessments.length > 0
        ? await db
            .select()
            .from(schema.marks)
            .where(
              inArray(
                schema.marks.assessmentId,
                assessments.map((a) => a.id),
              ),
            )
        : [];
    const markById = new Map(marks.map((m) => [m.id, m]));

    const unknown =
      assessmentEdits.some((e) => !assessmentById.has(e.id)) ||
      deletedAssessmentIds.some((id) => !assessmentById.has(id)) ||
      markEdits.some((e) => !markById.has(e.id)) ||
      deletedMarkIds.some((id) => !markById.has(id));
    if (unknown)
      return NextResponse.json(
        { error: 'Test or mark not found' },
        { status: 404 },
      );

    if (markEdits.some((e) => e.obtainedMarks > e.fullMarks))
      return NextResponse.json(
        { error: 'obtainedMarks cannot exceed fullMarks' },
        { status: 400 },
      );

    // Topics chosen for a mark must belong to that mark's subject.
    const editSubjectIds = Array.from(
      new Set(markEdits.map((e) => markById.get(e.id)!.subjectId)),
    );
    const topicRows =
      editSubjectIds.length > 0
        ? await db
            .select({
              id: schema.topics.id,
              subjectId: schema.topics.subjectId,
            })
            .from(schema.topics)
            .where(inArray(schema.topics.subjectId, editSubjectIds))
        : [];
    const subjectOfTopic = new Map(topicRows.map((t) => [t.id, t.subjectId]));
    for (const e of markEdits) {
      const subjectId = markById.get(e.id)!.subjectId;
      if (e.topicIds.some((t) => subjectOfTopic.get(t) !== subjectId))
        return NextResponse.json(
          { error: 'Selected topics must belong to the same subject' },
          { status: 400 },
        );
    }

    let plan: typeof schema.studyPlans.$inferSelect | undefined;
    if (planId) {
      [plan] = await db
        .select()
        .from(schema.studyPlans)
        .where(
          and(
            eq(schema.studyPlans.id, planId),
            eq(schema.studyPlans.studentId, student.id),
          ),
        )
        .limit(1);
      if (!plan)
        return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    }

    const goneAssessments = new Set(deletedAssessmentIds);
    const goneMarks = new Set(deletedMarkIds);
    for (const m of marks)
      if (goneAssessments.has(m.assessmentId)) goneMarks.add(m.id);

    const keptMarkEdits = markEdits.filter((e) => !goneMarks.has(e.id));
    const keptAssessmentEdits = assessmentEdits.filter(
      (e) => !goneAssessments.has(e.id),
    );
    const dateChanged = new Set(
      keptAssessmentEdits
        .filter(
          (e) =>
            e.assessmentDate &&
            e.assessmentDate !== assessmentById.get(e.id)!.assessmentDate,
        )
        .map((e) => e.id),
    );
    // Marks whose effect is undone first, and (unless deleted) applied again.
    const reapplyIds = new Set([
      ...keptMarkEdits.map((e) => e.id),
      ...marks
        .filter((m) => dateChanged.has(m.assessmentId) && !goneMarks.has(m.id))
        .map((m) => m.id),
    ]);
    const undoIds = new Set([...goneMarks, ...reapplyIds]);

    let planUpdated = false;
    try {
      await db.transaction(async (tx) => {
        const touchedTopics = new Set<string>();

        const undoIdList = Array.from(undoIds);
        (await linkedTopics(tx, undoIdList)).forEach((topics) =>
          topics.forEach((t) => touchedTopics.add(t)),
        );
        await revertTestEffects(tx, undoIdList);

        // Deletes (a deleted test takes its marks with it).
        const marksToDelete = deletedMarkIds.filter(
          (id) => !goneAssessments.has(markById.get(id)!.assessmentId),
        );
        if (marksToDelete.length > 0)
          await tx
            .delete(schema.marks)
            .where(inArray(schema.marks.id, marksToDelete));
        if (deletedAssessmentIds.length > 0)
          await tx
            .delete(schema.assessments)
            .where(inArray(schema.assessments.id, deletedAssessmentIds));

        // Edits.
        for (const e of keptAssessmentEdits) {
          const { id, ...fields } = e;
          if (Object.keys(fields).length > 0)
            await tx
              .update(schema.assessments)
              .set(fields)
              .where(eq(schema.assessments.id, id));
        }
        for (const e of keptMarkEdits) {
          const { id, topicIds: _topicIds, ...fields } = e;
          await tx
            .update(schema.marks)
            .set(fields)
            .where(eq(schema.marks.id, id));
        }
        if (keptMarkEdits.length > 0) {
          // Every edited mark's topic links are replaced with three queries in
          // total, not three per mark.
          const leafLists = await expandManyToLeaves(
            keptMarkEdits.map((e) => ({
              subjectId: markById.get(e.id)!.subjectId,
              topicIds: e.topicIds,
            })),
            tx,
          );
          await tx.delete(schema.markTopics).where(
            inArray(
              schema.markTopics.markId,
              keptMarkEdits.map((e) => e.id),
            ),
          );
          const links = keptMarkEdits.flatMap((e, i) =>
            leafLists[i].map((topicId) => ({ markId: e.id, topicId })),
          );
          if (links.length > 0)
            await tx.insert(schema.markTopics).values(links);
        }

        // A test left with no marks has no purpose: remove it too.
        const affectedAssessments = new Set(
          [...goneMarks]
            .map((id) => markById.get(id)!.assessmentId)
            .filter((id) => !goneAssessments.has(id)),
        );
        if (affectedAssessments.size > 0) {
          const ids = Array.from(affectedAssessments);
          const stillUsed = new Set(
            (
              await tx
                .select({ assessmentId: schema.marks.assessmentId })
                .from(schema.marks)
                .where(inArray(schema.marks.assessmentId, ids))
            ).map((r) => r.assessmentId),
          );
          const empty = ids.filter((id) => !stillUsed.has(id));
          if (empty.length > 0)
            await tx
              .delete(schema.assessments)
              .where(inArray(schema.assessments.id, empty));
        }

        // Mastery from the final state, then the trend for every re-applied mark.
        const currentTopics = await linkedTopics(tx, Array.from(reapplyIds));
        currentTopics.forEach((topics) =>
          topics.forEach((t) => touchedTopics.add(t)),
        );
        await recomputeTopicMastery(Array.from(touchedTopics), tx);
        await applyTestTrends(
          tx,
          Array.from(currentTopics, ([markId, topicIds]) => ({
            markId,
            topicIds,
          })),
        );

        // Bring the plan in line inside the same transaction. A finished exam has
        // no plan left to rebuild, which is not a failure; anything else is, and
        // rolls back every change above.
        if (plan) {
          const result = await rebuildPlan({
            plan,
            student,
            fromDate: todayUTC(),
            ex: tx,
          });
          if (result.ok) planUpdated = true;
          else if (result.status !== 400)
            throw new PlanRebuildError(result.error);
        }
      });
    } catch (err) {
      if (err instanceof PlanRebuildError)
        return NextResponse.json(
          {
            error: `The plan couldn't be updated (${err.message}), so nothing was saved. Please try again.`,
          },
          { status: 500 },
        );
      throw err;
    }

    return NextResponse.json({ saved: true, planUpdated });
  },
);
