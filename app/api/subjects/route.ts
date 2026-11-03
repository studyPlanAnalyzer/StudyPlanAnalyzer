import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import {
  subjectNameSchema,
  findNameClash,
  clashMessage,
} from '@/lib/subject-name';
import { paymentRequiredResponse } from '@/lib/billing/guard';
import { fullMarksSchema } from '@/lib/validation';

const createSubjectSchema = z.object({
  studentId: z.string().uuid(),
  name: subjectNameSchema,
  fullMarks: fullMarksSchema.optional().default(100),
  examWeight: z.enum(['low', 'medium', 'high']).optional().default('medium'),
  orderIndex: z.number().int().optional().default(0),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = await getAuthUserId(req);
  if (!userId) return unauthorizedResponse();

  const body = await req.json();
  const parsed = createSubjectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Ownership and the child's existing subject names are read together.
  // Nothing is returned or saved unless the student belongs to this parent.
  const [owned, existing] = await Promise.all([
    db
      .select({
        id: schema.students.id,
        paidUntil: schema.students.paidUntil,
        paymentStatus: schema.students.paymentStatus,
      })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.id, parsed.data.studentId),
          eq(schema.students.parentId, userId),
        ),
      )
      .limit(1),
    db
      .select({ name: schema.subjects.name })
      .from(schema.subjects)
      .where(eq(schema.subjects.studentId, parsed.data.studentId)),
  ]);
  if (!owned[0])
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const denied = paymentRequiredResponse(owned[0]);
  if (denied) return denied;

  // No two subjects (active or archived) may be the same subject.
  const clash = findNameClash(
    existing.map((s) => s.name),
    [parsed.data.name],
  );
  if (clash)
    return NextResponse.json({ error: clashMessage(clash) }, { status: 400 });

  const [subject] = await db
    .insert(schema.subjects)
    .values(parsed.data)
    .returning();
  return NextResponse.json({ subject }, { status: 201 });
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const userId = await getAuthUserId(req);
  if (!userId) return unauthorizedResponse();

  const studentId = req.nextUrl.searchParams.get('studentId');
  if (!studentId)
    return NextResponse.json(
      { error: 'studentId is required' },
      { status: 400 },
    );

  // The subjects and the ownership check in one round.
  const [owned, subjects] = await Promise.all([
    db
      .select({
        id: schema.students.id,
        paidUntil: schema.students.paidUntil,
        paymentStatus: schema.students.paymentStatus,
      })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.id, studentId),
          eq(schema.students.parentId, userId),
        ),
      )
      .limit(1),
    db
      .select()
      .from(schema.subjects)
      .where(eq(schema.subjects.studentId, studentId)),
  ]);
  if (!owned[0])
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const denied = paymentRequiredResponse(owned[0]);
  if (denied) return denied;
  return NextResponse.json({ subjects });
});
