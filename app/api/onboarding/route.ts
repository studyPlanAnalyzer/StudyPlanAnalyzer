import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import {
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { insertTopics } from '@/lib/topic-leaves';
import { fromDateString, toDateString, todayUTC } from '@/lib/utils/date-utils';
import {
  MIN_SCHOOL_DAY_MINUTES,
  MIN_HOLIDAY_DAY_MINUTES,
} from '@/lib/utils/study-limits';

const level = z.enum(['low', 'medium', 'high']);

const onboardingSchema = z.object({
  student: z.object({
    name: z.string().min(1).max(200),
    grade: z.string().regex(/^([4-9]|10)$/, 'Grade must be 4 to 10'),
    schoolName: z.string().min(1).max(200),
    studyDays: z.array(z.string()).min(1),
    schoolDayMinutes: z
      .number()
      .int()
      .min(
        MIN_SCHOOL_DAY_MINUTES,
        `School days need at least ${MIN_SCHOOL_DAY_MINUTES} minutes`,
      ),
    holidayDayMinutes: z
      .number()
      .int()
      .min(
        MIN_HOLIDAY_DAY_MINUTES,
        `Weekends and holidays need at least ${MIN_HOLIDAY_DAY_MINUTES} minutes`,
      ),
  }),
  exam: z.object({
    name: z.string().min(1).max(200),
    examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  subjects: z
    .array(
      z
        .object({
          name: z.string().min(1).max(200),
          fullMarks: z.number().int().positive().default(100),
          examWeight: level,
          // Either real marks, or a gut-sense estimate when there are none.
          obtainedMarks: z.number().int().min(0).optional(),
          confidenceLevel: level.optional(),
          estimatedConfidence: level.optional(),
          topics: z
            .array(
              z.object({
                name: z.string().min(1).max(200),
                difficultyRating: z.number().int().min(1).max(5).default(2),
              }),
            )
            .default([]),
        })
        .refine(
          (s) =>
            (s.obtainedMarks !== undefined) !==
            (s.estimatedConfidence !== undefined),
          { message: 'Give either marks or an estimated confidence' },
        )
        .refine((s) => (s.obtainedMarks ?? 0) <= s.fullMarks, {
          message: 'obtainedMarks cannot exceed fullMarks',
        }),
    )
    .min(1),
});

// Creates the child and everything entered during setup in ONE transaction,
// so a failure (a dropped connection, say) leaves nothing half-saved behind.
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
  const {
    student: studentIn,
    exam: examIn,
    subjects: subjectsIn,
  } = parsed.data;

  if (fromDateString(examIn.examDate).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'Exam date must be in the future' },
      { status: 400 },
    );
  }

  const seen = new Set<string>();
  for (const s of subjectsIn) {
    const key = s.name.trim().toLowerCase();
    if (seen.has(key))
      return NextResponse.json(
        {
          error: `${s.name} is added twice. Each subject can only be listed once.`,
        },
        { status: 400 },
      );
    seen.add(key);
  }

  const studentId = await db.transaction(async (tx) => {
    const [student] = await tx
      .insert(schema.students)
      .values({ ...studentIn, parentId: user.id })
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

    let assessmentId: string | null = null;
    if (subjectsIn.some((s) => s.obtainedMarks !== undefined)) {
      const [assessment] = await tx
        .insert(schema.assessments)
        .values({
          studentId: student.id,
          examId: exam.id,
          assessmentDate: toDateString(todayUTC()),
          assessmentName: 'Latest marksheet',
        })
        .returning();
      assessmentId = assessment.id;
    }

    for (let i = 0; i < subjectsIn.length; i++) {
      const s = subjectsIn[i];
      const [subject] = await tx
        .insert(schema.subjects)
        .values({
          studentId: student.id,
          name: s.name,
          fullMarks: s.fullMarks,
          examWeight: s.examWeight,
          orderIndex: i,
        })
        .returning();

      if (s.obtainedMarks !== undefined && assessmentId) {
        await tx.insert(schema.marks).values({
          assessmentId,
          subjectId: subject.id,
          obtainedMarks: s.obtainedMarks,
          fullMarks: s.fullMarks,
          confidenceLevel: s.confidenceLevel ?? null,
        });
      } else if (s.estimatedConfidence) {
        await tx.insert(schema.subjectEstimatedConfidence).values({
          subjectId: subject.id,
          level: s.estimatedConfidence,
        });
      }

      await insertTopics(tx, subject.id, null, s.topics);
    }

    return student.id;
  });

  return NextResponse.json({ studentId }, { status: 201 });
});
