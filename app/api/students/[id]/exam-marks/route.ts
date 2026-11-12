import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { paymentRequiredResponse } from '@/lib/billing/guard';
import { saveMarks } from '@/lib/save-mark';
import { marksheetEntrySchema, marksheetProblem } from '@/lib/exam-cycle';
import { rebuildPlan } from '@/lib/plan-rebuild';
import { appToday } from '@/lib/utils/date-utils';
import { isExamOver } from '@/lib/plan-expiry';

const bodySchema = z.object({ marks: z.array(marksheetEntrySchema).min(1) });

/**
 * "Add exam marks": the results of the last exam, added after the new cycle
 * started without them ("Results not out yet"). Saved like the marksheet a
 * new cycle records: against the current exam, so the plan uses them, named
 * after the exam they came from and dated on its date, so they sit before any
 * class test taken since. Topic mastery and the SM-2 trend follow (saveMarks),
 * the pending flag is cleared and the plan is rebuilt, all in ONE transaction.
 */
export const POST = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    const { marks } = parsed.data;

    const [students, current, subjects, topics] = await Promise.all([
      db
        .select()
        .from(schema.students)
        .where(and(eq(schema.students.id, params.id), eq(schema.students.parentId, userId)))
        .limit(1),
      db
        .select({ exam: schema.exams, plan: schema.studyPlans })
        .from(schema.exams)
        .leftJoin(schema.studyPlans, eq(schema.studyPlans.examId, schema.exams.id))
        .where(and(eq(schema.exams.studentId, params.id), eq(schema.exams.isPrimary, true)))
        .limit(1),
      db
        .select({ id: schema.subjects.id })
        .from(schema.subjects)
        .where(eq(schema.subjects.studentId, params.id)),
      db
        .select({ id: schema.topics.id, subjectId: schema.topics.subjectId })
        .from(schema.topics)
        .innerJoin(schema.subjects, eq(schema.subjects.id, schema.topics.subjectId))
        .where(eq(schema.subjects.studentId, params.id)),
    ]);
    const student = students[0];
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    const denied = paymentRequiredResponse(student);
    if (denied) return denied;

    const exam = current[0]?.exam;
    const plan = current[0]?.plan ?? null;
    if (!exam?.resultsPendingFor)
      return NextResponse.json(
        { error: 'No exam results are waiting to be added.' },
        { status: 409 },
      );
    const [pending] = await db
      .select()
      .from(schema.exams)
      .where(eq(schema.exams.id, exam.resultsPendingFor))
      .limit(1);
    if (!pending)
      return NextResponse.json({ error: 'The exam these results belong to was removed.' }, { status: 409 });

    const problem = marksheetProblem(
      marks,
      new Set(subjects.map((s) => s.id)),
      new Map(topics.map((t) => [t.id, t.subjectId])),
    );
    if (problem) return NextResponse.json({ error: problem.error }, { status: problem.status });

    const planUpdated = await db.transaction(async (tx) => {
      // Locked, so a double submit can't record the marksheet twice.
      const [locked] = await tx
        .select({ pendingFor: schema.exams.resultsPendingFor })
        .from(schema.exams)
        .where(eq(schema.exams.id, exam.id))
        .for('update');
      if (!locked?.pendingFor) return null;

      const [assessment] = await tx
        .insert(schema.assessments)
        .values({
          studentId: student.id,
          examId: exam.id,
          assessmentDate: pending.examDate,
          assessmentName: `${pending.name} marksheet`,
        })
        .returning();
      await saveMarks(tx, marks.map((m) => ({ ...m, assessmentId: assessment.id })));
      await tx
        .update(schema.exams)
        .set({ resultsPendingFor: null })
        .where(eq(schema.exams.id, exam.id));

      if (!plan || isExamOver(exam.examDate)) return false;
      const rebuilt = await rebuildPlan({ plan, student, fromDate: appToday(), ex: tx });
      return rebuilt.ok;
    });
    if (planUpdated === null)
      return NextResponse.json(
        { error: 'These results were already added.' },
        { status: 409 },
      );

    return NextResponse.json({ ok: true, planUpdated }, { status: 201 });
  },
);
