import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import {
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { insertTopicRows } from '@/lib/topic-leaves';
import { createPlanForExam } from '@/lib/plan-create';
import { ALL_DAYS, sm2Days, spreadLearnFrom } from '@/lib/utils/revision-days';
import { toDateString, appToday } from '@/lib/utils/date-utils';
import {
  dateStringSchema,
  examDateProblem,
  fullMarksSchema,
  gradeSchema,
  schoolNameSchema,
} from '@/lib/validation';
import {
  clashMessage,
  findNameClash,
  subjectNameSchema,
} from '@/lib/subject-name';

const level = z.enum(['low', 'medium', 'high']);

const onboardingSchema = z.object({
  student: z.object({
    name: z.string().min(1).max(200),
    grade: gradeSchema,
    schoolName: schoolNameSchema,
    // Saturday is always a revision day; Sunday too unless school is open.
    sundayRevision: z.boolean().default(true),
  }),
  exam: z.object({
    name: z.string().trim().min(1).max(200),
    examDate: dateStringSchema,
  }),
  subjects: z
    .array(
      z.object({
        name: subjectNameSchema,
        fullMarks: fullMarksSchema.default(100),
        examWeight: level,
        // Topics studied for earlier exams this year: revised on revision days.
        earlierTopics: z
          .array(
            z.object({
              name: z.string().trim().min(1).max(200),
              examName: z.string().trim().min(1).max(200),
              selfRating: z.enum(['not_sure', 'ok', 'know_well']).optional(),
            }),
          )
          .default([]),
        // This exam's topics taught so far: they start over the next days.
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

// Creates the child, their exam, subjects, topics and study plan in ONE
// transaction, so a failure (a dropped connection, say) leaves nothing
// half-saved behind. No marks are asked for: they are optional, added later
// with "Log a test" or "Add exam marks", and only order revision suggestions.
export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();

  const parsed = onboardingSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { student: studentIn, exam: examIn, subjects: subjectsIn } = parsed.data;

  const examDateError = examDateProblem(examIn.examDate);
  if (examDateError)
    return NextResponse.json({ error: examDateError }, { status: 400 });

  // Same rule as every other route: "Maths" and "Mathematics" are one subject.
  const clash = findNameClash(
    [],
    subjectsIn.map((s) => s.name),
  );
  if (clash)
    return NextResponse.json({ error: clashMessage(clash) }, { status: 400 });

  const studentId = await db.transaction(async (tx) => {
    const [student] = await tx
      .insert(schema.students)
      .values({ ...studentIn, studyDays: [...ALL_DAYS], parentId: user.id })
      .returning();

    const [exam] = await tx
      .insert(schema.exams)
      .values({
        studentId: student.id,
        name: examIn.name,
        examDate: examIn.examDate,
        isPrimary: true,
      })
      .returning();

    const subjectRows = await tx
      .insert(schema.subjects)
      .values(
        subjectsIn.map((s, i) => ({
          studentId: student.id,
          name: s.name,
          fullMarks: s.fullMarks,
          examWeight: s.examWeight,
          orderIndex: i,
        })),
      )
      .returning();

    // This exam's topics taught so far start 4 a day from tomorrow, on the
    // days SM-2 runs (not revision days, once there are earlier topics).
    const hasEarlier = subjectsIn.some((s) => s.earlierTopics.length > 0);
    const current = subjectsIn.flatMap((s, i) => s.topics.map((t) => ({ subjectId: subjectRows[i].id, ...t })));
    const learnFrom = spreadLearnFrom(
      current.length,
      toDateString(appToday()),
      sm2Days(studentIn.sundayRevision, hasEarlier),
    );
    await insertTopicRows(tx, [
      ...current.map((t, k) => ({
        subjectId: t.subjectId,
        parentTopicId: null,
        name: t.name,
        difficultyRating: t.difficultyRating,
        examId: exam.id,
        examName: exam.name,
        learnFrom: learnFrom[k],
      })),
      ...subjectsIn.flatMap((s, i) =>
        s.earlierTopics.map((t) => ({
          subjectId: subjectRows[i].id,
          parentTopicId: null,
          name: t.name,
          examName: t.examName,
          selfRating: t.selfRating ?? null,
        })),
      ),
    ]);

    // The plan exists from the start; topics join it as they're added.
    await createPlanForExam({ student, exam, ex: tx });
    return student.id;
  });

  return NextResponse.json({ studentId }, { status: 201 });
});
