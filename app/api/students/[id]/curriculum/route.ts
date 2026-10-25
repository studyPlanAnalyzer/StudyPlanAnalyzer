import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { randomUUID } from 'crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { insertTopicRows } from '@/lib/topic-leaves';
import { rebuildPlan } from '@/lib/plan-rebuild';
import { todayUTC } from '@/lib/utils/date-utils';
import { withErrorHandling } from '@/lib/api/handler';

export const maxDuration = 60;

class PlanRebuildError extends Error {}

const name = z.string().min(1).max(200);
const weight = z.enum(['low', 'medium', 'high']);

const curriculumSchema = z.object({
  // The plan to rebuild as part of the same save, if the child has one.
  planId: z.string().uuid().optional(),
  // New subjects, each with its top-level topics.
  subjects: z
    .array(
      z.object({
        name,
        fullMarks: z.number().int().positive().default(100),
        examWeight: z.enum(['low', 'medium', 'high']),
        topics: z.array(name).default([]),
      }),
    )
    .default([]),
  // Changes to existing subjects (any field is optional; isActive archives
  // or restores) and topics, plus deletions.
  subjectEdits: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: name.optional(),
        fullMarks: z.number().int().positive().optional(),
        examWeight: weight.optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .default([]),
  deletedSubjectIds: z.array(z.string().uuid()).default([]),
  topicEdits: z
    .array(
      z.object({
        id: z.string().uuid(),
        name,
        difficultyRating: z.number().int().min(1).max(5),
      }),
    )
    .default([]),
  deletedTopicIds: z.array(z.string().uuid()).default([]),
  // New topics under an existing subject, or sub-topics under one of its
  // topics when parentTopicId is set.
  topics: z
    .array(
      z.object({
        subjectId: z.string().uuid(),
        parentTopicId: z.string().uuid().nullable().default(null),
        name,
        difficultyRating: z.number().int().min(1).max(5).default(2),
      }),
    )
    .default([]),
});

