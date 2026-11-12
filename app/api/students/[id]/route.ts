import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, desc, eq } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { pickExam } from '@/lib/exam-pick';
import { isExamOver } from '@/lib/plan-expiry';
import {
  gradeSchema,
  schoolNameSchema,
  studyDaysSchema,
} from '@/lib/validation';
import { paymentRequiredResponse } from '@/lib/billing/guard';

async function loadOwnedStudent(studentId: string, parentId: string) {
  const [student] = await db
    .select()
    .from(schema.students)
    .where(
      and(
        eq(schema.students.id, studentId),
        eq(schema.students.parentId, parentId),
      ),
    )
    .limit(1);
  return student ?? null;
}

export const GET = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    // Archived subjects are hidden unless the caller asks for them (the
    // Subjects and Test history screens do), so New exam, Log a test and
    // Settings only ever see active subjects.
    const includeArchived =
      req.nextUrl.searchParams.get('includeArchived') === '1';

    // Everything is read in ONE parallel round (it used to be four queries in
    // a row, on nearly every page). Nothing is returned unless the student
    // belongs to this parent.
    const [students, allSubjects, exams, assessmentRows, topicRows, plans] =
      await Promise.all([
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
          .from(schema.subjects)
          .where(eq(schema.subjects.studentId, params.id)),
        db
          .select()
          .from(schema.exams)
          .where(eq(schema.exams.studentId, params.id)),
        db
          .select()
          .from(schema.assessments)
          .where(eq(schema.assessments.studentId, params.id)),
        db
          .select({ topic: schema.topics })
          .from(schema.topics)
          .innerJoin(
            schema.subjects,
            eq(schema.subjects.id, schema.topics.subjectId),
          )
          .where(eq(schema.subjects.studentId, params.id)),
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

    const subjects = includeArchived
      ? allSubjects
      : allSubjects.filter((s) => s.isActive);
    const shown = new Set(subjects.map((s) => s.id));
    const topics = topicRows
      .map((r) => r.topic)
      .filter((t) => shown.has(t.subjectId));
    // The current plan is the newest one that belongs to the CURRENT exam. A
    // new exam with no plan yet has none (null), even if an old plan for a
    // finished exam still exists.
    // Once an exam is over its plan is of no further use and is never shown
    // again. (A GET never changes anything, so the row is left in place.)
    const examById = new Map(exams.map((e) => [e.id, e]));
    const livePlans = plans.filter((p) => {
      const e = examById.get(p.examId);
      return !(e && isExamOver(e.examDate));
    });

    const currentExam = pickExam(exams);
    const latestPlan = currentExam
      ? livePlans.find((p) => p.examId === currentExam.id)
      : undefined;

    return NextResponse.json({
      student,
      subjects,
      exams,
      assessments: assessmentRows,
      topics,
      latestPlan: latestPlan ?? null,
      currentExamId: currentExam?.id ?? null,
      // True once the current exam's date has passed: the pages show the
      // "start a new exam cycle / new academic session" choices.
      currentExamOver: currentExam ? isExamOver(currentExam.examDate) : false,
      // The cycle started before the last exam's results were out: the exam
      // whose marks are still to be added ("Add exam marks").
      resultsPending: (() => {
        const pending = currentExam?.resultsPendingFor
          ? exams.find((e) => e.id === currentExam.resultsPendingFor)
          : undefined;
        return pending ? { examId: pending.id, name: pending.name, examDate: pending.examDate } : null;
      })(),
    });
  },
);

const updateStudentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  grade: gradeSchema.optional(),
  // Optional in the request, but if sent it can't be empty or null,
  // so it can't be cleared after onboarding.
  schoolName: schoolNameSchema.optional(),
  studyDays: studyDaysSchema.optional(),
});

export const PUT = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const existing = await loadOwnedStudent(params.id, userId);
    if (!existing)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    const denied = paymentRequiredResponse(existing);
    if (denied) return denied;

    const body = await req.json();
    const parsed = updateStudentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const [student] = await db
      .update(schema.students)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(schema.students.id, params.id))
      .returning();

    return NextResponse.json({ student });
  },
);

// Permanently deletes the child. Every related table (exams, subjects,
// topics, marks, plans, sessions, quiz attempts, to-dos, ...) is wired with
// ON DELETE CASCADE, so removing this one row removes all of it.
export const DELETE = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const existing = await loadOwnedStudent(params.id, userId);
    if (!existing)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    await db
      .delete(schema.students)
      .where(
        and(
          eq(schema.students.id, params.id),
          eq(schema.students.parentId, userId),
        ),
      );

    return NextResponse.json({ success: true });
  },
);
