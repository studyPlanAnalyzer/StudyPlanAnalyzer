import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { toDateString, todayUTC } from '@/lib/utils/date-utils';
import { withErrorHandling } from '@/lib/api/handler';

const updateExamSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  examDate: z.string().min(1).optional(), // YYYY-MM-DD
  isPrimary: z.boolean().optional(),
});

export const PUT = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    // The id comes from the verified token: no database round trip for auth.
    const userId = getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const body = await req.json();
    const parsed = updateExamSchema.safeParse(body);

    // The exam, its owner check, and the student's current primary exam are
    // read together in one round (it was three queries in a row).
    // Nothing is returned or changed unless the exam belongs to this parent.
    const [owned, primaries] = await Promise.all([
      db
        .select({ exam: schema.exams })
        .from(schema.exams)
        .innerJoin(
          schema.students,
          eq(schema.students.id, schema.exams.studentId),
        )
        .where(
          and(
            eq(schema.exams.id, params.id),
            eq(schema.students.parentId, userId),
          ),
        )
        .limit(1),
      db
        .select({ primary: schema.exams })
        .from(schema.exams)
        .where(
          and(
            eq(schema.exams.isPrimary, true),
            eq(
              schema.exams.studentId,
              db
                .select({ studentId: schema.exams.studentId })
                .from(schema.exams)
                .where(eq(schema.exams.id, params.id))
                .limit(1),
            ),
          ),
        )
        .limit(1),
    ]);
    const existing = owned[0]?.exam;
    if (!existing)
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 });

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const today = toDateString(todayUTC());

    // An exam that is over stays over: its date can't be moved and it can't
    // be made the active exam again. The way forward is a new exam cycle or a
    // new academic session. (Renaming is still allowed.)
    if (
      existing.examDate <= today &&
      (parsed.data.examDate !== undefined || parsed.data.isPrimary)
    ) {
      return NextResponse.json(
        {
          error:
            'This exam is over. Start a new exam cycle or a new academic session instead.',
        },
        { status: 400 },
      );
    }

    // Every other place an exam date gets entered requires it to be in the
    // future.
    if (parsed.data.examDate && parsed.data.examDate <= today) {
      return NextResponse.json(
        { error: 'Exam date must be in the future' },
        { status: 400 },
      );
    }

    // Same "current cycle must be over" rule as POST /api/exams, only when
    // this PUT switches the primary exam to a *different* exam.
    const currentPrimary = primaries[0]?.primary;
    if (
      parsed.data.isPrimary &&
      currentPrimary &&
      currentPrimary.id !== existing.id &&
      currentPrimary.examDate > today
    ) {
      return NextResponse.json(
        {
          error: `There's already an active exam cycle ("${currentPrimary.name}", ending ${currentPrimary.examDate}) that hasn't happened yet. A new exam cycle can only start once the current one is over.`,
        },
        { status: 409 },
      );
    }

    // Retiring the old primary and saving this change happen together.
    const exam = await db.transaction(async (tx) => {
      if (parsed.data.isPrimary) {
        await tx
          .update(schema.exams)
          .set({ isPrimary: false })
          .where(eq(schema.exams.studentId, existing.studentId));
      }
      const [updated] = await tx
        .update(schema.exams)
        .set(parsed.data)
        .where(eq(schema.exams.id, params.id))
        .returning();
      return updated;
    });

    return NextResponse.json({ exam });
  },
);
