import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq, inArray } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { saveMarks } from '@/lib/save-mark';
import { withErrorHandling } from '@/lib/api/handler';

const bodySchema = z.object({
  examId: z.string().uuid().optional(),
  assessmentName: z.string().trim().min(1),
  assessmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  marks: z
    .array(
      z.object({
        subjectId: z.string().uuid(),
        obtainedMarks: z.number().int().min(0),
        fullMarks: z.number().int().positive(),
        confidenceLevel: z.enum(['low', 'medium', 'high']).optional(),
        topicIds: z.array(z.string().uuid()).default([]),
      }),
    )
    .min(1),
});

/** Logs a whole test (the assessment and every mark) in one transaction. */
export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { examId, assessmentName, assessmentDate, marks } = parsed.data;

    if (marks.some((m) => m.obtainedMarks > m.fullMarks)) {
      return NextResponse.json(
        { error: 'obtainedMarks cannot exceed fullMarks' },
        { status: 400 },
      );
    }

    // Ownership, exam, subjects and topics are all checked in ONE parallel round
    // (it used to be four queries in a row). Nothing is saved unless every check
    // passes.
    const subjectIds = Array.from(new Set(marks.map((m) => m.subjectId)));
    const [students, exams, subjectRows, topicRows] = await Promise.all([
      db
        .select({ id: schema.students.id })
        .from(schema.students)
        .where(
          and(
            eq(schema.students.id, params.id),
            eq(schema.students.parentId, userId),
          ),
        )
        .limit(1),
      examId
        ? db
            .select({ id: schema.exams.id })
            .from(schema.exams)
            .where(
              and(
                eq(schema.exams.id, examId),
                eq(schema.exams.studentId, params.id),
              ),
            )
            .limit(1)
        : Promise.resolve([] as { id: string }[]),
      db
        .select({ id: schema.subjects.id })
        .from(schema.subjects)
        .where(
          and(
            inArray(schema.subjects.id, subjectIds),
            eq(schema.subjects.studentId, params.id),
          ),
        ),
      db
        .select({ id: schema.topics.id, subjectId: schema.topics.subjectId })
        .from(schema.topics)
        .where(inArray(schema.topics.subjectId, subjectIds)),
    ]);
    const student = students[0];
    if (!student)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    if (examId && exams.length === 0)
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
    if (subjectRows.length !== subjectIds.length)
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });

    const subjectOfTopic = new Map(topicRows.map((t) => [t.id, t.subjectId]));
    for (const m of marks) {
      for (const id of m.topicIds) {
        if (subjectOfTopic.get(id) !== m.subjectId) {
          return NextResponse.json(
            { error: 'Selected topics must belong to the chosen subject' },
            { status: 400 },
          );
        }
      }
    }

    // The test and all its marks, saved together in a fixed number of statements.
    const assessment = await db.transaction(async (tx) => {
      const [a] = await tx
        .insert(schema.assessments)
        .values({
          studentId: student.id,
          examId,
          assessmentDate,
          assessmentName,
        })
        .returning();
      await saveMarks(
        tx,
        marks.map((m) => ({ ...m, assessmentId: a.id })),
      );
      return a;
    });

    return NextResponse.json(
      { assessment, marksSaved: marks.length },
      { status: 201 },
    );
  },
);
