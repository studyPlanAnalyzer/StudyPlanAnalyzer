import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { randomUUID } from 'crypto';
import { insertTopicRows } from '@/lib/topic-leaves';
import { createPlanForExam } from '@/lib/plan-create';
import { ALL_DAYS, sm2Days, spreadLearnFrom } from '@/lib/utils/revision-days';
import {
  subjectNameSchema,
  findNameClash,
  clashMessage,
} from '@/lib/subject-name';
import { toDateString, appToday } from '@/lib/utils/date-utils';
import { paymentRequiredResponse } from '@/lib/billing/guard';
import {
  dateStringSchema,
  examDateProblem,
  gradeSchema,
} from '@/lib/validation';

const level = z.enum(['low', 'medium', 'high']);

const bodySchema = z.object({
  // The new year usually means a new grade.
  grade: gradeSchema,
  exam: z.object({
    name: z.string().trim().min(1).max(200),
    examDate: dateStringSchema,
  }),
  subjects: z
    .array(
      z.object({
        name: subjectNameSchema,
        examWeight: level,
        // Topics already taught: they start over the next days, 4 a day.
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
 * its study plan are saved, all in ONE transaction. If anything fails,
 * nothing is deleted and nothing is saved.
 */
export const POST = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const [student] = await db
      .select()
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
    const denied = paymentRequiredResponse(student);
    if (denied) return denied;

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { grade, exam: examIn, subjects: newSubjects } = parsed.data;

    const examDateError = examDateProblem(examIn.examDate);
    if (examDateError)
      return NextResponse.json({ error: examDateError }, { status: 400 });

    // Each subject can only be listed once.
    const clash = findNameClash(
      [],
      newSubjects.map((s) => s.name),
    );
    if (clash)
      return NextResponse.json({ error: clashMessage(clash) }, { status: 400 });

    const exam = await db.transaction(async (tx) => {
      // Only one exam is active at a time: a new session starts after the last
      // exam. exam_date is YYYY-MM-DD, so string comparison orders dates.
      const today = toDateString(appToday());
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

      // All subjects and topics in a few statements in total. A new year
      // has nothing from earlier exams, so every day is an SM-2 day.
      const subjectRows = newSubjects.map((s, i) => ({
        id: randomUUID(),
        studentId: student.id,
        name: s.name,
        examWeight: s.examWeight,
        orderIndex: i,
      }));
      await tx.insert(schema.subjects).values(subjectRows);
      const taught = newSubjects.flatMap((s, i) =>
        s.topics.map((t) => ({ subjectId: subjectRows[i].id, ...t })),
      );
      const learnFrom = spreadLearnFrom(taught.length, today, sm2Days(student.sundayRevision, false));
      await insertTopicRows(
        tx,
        taught.map((t, k) => ({
          subjectId: t.subjectId,
          parentTopicId: null,
          name: t.name,
          difficultyRating: t.difficultyRating,
          examId: created.id,
          examName: created.name,
          learnFrom: learnFrom[k],
        })),
      );
      await tx
        .update(schema.students)
        .set({ studyDays: [...ALL_DAYS] })
        .where(eq(schema.students.id, student.id));
      await createPlanForExam({ student, exam: created, ex: tx });
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
