import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq, inArray } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import {
  subjectNameSchema,
  findNameClash,
  clashMessage,
} from '@/lib/subject-name';
import type { Executor } from '@/lib/utils/topic-mastery';
import { paymentRequiredResponse } from '@/lib/billing/guard';

async function loadOwnedSubject(subjectId: string, parentId: string) {
  const [row] = await db
    .select({ subject: schema.subjects, student: schema.students })
    .from(schema.subjects)
    .innerJoin(
      schema.students,
      eq(schema.students.id, schema.subjects.studentId),
    )
    .where(
      and(
        eq(schema.subjects.id, subjectId),
        eq(schema.students.parentId, parentId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// Removes the not-yet-done sessions of a subject so an archived or deleted
// subject disappears from the calendar straight away. Completed and partly
// completed sessions are kept as history.
async function removeOpenSessionsForSubject(ex: Executor, subjectId: string) {
  await ex
    .delete(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.subjectId, subjectId),
        inArray(schema.studySessions.status, ['planned', 'skipped']),
      ),
    );
}

const updateSubjectSchema = z.object({
  name: subjectNameSchema.optional(),
  fullMarks: z.number().int().positive().optional(),
  examWeight: z.enum(['low', 'medium', 'high']).optional(),
  orderIndex: z.number().int().optional(),
  // false = archived: kept for marks history, but skipped by plan generation.
  isActive: z.boolean().optional(),
});

export const PUT = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const body = await req.json();
    const parsed = updateSubjectSchema.safeParse(body);

    // The subject (with its owner check) and the child's other subject
    // names are read together. Nothing changes unless the subject belongs to
    // this parent.
    const [owned, siblings] = await Promise.all([
      loadOwnedSubject(params.id, userId),
      parsed.success && parsed.data.name
        ? db
            .select({ id: schema.subjects.id, name: schema.subjects.name })
            .from(schema.subjects)
            .where(
              eq(
                schema.subjects.studentId,
                db
                  .select({ studentId: schema.subjects.studentId })
                  .from(schema.subjects)
                  .where(eq(schema.subjects.id, params.id))
                  .limit(1),
              ),
            )
        : Promise.resolve([] as { id: string; name: string }[]),
    ]);
    if (!owned)
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    const denied = paymentRequiredResponse(owned.student);
    if (denied) return denied;
    const existing = owned.subject;

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    // A renamed subject can't be the same subject as another one of the
    // child's (active or archived).
    if (parsed.data.name && parsed.data.name !== existing.name) {
      const clash = findNameClash(
        siblings.filter((s) => s.id !== params.id).map((s) => s.name),
        [parsed.data.name],
      );
      if (clash)
        return NextResponse.json(
          { error: clashMessage(clash) },
          { status: 400 },
        );
    }

    // The change and the clean-up of its open sessions are saved together.
    const subject = await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(schema.subjects)
        .set(parsed.data)
        .where(eq(schema.subjects.id, params.id))
        .returning();
      if (parsed.data.isActive === false && existing.isActive) {
        await removeOpenSessionsForSubject(tx, params.id);
      }
      return updated;
    });

    return NextResponse.json({ subject });
  },
);

// Permanent delete. Cascades to the subject's topics, spaced-repetition state
// and marks (so it also erases that subject's marks history). Completed
// sessions stay but lose their subject/topic link. The UI only offers this
// for archived subjects; archiving is the normal way to retire one.
export const DELETE = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const owned = await loadOwnedSubject(params.id, userId);
    if (!owned)
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    const denied = paymentRequiredResponse(owned.student);
    if (denied) return denied;

    await db.transaction(async (tx) => {
      await removeOpenSessionsForSubject(tx, params.id);
      await tx.delete(schema.subjects).where(eq(schema.subjects.id, params.id));
    });
    return NextResponse.json({ success: true });
  },
);
