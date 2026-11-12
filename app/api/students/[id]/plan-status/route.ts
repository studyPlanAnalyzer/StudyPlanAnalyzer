import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { paymentRequiredResponse } from '@/lib/billing/guard';
import { pickExam } from '@/lib/exam-pick';
import { isExamOver } from '@/lib/plan-expiry';
import { loadPlanStatus } from '@/lib/plan-status';
import { todayKey } from '@/lib/utils/date-utils';

/**
 * The parent dashboard's status for one child: pace against what the plan
 * needs (null without a live plan), and the exam whose results are still to
 * be added, if any. Read only: the plan isn't rebuilt here, and the numbers
 * read the same before and after the day's catch-up (see loadPlanStatus).
 */
export const GET = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const [students, exams, plans] = await Promise.all([
      db
        .select()
        .from(schema.students)
        .where(and(eq(schema.students.id, params.id), eq(schema.students.parentId, userId)))
        .limit(1),
      db.select().from(schema.exams).where(eq(schema.exams.studentId, params.id)),
      db
        .select()
        .from(schema.studyPlans)
        .where(eq(schema.studyPlans.studentId, params.id))
        .orderBy(desc(schema.studyPlans.generatedAt)),
    ]);
    const student = students[0];
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    const denied = paymentRequiredResponse(student);
    if (denied) return denied;

    const exam = pickExam(exams);
    const plan =
      exam && !isExamOver(exam.examDate) ? plans.find((p) => p.examId === exam.id) : undefined;
    const status =
      exam && plan
        ? await loadPlanStatus({
            studentId: student.id,
            sundayRevision: student.sundayRevision,
            plan,
            examDate: exam.examDate,
            todayKey: todayKey(),
          })
        : null;
    const pending = exam?.resultsPendingFor
      ? exams.find((e) => e.id === exam.resultsPendingFor)
      : undefined;

    return NextResponse.json({
      status,
      resultsPending: pending ? { examId: pending.id, name: pending.name } : null,
    });
  },
);
