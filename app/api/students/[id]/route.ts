import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { pickExam } from '@/lib/exam-pick';
import { isExamOver } from '@/lib/plan-expiry';
import {
  MIN_SCHOOL_DAY_MINUTES,
  MIN_HOLIDAY_DAY_MINUTES,
} from '@/lib/utils/study-limits';

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
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getAuthUserId(req);
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
    // Once an exam is over its plan is of no further use, so it is deleted
    // (its sessions go with it). This runs the first time anything loads the
    // student after the exam date, and costs one extra statement only then.
    // Test marks, topic mastery and spaced-repetition history are separate
    // tables and are not touched.
    const examById = new Map(exams.map((e) => [e.id, e]));
    const expired = plans.filter((p) => {
      const e = examById.get(p.examId);
      return !!e && isExamOver(e.examDate);
    });
    if (expired.length > 0) {
      await db.delete(schema.studyPlans).where(
        inArray(
          schema.studyPlans.id,
          expired.map((p) => p.id),
        ),
      );
    }
    const livePlans = plans.filter((p) => !expired.includes(p));

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
    });
  },
);

const updateStudentSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  grade: z
    .string()
    .trim()
    .regex(/^\d{1,2}$/, 'Grade must be a number, e.g. 9')
    .refine(
      (g) => Number(g) >= 4 && Number(g) <= 10,
      'Grade must be between 4 and 10',
    )
    .optional(),
  // Optional in the request, but if sent it can't be empty or null,
  // so it can't be cleared after onboarding.
  schoolName: z
    .string()
    .trim()
    .min(3, 'School name is required')
    .max(200)
    .transform((s) => s.replace(/\s+/g, ' '))
    .optional(),
  studyDays: z.array(z.string()).min(1).optional(),
  schoolDayMinutes: z
    .number()
    .int()
    .min(
      MIN_SCHOOL_DAY_MINUTES,
      `School days need at least ${MIN_SCHOOL_DAY_MINUTES} minutes`,
    )
    .optional(),
  holidayDayMinutes: z
    .number()
    .int()
    .min(
      MIN_HOLIDAY_DAY_MINUTES,
      `Weekends and holidays need at least ${MIN_HOLIDAY_DAY_MINUTES} minutes`,
    )
    .optional(),
});

export const PUT = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const existing = await loadOwnedStudent(params.id, userId);
    if (!existing)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });

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
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getAuthUserId(req);
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
