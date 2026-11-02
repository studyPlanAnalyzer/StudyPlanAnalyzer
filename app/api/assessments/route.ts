import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq, inArray } from 'drizzle-orm';
import {
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from "@/lib/api/handler";
import { dateStringSchema } from '@/lib/validation';
import { paymentRequiredResponse } from '@/lib/billing/guard';

/** The student with its billing fields, if it belongs to this parent. */
async function loadOwnedStudent(studentId: string, parentId: string) {
  const [student] = await db
    .select({
      id: schema.students.id,
      paidUntil: schema.students.paidUntil,
      paymentStatus: schema.students.paymentStatus,
    })
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

const createAssessmentSchema = z.object({
  studentId: z.string().uuid(),
  examId: z.string().uuid().optional(),
  assessmentDate: dateStringSchema,
  assessmentName: z.string().min(1).max(200),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();

  const body = await req.json();
  const parsed = createAssessmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const owned = await loadOwnedStudent(parsed.data.studentId, user.id);
  if (!owned)
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const denied = paymentRequiredResponse(owned);
  if (denied) return denied;

  if (parsed.data.examId) {
    const [exam] = await db
      .select({ id: schema.exams.id })
      .from(schema.exams)
      .where(
        and(
          eq(schema.exams.id, parsed.data.examId),
          eq(schema.exams.studentId, parsed.data.studentId),
        ),
      )
      .limit(1);
    if (!exam)
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  }

  const [assessment] = await db
    .insert(schema.assessments)
    .values({ ...parsed.data, examId: parsed.data.examId ?? null })
    .returning();
  return NextResponse.json({ assessment }, { status: 201 });
});

// GET /api/assessments?studentId=...            -> plain list (unchanged)
// GET /api/assessments?studentId=...&includeMarks=1
//   -> newest first, each with its marks and the topic ids each mark is scoped to
export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();

  const studentId = req.nextUrl.searchParams.get('studentId');
  if (!studentId)
    return NextResponse.json(
      { error: 'studentId is required' },
      { status: 400 },
    );

  const owned = await loadOwnedStudent(studentId, user.id);
  if (!owned)
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const denied = paymentRequiredResponse(owned);
  if (denied) return denied;

  const assessments = await db
    .select()
    .from(schema.assessments)
    .where(eq(schema.assessments.studentId, studentId));

  if (req.nextUrl.searchParams.get('includeMarks') !== '1') {
    return NextResponse.json({ assessments });
  }

  const assessmentIds = assessments.map((a) => a.id);
  const markRows =
    assessmentIds.length > 0
      ? await db
          .select()
          .from(schema.marks)
          .where(inArray(schema.marks.assessmentId, assessmentIds))
      : [];
  const markIds = markRows.map((m) => m.id);
  const linkRows =
    markIds.length > 0
      ? await db
          .select()
          .from(schema.markTopics)
          .where(inArray(schema.markTopics.markId, markIds))
      : [];

  const topicIdsByMark = new Map<string, string[]>();
  for (const link of linkRows) {
    const list = topicIdsByMark.get(link.markId) ?? [];
    list.push(link.topicId);
    topicIdsByMark.set(link.markId, list);
  }

  const withMarks = assessments
    .map((a) => ({
      ...a,
      marks: markRows
        .filter((m) => m.assessmentId === a.id)
        .map((m) => ({ ...m, topicIds: topicIdsByMark.get(m.id) ?? [] })),
    }))
    .sort((a, b) =>
      a.assessmentDate < b.assessmentDate
        ? 1
        : a.assessmentDate > b.assessmentDate
          ? -1
          : 0,
    );

  return NextResponse.json({ assessments: withMarks });
});
