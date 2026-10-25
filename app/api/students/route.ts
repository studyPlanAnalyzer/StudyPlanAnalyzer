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
import {
  MIN_SCHOOL_DAY_MINUTES,
  MIN_HOLIDAY_DAY_MINUTES,
} from '@/lib/utils/study-limits';

const createStudentSchema = z.object({
  name: z.string().min(1).max(200),
  grade: z
    .string()
    .trim()
    .regex(/^\d{1,2}$/, 'Grade must be a number, e.g. 9')
    .refine(
      (g) => Number(g) >= 4 && Number(g) <= 10,
      'Grade must be between 4 and 10',
    ),
  schoolName: z
    .string()
    .trim()
    .min(3, 'School name is required')
    .max(200)
    .transform((s) => s.replace(/\s+/g, ' ')),
  studyDays: z
    .array(z.string())
    .min(1)
    .default(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sun']),
  schoolDayMinutes: z
    .number()
    .int()
    .min(
      MIN_SCHOOL_DAY_MINUTES,
      `School days need at least ${MIN_SCHOOL_DAY_MINUTES} minutes`,
    )
    .default(45),
  holidayDayMinutes: z
    .number()
    .int()
    .min(
      MIN_HOLIDAY_DAY_MINUTES,
      `Weekends and holidays need at least ${MIN_HOLIDAY_DAY_MINUTES} minutes`,
    )
    .default(90),
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
  const userId = getAuthUserId(req);
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
      subjectsCount: subjectsByStudent.get(student.id) ?? 0,
      examsCount: exams.length,
      // The primary exam if there is one (they sort first).
      nextExam: exams[0] ?? null,
    };
  });

  return NextResponse.json({ students });
});
