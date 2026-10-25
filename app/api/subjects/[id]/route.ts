import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq, inArray } from 'drizzle-orm';
import {
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';

async function loadOwnedSubject(subjectId: string, parentId: string) {
  const [row] = await db
    .select({ subject: schema.subjects })
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
  return row?.subject ?? null;
}

// Removes the not-yet-done sessions of a subject so an archived or deleted
// subject disappears from the calendar straight away. Completed and partly
// completed sessions are kept as history.
async function removeOpenSessionsForSubject(subjectId: string) {
  await db
    .delete(schema.studySessions)
    .where(
      and(
        eq(schema.studySessions.subjectId, subjectId),
        inArray(schema.studySessions.status, ['planned', 'skipped']),
      ),
    );
}

const updateSubjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  fullMarks: z.number().int().positive().optional(),
  examWeight: z.enum(['low', 'medium', 'high']).optional(),
  orderIndex: z.number().int().optional(),
  // false = archived: kept for marks history, but skipped by plan generation.
  isActive: z.boolean().optional(),
});

export const PUT = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const existing = await loadOwnedSubject(params.id, user.id);
    if (!existing)
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });

    const body = await req.json();
    const parsed = updateSubjectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    if (Object.keys(parsed.data).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const [subject] = await db
      .update(schema.subjects)
      .set(parsed.data)
      .where(eq(schema.subjects.id, params.id))
      .returning();

    if (parsed.data.isActive === false && existing.isActive) {
      await removeOpenSessionsForSubject(params.id);
    }

    return NextResponse.json({ subject });
  },
);

// Permanent delete. Cascades to the subject's topics, spaced-repetition state
// and marks (so it also erases that subject's marks history). Completed
// sessions stay but lose their subject/topic link. The UI only offers this
// for archived subjects; archiving is the normal way to retire one.
export const DELETE = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const existing = await loadOwnedSubject(params.id, user.id);
    if (!existing)
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });

    await removeOpenSessionsForSubject(params.id);
    await db.delete(schema.subjects).where(eq(schema.subjects.id, params.id));
    return NextResponse.json({ success: true });
  },
);
