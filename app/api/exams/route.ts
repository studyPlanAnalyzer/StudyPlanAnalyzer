import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { toDateString, todayUTC } from '@/lib/utils/date-utils';
import { withErrorHandling } from '@/lib/api/handler';

const createExamSchema = z.object({
  studentId: z.string().uuid(),
  name: z.string().min(1).max(200),
  examDate: z.string().min(1), // YYYY-MM-DD
  isPrimary: z.boolean().optional().default(true),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  // The id comes from the verified token: no database round trip for auth.
  const userId = getAuthUserId(req);
  if (!userId) return unauthorizedResponse();

  const body = await req.json();
  const parsed = createExamSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // The ownership check and the current primary exam are read together
  // (two queries in a row before). Nothing is changed unless the student
  // belongs to this parent.
  const [owned, primaries] = await Promise.all([
    db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.id, parsed.data.studentId),
          eq(schema.students.parentId, userId),
        ),
      )
      .limit(1),
    parsed.data.isPrimary
      ? db
          .select()
          .from(schema.exams)
          .where(
            and(
              eq(schema.exams.studentId, parsed.data.studentId),
              eq(schema.exams.isPrimary, true),
            ),
          )
          .limit(1)
      : Promise.resolve([]),
  ]);
  if (!owned[0])
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  // Only one exam can be "primary" (the one plans generate against) at a
  // time, so starting a new exam cycle automatically retires the old one -
  // but only once the old one has actually concluded.
  if (parsed.data.isPrimary) {
    const currentPrimary = primaries[0];
    const today = toDateString(todayUTC());
    if (currentPrimary && currentPrimary.examDate > today) {
      return NextResponse.json(
        {
          error: `There's already an active exam cycle ("${currentPrimary.name}", ending ${currentPrimary.examDate}) that hasn't happened yet. A new exam cycle can only start once the current one is over. If you need this exam to end sooner, go to Settings and edit the exam date there instead of starting a new cycle.`,
        },
        { status: 409 },
      );
    }
  }

  // Retiring the old primary and adding the new exam happen together.
  const exam = await db.transaction(async (tx) => {
    if (parsed.data.isPrimary) {
      await tx
        .update(schema.exams)
        .set({ isPrimary: false })
        .where(eq(schema.exams.studentId, parsed.data.studentId));
    }
    const [created] = await tx
      .insert(schema.exams)
      .values(parsed.data)
      .returning();
    return created;
  });
  return NextResponse.json({ exam }, { status: 201 });
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const userId = getAuthUserId(req);
  if (!userId) return unauthorizedResponse();

  const studentId = req.nextUrl.searchParams.get('studentId');
  if (!studentId)
    return NextResponse.json(
      { error: 'studentId is required' },
      { status: 400 },
    );

  // One query: the exams, joined to the student so ownership is checked in
  // the same trip. A student that isn't this parent's gives no rows, which
  // is reported as not found (an empty list for an owned student is valid, so
  // the student is read alongside).
  const [owned, rows] = await Promise.all([
    db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.id, studentId),
          eq(schema.students.parentId, userId),
        ),
      )
      .limit(1),
    db
      .select({ exam: schema.exams })
      .from(schema.exams)
      .innerJoin(
        schema.students,
        eq(schema.students.id, schema.exams.studentId),
      )
      .where(
        and(
          eq(schema.exams.studentId, studentId),
          eq(schema.students.parentId, userId),
        ),
      ),
  ]);
  if (!owned[0])
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  return NextResponse.json({ exams: rows.map((r) => r.exam) });
});
