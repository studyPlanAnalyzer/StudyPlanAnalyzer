import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, desc, eq } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { toDateString, appToday } from '@/lib/utils/date-utils';
import { withErrorHandling } from '@/lib/api/handler';
import { paymentRequiredResponse } from '@/lib/billing/guard';
import { dateStringSchema, examDateProblem } from '@/lib/validation';
import { rebuildPlan } from '@/lib/plan-rebuild';

export const maxDuration = 60;

// A failure that must undo the whole save, with the status to report.
class SaveError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const updateExamSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  examDate: dateStringSchema.optional(),
  isPrimary: z.boolean().optional(),
});

export const PUT = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const body = await req.json();
    const parsed = updateExamSchema.safeParse(body);

    // The exam, its owner check, and the student's current primary exam are
    // read together in one round (it was three queries in a row).
    // Nothing is returned or changed unless the exam belongs to this parent.
    const [owned, primaries] = await Promise.all([
      db
        .select({ exam: schema.exams, student: schema.students })
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
    const denied = paymentRequiredResponse(owned[0].student);
    if (denied) return denied;

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const today = toDateString(appToday());

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

    // The same date rule as every other place an exam date is entered.
    const examDateError =
      parsed.data.examDate !== undefined
        ? examDateProblem(parsed.data.examDate)
        : null;
    if (examDateError)
      return NextResponse.json({ error: examDateError }, { status: 400 });

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

    const dateMoved =
      parsed.data.examDate !== undefined &&
      parsed.data.examDate !== existing.examDate;

    // Retiring the old primary, saving this change and (when the date moved)
    // rebuilding the exam's plan around the new date happen together: if the
    // plan can't be rebuilt, nothing is saved.
    try {
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

        if (dateMoved) {
          const [plan] = await tx
            .select()
            .from(schema.studyPlans)
            .where(eq(schema.studyPlans.examId, existing.id))
            .orderBy(desc(schema.studyPlans.generatedAt))
            .limit(1);
          if (plan) {
            const result = await rebuildPlan({
              plan,
              student: owned[0].student,
              fromDate: appToday(),
              ex: tx,
            });
            if (!result.ok) throw new SaveError(result.error, result.status);
          }
        }
        return updated;
      });
      return NextResponse.json({ exam });
    } catch (err) {
      if (err instanceof SaveError)
        return NextResponse.json(
          { error: `${err.message}. Nothing was saved.` },
          { status: err.status },
        );
      throw err;
    }
  },
);
