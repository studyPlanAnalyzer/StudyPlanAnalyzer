import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { BUFFER_WEEK_DAYS } from '@/lib/utils/study-limits';
import { createPlanForExam } from '@/lib/plan-create';
import { and, eq } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { addDays, appToday, fromDateString, toDateString } from '@/lib/utils/date-utils';
import { isExamOver } from '@/lib/plan-expiry';
import { withErrorHandling } from '@/lib/api/handler';
import { paymentRequiredResponse } from '@/lib/billing/guard';

export const maxDuration = 60;

const generatePlanSchema = z.object({
  studentId: z.string().uuid(),
  examId: z.string().uuid(),
  useBufferWeek: z.boolean().optional().default(false),
});


export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = await getAuthUserId(req);
  if (!userId) return unauthorizedResponse();

  const body = await req.json();
  const parsed = generatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { studentId, examId, useBufferWeek } = parsed.data;

  // Student, exam and any existing plan in one parallel round (three queries
  // in a row before). Nothing is returned unless the student is this parent's.
  const [students, exams, existingPlans] = await Promise.all([
    db
      .select()
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
      .from(schema.exams)
      .where(
        and(eq(schema.exams.id, examId), eq(schema.exams.studentId, studentId)),
      )
      .limit(1),
    db
      .select({ id: schema.studyPlans.id })
      .from(schema.studyPlans)
      .where(eq(schema.studyPlans.examId, examId))
      .limit(1),
  ]);
  const student = students[0];
  if (!student)
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const denied = paymentRequiredResponse(student);
  if (denied) return denied;
  const exam = exams[0];
  if (!exam)
    return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  const existingPlan = existingPlans[0];

  const examDate = fromDateString(exam.examDate);
  if (isExamOver(exam.examDate)) {
    return NextResponse.json(
      { error: 'Exam date must be in the future' },
      { status: 400 },
    );
  }

  const scheduleEndDate = useBufferWeek
    ? addDays(examDate, -BUFFER_WEEK_DAYS)
    : examDate;
  if (scheduleEndDate.getTime() <= appToday().getTime()) {
    return NextResponse.json(
      {
        error:
          "Not enough time before the exam to leave a consolidation week — choose 'use the full period' instead",
      },
      { status: 400 },
    );
  }

  if (existingPlan) return planExists(existingPlan.id);

  // A plan exists from the start, with or without topics yet: they join it
  // as they are added. One plan per exam is enforced by a unique index, so
  // two requests at once (a double click) can't both create one: the second
  // gets the same 409.
  let plan;
  try {
    plan = await db.transaction((tx) => createPlanForExam({ student, exam, useBufferWeek, ex: tx }));
  } catch (err: any) {
    const code = err?.code ?? err?.cause?.code;
    if (code !== '23505') throw err;
    const [winner] = await db
      .select({ id: schema.studyPlans.id })
      .from(schema.studyPlans)
      .where(eq(schema.studyPlans.examId, examId))
      .limit(1);
    if (!winner) throw err;
    return planExists(winner.id);
  }
  if (!plan)
    return NextResponse.json({ error: 'Exam date must be in the future' }, { status: 400 });

  return NextResponse.json(
    { plan, scheduleEndDate: toDateString(scheduleEndDate) },
    { status: 201 },
  );
});

function planExists(planId: string) {
  return NextResponse.json(
    {
      error:
        'A plan already exists for this exam. Use regenerate to rebuild it instead.',
      planId,
    },
    { status: 409 },
  );
}
