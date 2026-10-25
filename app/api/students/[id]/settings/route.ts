import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import {
  MIN_SCHOOL_DAY_MINUTES,
  MIN_HOLIDAY_DAY_MINUTES,
} from '@/lib/utils/study-limits';
import { pickExam } from '@/lib/exam-pick';
import { isExamOver } from '@/lib/plan-expiry';
import { rebuildPlan } from '@/lib/plan-rebuild';
import { generateStudyPlan } from '@/lib/utils/plan-generator';
import { loadSubjectInputs } from '@/lib/plan-inputs';
import { addDays, fromDateString, todayUTC } from '@/lib/utils/date-utils';

export const maxDuration = 60;

const BUFFER_DAYS = 7;

// A failure that must undo the whole save, with the status to report.
class SaveError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const bodySchema = z.object({
  studyDays: z.array(z.string()).min(1),
  schoolDayMinutes: z.number().int().min(MIN_SCHOOL_DAY_MINUTES),
  holidayDayMinutes: z.number().int().min(MIN_HOLIDAY_DAY_MINUTES),
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  // Buffer-week choice. Left out, the existing plan keeps its own setting.
  useBufferWeek: z.boolean().optional(),
});

/**
 * Saves the planning inputs (study days, daily minutes, exam date) and builds
 * or rebuilds the study plan from them, all in ONE transaction. If the plan
 * can't be built, nothing is saved.
 */
export const PUT = withErrorHandling(
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
    const {
      studyDays,
      schoolDayMinutes,
      holidayDayMinutes,
      examDate,
      useBufferWeek,
    } = parsed.data;

    // The student, exams and plans are read together, before the transaction,
    // so it holds only writes. Nothing happens unless the student belongs to
    // this parent.
    const [students, exams, plans] = await Promise.all([
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
        .from(schema.exams)
        .where(eq(schema.exams.studentId, params.id)),
      // All plans, newest first. The one to use is picked below, by exam.
      db
        .select()
        .from(schema.studyPlans)
        .where(eq(schema.studyPlans.studentId, params.id))
        .orderBy(desc(schema.studyPlans.generatedAt)),
    ]);
    const student = students[0];
    if (!student)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    // Choose the exam first, then the newest plan that belongs to THAT exam.
    // A new exam with no plan falls through to "build the first plan" instead
    // of rebuilding a stale plan that points at an old exam.
    const chosenExam = pickExam(exams);
    const plan = chosenExam
      ? plans.find((p) => p.examId === chosenExam.id)
      : undefined;

    // Once the exam is over, its settings and date are closed: the way
    // forward is a new exam cycle or a new academic session. (A moved date
    // can't bring a finished exam back.)
    if (chosenExam && isExamOver(chosenExam.examDate)) {
      return NextResponse.json(
        {
          error:
            'This exam is over. Start a new exam cycle or a new academic session instead. Nothing was saved',
        },
        { status: 400 },
      );
    }

    try {
      const planId = await db.transaction(async (tx) => {
        const [updatedStudent] = await tx
          .update(schema.students)
          .set({
            studyDays,
            schoolDayMinutes,
            holidayDayMinutes,
            updatedAt: new Date(),
          })
          .where(eq(schema.students.id, student.id))
          .returning();

        let exam = chosenExam;

        if (exam && examDate && examDate !== exam.examDate) {
          if (fromDateString(examDate).getTime() <= Date.now())
            throw new SaveError('Exam date must be in the future', 400);
          const [moved] = await tx
            .update(schema.exams)
            .set({ examDate })
            .where(eq(schema.exams.id, exam.id))
            .returning();
          exam = moved;
        }

        // Existing plan for this exam: rebuild it from today with the new
        // settings.
        if (plan) {
          const result = await rebuildPlan({
            plan,
            student: updatedStudent,
            fromDate: todayUTC(),
            useBufferWeek,
            ex: tx,
          });
          if (!result.ok) throw new SaveError(result.error, result.status);
          return plan.id;
        }

        // No exam yet: only the preferences are saved.
        if (!exam) return null;

        // No plan for this exam yet: build the first one.
        const examDay = fromDateString(exam.examDate);
        if (examDay.getTime() <= Date.now())
          throw new SaveError('Exam date must be in the future', 400);
        const endDate = useBufferWeek
          ? addDays(examDay, -BUFFER_DAYS)
          : examDay;
        if (endDate.getTime() <= Date.now())
          throw new SaveError(
            "Not enough time before the exam to leave a consolidation week. Choose 'use the full period' instead.",
            400,
          );
        const subjects = await loadSubjectInputs(student.id, exam.id, tx);
        if (subjects.reduce((n, s) => n + s.topics.length, 0) === 0)
          throw new SaveError(
            'Add subjects with topics before generating a plan',
            400,
          );
        const result = generateStudyPlan({
          examDate: examDay,
          scheduleEndDate: endDate,
          studyDays: updatedStudent.studyDays,
          schoolDayMinutes: updatedStudent.schoolDayMinutes,
          holidayDayMinutes: updatedStudent.holidayDayMinutes,
          subjects,
        });
        const [created] = await tx
          .insert(schema.studyPlans)
          .values({
            studentId: student.id,
            examId: exam.id,
            totalDays: result.totalDays,
            averageDailyMinutes: result.averageDailyMinutes,
            weakFocusPercent: result.weakFocusPercent,
            mediumFocusPercent: result.mediumFocusPercent,
            strongFocusPercent: result.strongFocusPercent,
            unscheduledTopicIds: result.unscheduledTopicIds,
            useBufferWeek: useBufferWeek ?? false,
          })
          .returning();
        if (result.sessions.length > 0) {
          await tx.insert(schema.studySessions).values(
            result.sessions.map((s) => ({
              planId: created.id,
              topicId: s.topicId,
              subjectId: s.subjectId,
              scheduledDate: s.scheduledDate,
              durationMinutes: s.durationMinutes,
              sessionType: s.sessionType,
              isFiller: s.isFiller ?? false,
            })),
          );
        }
        return created.id;
      });

      return NextResponse.json({ planId });
    } catch (err) {
      if (err instanceof SaveError)
        return NextResponse.json(
          { error: `${err.message}. Nothing was saved.` },
          { status: err.status },
        );
      throw err;
    }
  },
);
