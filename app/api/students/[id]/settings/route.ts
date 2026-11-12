import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { createPlanForExam } from '@/lib/plan-create';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import {
  dateStringSchema,
  examDateProblem,
} from '@/lib/validation';
import { pickExam } from '@/lib/exam-pick';
import { isExamOver } from '@/lib/plan-expiry';
import { rebuildPlan } from '@/lib/plan-rebuild';
import { appToday } from '@/lib/utils/date-utils';
import { paymentRequiredResponse } from '@/lib/billing/guard';

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

const bodySchema = z.object({
  // Saturday is always a revision day; this says whether Sunday is one too.
  sundayRevision: z.boolean(),
  examDate: dateStringSchema.optional(),
  // Buffer-week choice. Left out, the existing plan keeps its own setting.
  useBufferWeek: z.boolean().optional(),
});

/**
 * Saves the planning inputs (Sunday as a revision day, exam date, buffer
 * week) and builds
 * or rebuilds the study plan from them, all in ONE transaction. If the plan
 * can't be built, nothing is saved.
 */
export const PUT = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { sundayRevision, examDate, useBufferWeek } = parsed.data;

    // The student, exams and plans are read together, before the transaction,
    // so it holds only writes. Nothing happens unless the student belongs to
    // this parent.
    const [students, exams, plans] = await Promise.all([
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
        .select()
        .from(schema.exams)
        .where(eq(schema.exams.studentId, params.id)),
      // All plans, newest first. The one to use is picked below, by exam.
      db
        .select()
        .from(schema.studyPlans)
        .where(eq(schema.studyPlans.studentId, params.id))
        .orderBy(desc(schema.studyPlans.generatedAt)),
    ]);
    const student = students[0];
    if (!student)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    const denied = paymentRequiredResponse(student);
    if (denied) return denied;

    // Choose the exam first, then the newest plan that belongs to THAT exam.
    // A new exam with no plan falls through to "build the first plan" instead
    // of rebuilding a stale plan that points at an old exam.
    const chosenExam = pickExam(exams);
    const plan = chosenExam
      ? plans.find((p) => p.examId === chosenExam.id)
      : undefined;

    // Once the exam is over, its settings and date are closed: the way
    // forward is a new exam cycle or a new academic session. (A moved date
    // can't bring a finished exam back.)
    if (chosenExam && isExamOver(chosenExam.examDate)) {
      return NextResponse.json(
        {
          error:
            'This exam is over. Start a new exam cycle or a new academic session instead. Nothing was saved',
        },
        { status: 400 },
      );
    }

    try {
      const planId = await db.transaction(async (tx) => {
        const [updatedStudent] = await tx
          .update(schema.students)
          .set({
            sundayRevision,
            updatedAt: new Date(),
          })
          .where(eq(schema.students.id, student.id))
          .returning();

        let exam = chosenExam;

        if (exam && examDate && examDate !== exam.examDate) {
          const examDateError = examDateProblem(examDate);
          if (examDateError) throw new SaveError(examDateError, 400);
          const [moved] = await tx
            .update(schema.exams)
            .set({ examDate })
            .where(eq(schema.exams.id, exam.id))
            .returning();
          exam = moved;
        }

        // Existing plan for this exam: rebuild it from today with the new
        // settings.
        if (plan) {
          const result = await rebuildPlan({
            plan,
            student: updatedStudent,
            fromDate: appToday(),
            useBufferWeek,
            ex: tx,
          });
          if (!result.ok) throw new SaveError(result.error, result.status);
          return plan.id;
        }

        // No exam yet: only the preferences are saved.
        if (!exam) return null;

        // No plan for this exam yet: build the first one.
        if (isExamOver(exam.examDate))
          throw new SaveError('Exam date must be in the future', 400);
        const created = await createPlanForExam({
          student: updatedStudent,
          exam,
          useBufferWeek: useBufferWeek ?? false,
          ex: tx,
        });
        if (!created) throw new SaveError('Exam date must be in the future', 400);
        return created.id;
      });

      return NextResponse.json({ planId });
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
