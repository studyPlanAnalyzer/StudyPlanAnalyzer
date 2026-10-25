import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { generateStudyPlan } from '@/lib/utils/plan-generator';
import { loadSubjectInputs } from '@/lib/plan-inputs';
import { addDays, fromDateString, toDateString } from '@/lib/utils/date-utils';

export const maxDuration = 60;

const generatePlanSchema = z.object({
  studentId: z.string().uuid(),
  examId: z.string().uuid(),
  useBufferWeek: z.boolean().optional().default(false),
});

const BUFFER_DAYS = 7;

export async function POST(req: NextRequest) {
  const userId = getAuthUserId(req);
  if (!userId) return unauthorizedResponse();

  const body = await req.json();
  const parsed = generatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { studentId, examId, useBufferWeek } = parsed.data;

  // Student, exam and any existing plan in one parallel round (three queries
  // in a row before). Nothing is returned unless the student is this parent's.
  const [students, exams, existingPlans] = await Promise.all([
    db
      .select()
      .from(schema.students)
      .where(
        and(
          eq(schema.students.id, studentId),
          eq(schema.students.parentId, userId),
        ),
      )
      .limit(1),
    db
      .select()
      .from(schema.exams)
      .where(
        and(eq(schema.exams.id, examId), eq(schema.exams.studentId, studentId)),
      )
      .limit(1),
    db
      .select({ id: schema.studyPlans.id })
      .from(schema.studyPlans)
      .where(eq(schema.studyPlans.examId, examId))
      .limit(1),
  ]);
  const student = students[0];
  if (!student)
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  const exam = exams[0];
  if (!exam)
    return NextResponse.json({ error: 'Exam not found' }, { status: 404 });
  const existingPlan = existingPlans[0];

  const examDate = fromDateString(exam.examDate);
  if (examDate.getTime() <= Date.now()) {
    return NextResponse.json(
      { error: 'Exam date must be in the future' },
      { status: 400 },
    );
  }

  const scheduleEndDate = useBufferWeek
    ? addDays(examDate, -BUFFER_DAYS)
    : examDate;
  if (scheduleEndDate.getTime() <= Date.now()) {
    return NextResponse.json(
      {
        error:
          "Not enough time before the exam to leave a consolidation week — choose 'use the full period' instead",
      },
      { status: 400 },
    );
  }

  if (existingPlan) {
    return NextResponse.json(
      {
        error:
          'A plan already exists for this exam. Use regenerate to rebuild it instead.',
        planId: existingPlan.id,
      },
      { status: 409 },
    );
  }

  const subjectInputs = await loadSubjectInputs(studentId, examId);
  if (subjectInputs.length === 0) {
    return NextResponse.json(
      { error: 'Add at least one subject before generating a plan' },
      { status: 400 },
    );
  }
  const totalTopics = subjectInputs.reduce(
    (sum, s) => sum + s.topics.length,
    0,
  );
  if (totalTopics === 0) {
    return NextResponse.json(
      { error: 'Add topics to at least one subject before generating a plan' },
      { status: 400 },
    );
  }

  const result = generateStudyPlan({
    examDate,
    scheduleEndDate,
    studyDays: student.studyDays,
    schoolDayMinutes: student.schoolDayMinutes,
    holidayDayMinutes: student.holidayDayMinutes,
    subjects: subjectInputs,
  });

  const plan = await db.transaction(async (tx) => {
    const [insertedPlan] = await tx
      .insert(schema.studyPlans)
      .values({
        studentId,
        examId,
        totalDays: result.totalDays,
        averageDailyMinutes: result.averageDailyMinutes,
        weakFocusPercent: result.weakFocusPercent,
        mediumFocusPercent: result.mediumFocusPercent,
        strongFocusPercent: result.strongFocusPercent,
        unscheduledTopicIds: result.unscheduledTopicIds,
        useBufferWeek,
      })
      .returning();

    if (result.sessions.length > 0) {
      await tx.insert(schema.studySessions).values(
        result.sessions.map((s) => ({
          planId: insertedPlan.id,
          topicId: s.topicId,
          subjectId: s.subjectId,
          scheduledDate: s.scheduledDate,
          durationMinutes: s.durationMinutes,
          sessionType: s.sessionType,
          isFiller: s.isFiller ?? false,
        })),
      );
    }

    return insertedPlan;
  });

  return NextResponse.json(
    {
      plan,
      sessionsCreated: result.sessions.length,
      unscheduledTopicCount: result.unscheduledTopicIds.length,
      scheduleEndDate: toDateString(scheduleEndDate),
    },
    { status: 201 },
  );
}
