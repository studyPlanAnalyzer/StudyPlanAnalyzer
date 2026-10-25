import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import {
  estimatedConfidenceSchema,
  loadActiveEstimates,
  subjectIdsWithMarks,
} from '@/lib/estimated-confidence';

// The ONLY place an estimated confidence is read or written. A null level
// clears the estimate.
const bodySchema = z.object({
  estimates: z.array(
    z.object({
      subjectId: z.string().uuid(),
      level: estimatedConfidenceSchema.nullable(),
    }),
  ),
});

async function loadOwnedSubjectIds(studentId: string, parentId: string) {
  const [student] = await db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(
      and(
        eq(schema.students.id, studentId),
        eq(schema.students.parentId, parentId),
      ),
    )
    .limit(1);
  if (!student) return null;
  const rows = await db
    .select({ id: schema.subjects.id })
    .from(schema.subjects)
    .where(
      and(
        eq(schema.subjects.studentId, studentId),
        eq(schema.subjects.isActive, true),
      ),
    );
  return rows.map((r) => r.id);
}

export const GET = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const subjectIds = await loadOwnedSubjectIds(params.id, user.id);
    if (!subjectIds)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const [estimates, withMarks] = await Promise.all([
      loadActiveEstimates(subjectIds),
      subjectIdsWithMarks(subjectIds),
    ]);
    return NextResponse.json({
      estimates: Object.fromEntries(estimates),
      // Subjects an estimate can still be set for (no marks of any kind).
      eligibleSubjectIds: subjectIds.filter((id) => !withMarks.has(id)),
    });
  },
);

export const PUT = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const ownedIds = await loadOwnedSubjectIds(params.id, user.id);
    if (!ownedIds)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const { estimates } = parsed.data;
    const requestedIds = estimates.map((e) => e.subjectId);
    if (requestedIds.some((id) => !ownedIds.includes(id))) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    // An estimate only stands in for "no data at all".
    const withMarks = await subjectIdsWithMarks(requestedIds);
    if (withMarks.size > 0) {
      return NextResponse.json(
        {
          error:
            'Estimated confidence can only be set for subjects with no marks',
        },
        { status: 409 },
      );
    }

    await db.transaction(async (tx) => {
      const toClear = estimates.filter((e) => e.level === null);
      if (toClear.length > 0) {
        await tx.delete(schema.subjectEstimatedConfidence).where(
          inArray(
            schema.subjectEstimatedConfidence.subjectId,
            toClear.map((e) => e.subjectId),
          ),
        );
      }
      for (const e of estimates) {
        if (e.level === null) continue;
        await tx
          .insert(schema.subjectEstimatedConfidence)
          .values({ subjectId: e.subjectId, level: e.level })
          .onConflictDoUpdate({
            target: schema.subjectEstimatedConfidence.subjectId,
            set: { level: e.level, updatedAt: new Date() },
          });
      }
    });

    return NextResponse.json({ ok: true });
  },
);
