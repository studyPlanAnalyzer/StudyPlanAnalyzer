import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { randomUUID } from 'crypto';
import { insertTopicRows } from '@/lib/topic-leaves';
import { fromDateString, toDateString, todayUTC } from '@/lib/utils/date-utils';

const level = z.enum(['low', 'medium', 'high']);

const bodySchema = z.object({
  // The new year usually means a new grade.
  grade: z.string().regex(/^([4-9]|10)$/, 'Grade must be 4 to 10'),
  exam: z.object({
    name: z.string().trim().min(1).max(200),
    examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  subjects: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        examWeight: level,
        estimatedConfidence: level,
        topics: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(200),
              difficultyRating: z.number().int().min(1).max(5).default(2),
            }),
          )
          .default([]),
      }),
    )
    .min(1),
});

/**
 * Starts a new academic session for an existing child. A new session is a
 * fresh start: everything from the old one (subjects, topics, test history,
 * exams and study plans) is deleted, and the new exam, subjects, topics and
 * estimates are saved, all in ONE transaction. If anything fails, nothing is
 * deleted and nothing is saved.
 */
export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const [student] = await db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(
        and(
          eq(schema.students.id, params.id),
          eq(schema.students.parentId, userId),
        ),
      )
      .limit(1);
    if (!student)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { grade, exam: examIn, subjects: newSubjects } = parsed.data;

    if (fromDateString(examIn.examDate).getTime() <= Date.now()) {
      return NextResponse.json(
        { error: 'Exam date must be in the future' },
        { status: 400 },
      );
    }

    // Each subject can only be listed once.
    const seen = new Set<string>();
    for (const s of newSubjects) {
      const key = s.name.toLowerCase();
      if (seen.has(key))
        return NextResponse.json(
          {
            error: `${s.name} is added twice. Each subject can only be listed once.`,
          },
          { status: 400 },
        );
      seen.add(key);
    }

    const exam = await db.transaction(async (tx) => {
      // Only one exam is active at a time: a new session starts after the last
      // exam. exam_date is YYYY-MM-DD, so string comparison orders dates.
      const today = toDateString(todayUTC());
      const current = await tx
        .select({ examDate: schema.exams.examDate })
        .from(schema.exams)
        .where(
          and(
            eq(schema.exams.studentId, student.id),
            eq(schema.exams.isPrimary, true),
          ),
        );
      if (current.some((e) => e.examDate > today)) return null;

      // Clear the old session. Deleting the exams also deletes their study plans
      // and sessions; subjects take their topics, marks, SM-2 state and
      // estimates with them; tests are removed explicitly because they only
      // loosely reference their exam.
      await tx
        .delete(schema.assessments)
        .where(eq(schema.assessments.studentId, student.id));
      await tx
        .delete(schema.exams)
        .where(eq(schema.exams.studentId, student.id));
      await tx
        .delete(schema.subjects)
        .where(eq(schema.subjects.studentId, student.id));

      await tx
        .update(schema.students)
        .set({ grade })
        .where(eq(schema.students.id, student.id));

      const [created] = await tx
        .insert(schema.exams)
        .values({
          studentId: student.id,
          name: examIn.name,
          examDate: examIn.examDate,
          isPrimary: true,
        })
        .returning();

      // All subjects, estimates and topics in four statements in total.
      const subjectRows = newSubjects.map((s, i) => ({
        id: randomUUID(),
        studentId: student.id,
        name: s.name,
        examWeight: s.examWeight,
        orderIndex: i,
      }));
      await tx.insert(schema.subjects).values(subjectRows);
      await tx.insert(schema.subjectEstimatedConfidence).values(
        newSubjects.map((s, i) => ({
          subjectId: subjectRows[i].id,
          level: s.estimatedConfidence,
        })),
      );
      await insertTopicRows(
        tx,
        newSubjects.flatMap((s, i) =>
          s.topics.map((t) => ({
            subjectId: subjectRows[i].id,
            parentTopicId: null,
            name: t.name,
            difficultyRating: t.difficultyRating,
          })),
        ),
      );
      return created;
    });

    if (!exam) {
      return NextResponse.json(
        {
          error:
            'The current exam is still active. A new session can start once it is over.',
        },
        { status: 409 },
      );
    }
    return NextResponse.json({ exam }, { status: 201 });
  },
);
