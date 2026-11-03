import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { eq, desc, sql } from 'drizzle-orm';
import {
  getAuthUserId,
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { billingInfoFor } from '@/lib/billing/pricing';
import {
  holidayDayMinutesSchema,
  schoolDayMinutesSchema,
  gradeSchema,
  schoolNameSchema,
  studyDaysSchema,
} from '@/lib/validation';

const createStudentSchema = z.object({
  name: z.string().min(1).max(200),
  grade: gradeSchema,
  schoolName: schoolNameSchema,
  studyDays: studyDaysSchema.default(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sun']),
  schoolDayMinutes: schoolDayMinutesSchema.default(45),
  holidayDayMinutes: holidayDayMinutesSchema.default(90),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();

  const body = await req.json(); // malformed JSON -> SyntaxError -> 400 via wrapper
  const parsed = createStudentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Please check the details entered and try again.',
        code: 'VALIDATION',
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const [student] = await db
    .insert(schema.students)
    .values({ ...parsed.data, parentId: user.id })
    .returning();

  return NextResponse.json({ student }, { status: 201 });
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const userId = await getAuthUserId(req);
  if (!userId) return unauthorizedResponse();

  // Three queries for ALL the children, run together. It used to be one query
  // for the children, then three more for each child.
  const [studentRows, subjectCounts, examRows] = await Promise.all([
    db
      .select()
      .from(schema.students)
      .where(eq(schema.students.parentId, userId))
      .orderBy(desc(schema.students.createdAt)),
    db
      .select({
        studentId: schema.subjects.studentId,
        count: sql<number>`count(*)::int`,
      })
      .from(schema.subjects)
      .innerJoin(
        schema.students,
        eq(schema.students.id, schema.subjects.studentId),
      )
      .where(eq(schema.students.parentId, userId))
      .groupBy(schema.subjects.studentId),
    db
      .select({ exam: schema.exams })
      .from(schema.exams)
      .innerJoin(
        schema.students,
        eq(schema.students.id, schema.exams.studentId),
      )
      .where(eq(schema.students.parentId, userId))
      .orderBy(desc(schema.exams.isPrimary)),
  ]);

  const subjectsByStudent = new Map(
    subjectCounts.map((r) => [r.studentId, r.count]),
  );
  const examsByStudent = new Map<string, (typeof examRows)[number]['exam'][]>();
  for (const { exam } of examRows) {
    const list = examsByStudent.get(exam.studentId);
    if (list) list.push(exam);
    else examsByStudent.set(exam.studentId, [exam]);
  }

  const students = studentRows.map((student) => {
    const exams = examsByStudent.get(student.id) ?? [];
    return {
      ...student,
      // Paid-up state, dates and prices for this child (see lib/billing).
      billing: billingInfoFor(studentRows, student.id),
      subjectsCount: subjectsByStudent.get(student.id) ?? 0,
      examsCount: exams.length,
      // The primary exam if there is one (they sort first).
      nextExam: exams[0] ?? null,
    };
  });

  return NextResponse.json({ students });
});