// Saves everything changed on the Subjects page, and rebuilds the plan from it,
// in one transaction: either all of it happens or none of it.
export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const parsed = curriculumSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const {
      planId,
      subjects: newSubjects,
      topics: newTopics,
      subjectEdits,
      deletedSubjectIds,
      topicEdits,
      deletedTopicIds,
    } = parsed.data;
    if (
      newSubjects.length +
        newTopics.length +
        subjectEdits.length +
        deletedSubjectIds.length +
        topicEdits.length +
        deletedTopicIds.length ===
      0
    ) {
      return NextResponse.json({ error: 'Nothing to save' }, { status: 400 });
    }

    // Student, subjects, topics and the plan are read together in ONE parallel
    // round (five queries in a row before). Nothing is saved unless the student
    // is this parent's.
    const [students, existingSubjects, topicJoin, plans] = await Promise.all([
      db
        .select()
        .from(schema.students)
        .where(
          and(
            eq(schema.students.id, params.id),
            eq(schema.students.parentId, userId),
          ),
        )
        .limit(1),
      db
        .select({ id: schema.subjects.id, name: schema.subjects.name })
        .from(schema.subjects)
        .where(eq(schema.subjects.studentId, params.id)),
      db
        .select({ topic: schema.topics })
        .from(schema.topics)
        .innerJoin(
          schema.subjects,
          eq(schema.subjects.id, schema.topics.subjectId),
        )
        .where(eq(schema.subjects.studentId, params.id)),
      planId
        ? db
            .select()
            .from(schema.studyPlans)
            .where(
              and(
                eq(schema.studyPlans.id, planId),
                eq(schema.studyPlans.studentId, params.id),
              ),
            )
            .limit(1)
        : Promise.resolve([]),
    ]);
    const student = students[0];
    if (!student)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    const subjectIds = new Set(existingSubjects.map((s) => s.id));
    const topicRows = topicJoin.map((r) => r.topic);
    const topicById = new Map(topicRows.map((t) => [t.id, t]));

    const unknown =
      [...subjectEdits.map((e) => e.id), ...deletedSubjectIds].some(
        (id) => !subjectIds.has(id),
      ) ||
      [...topicEdits.map((e) => e.id), ...deletedTopicIds].some(
        (id) => !topicById.has(id),
      );
    if (unknown)
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    // After this save, no two subjects (active or archived) may share a name.
    const finalNames = [
      ...existingSubjects
        .filter((s) => !deletedSubjectIds.includes(s.id))
        .map((s) => subjectEdits.find((e) => e.id === s.id)?.name ?? s.name),
      ...newSubjects.map((s) => s.name),
    ].map((n) => n.trim().toLowerCase());
    const dup = finalNames.find((n, i) => finalNames.indexOf(n) !== i);
    if (dup)
      return NextResponse.json(
        {
          error: `A subject named "${dup}" already exists. Each subject can only be listed once.`,
        },
        { status: 400 },
      );

    // Deleting a topic takes its sub-topics with it.
    const removedTopicIds = new Set(deletedTopicIds);
    for (const t of topicRows) {
      if (t.parentTopicId && removedTopicIds.has(t.parentTopicId))
        removedTopicIds.add(t.id);
    }

    for (const t of newTopics) {
      if (
        deletedSubjectIds.includes(t.subjectId) ||
        (t.parentTopicId && removedTopicIds.has(t.parentTopicId))
      )
        return NextResponse.json(
          { error: 'Cannot add to something being deleted' },
          { status: 400 },
        );
      const parent = t.parentTopicId ? topicById.get(t.parentTopicId) : null;
      if (!subjectIds.has(t.subjectId))
        return NextResponse.json(
          { error: 'Subject not found' },
          { status: 404 },
        );
      if (t.parentTopicId && (!parent || parent.subjectId !== t.subjectId))
        return NextResponse.json(
          { error: 'Parent topic not found' },
          { status: 404 },
        );
      if (parent?.parentTopicId)
        return NextResponse.json(
          { error: 'Sub-topics cannot have their own sub-topics' },
          { status: 400 },
        );
    }

    const plan = plans[0];
    if (planId && !plan)
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

    let planUpdated = false;
    try {
      await db.transaction(async (tx) => {
        // Deletions first. Open sessions for deleted items go too, so they don't
        // linger as blank sessions; completed ones stay with the link cleared.
        const openStatuses: ('planned' | 'skipped')[] = ['planned', 'skipped'];
        if (removedTopicIds.size > 0) {
          await tx
            .delete(schema.studySessions)
            .where(
              and(
                inArray(
                  schema.studySessions.topicId,
                  Array.from(removedTopicIds),
                ),
                inArray(schema.studySessions.status, openStatuses),
              ),
            );
          await tx
            .delete(schema.topics)
            .where(inArray(schema.topics.id, deletedTopicIds));
        }
        if (deletedSubjectIds.length > 0) {
          await tx
            .delete(schema.studySessions)
            .where(
              and(
                inArray(schema.studySessions.subjectId, deletedSubjectIds),
                inArray(schema.studySessions.status, openStatuses),
              ),
            );
          await tx
            .delete(schema.subjects)
            .where(inArray(schema.subjects.id, deletedSubjectIds));
        }

        for (const e of subjectEdits) {
          if (deletedSubjectIds.includes(e.id)) continue;
          const { id, ...fields } = e;
          if (Object.keys(fields).length === 0) continue;
          await tx
            .update(schema.subjects)
            .set(fields)
            .where(eq(schema.subjects.id, id));
        }
        // All topic edits in one statement.
        const liveTopicEdits = topicEdits.filter(
          (e) => !removedTopicIds.has(e.id),
        );
        if (liveTopicEdits.length > 0) {
          const values = sql.join(
            liveTopicEdits.map(
              (e) =>
                sql`(${e.id}::uuid, ${e.name}::text, ${e.difficultyRating}::integer)`,
            ),
            sql`, `,
          );
          await tx.execute(sql`
        UPDATE topics AS t SET name = v.name, difficulty_rating = v.rating
        FROM (VALUES ${values}) AS v(id, name, rating)
        WHERE t.id = v.id
      `);
        }

        // New subjects: one insert for all of them (ids are made here so their
        // topics can be attached without reading anything back).
        const newSubjectRows = newSubjects.map((s, i) => ({
          id: randomUUID(),
          studentId: student.id,
          name: s.name,
          fullMarks: s.fullMarks,
          examWeight: s.examWeight,
          orderIndex: existingSubjects.length + i,
        }));
        if (newSubjectRows.length > 0)
          await tx.insert(schema.subjects).values(newSubjectRows);

        // A topic that gains sub-topics is no longer scheduled itself, so a test
        // mark scoped to it goes back to counting for the whole subject.
        const parentsGainingChildren = Array.from(
          new Set(
            newTopics.flatMap((t) =>
              t.parentTopicId ? [t.parentTopicId] : [],
            ),
          ),
        );
        if (parentsGainingChildren.length > 0)
          await tx
            .delete(schema.markTopics)
            .where(inArray(schema.markTopics.topicId, parentsGainingChildren));

        // Every new topic and sub-topic, of new and existing subjects alike, in two
        // statements in total.
        await insertTopicRows(tx, [
          ...newSubjects.flatMap((s, i) =>
            s.topics.map((n) => ({
              subjectId: newSubjectRows[i].id,
              parentTopicId: null,
              name: n,
            })),
          ),
          ...newTopics.map((t) => ({
            subjectId: t.subjectId,
            parentTopicId: t.parentTopicId,
            name: t.name,
            difficultyRating: t.difficultyRating,
          })),
        ]);

        // Rebuild the plan from the new curriculum inside the same transaction. A
        // finished exam has no plan left to rebuild, which is not a failure;
        // anything else is, and rolls back every change above.
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

    return NextResponse.json({ success: true, planUpdated }, { status: 201 });
  },
);
