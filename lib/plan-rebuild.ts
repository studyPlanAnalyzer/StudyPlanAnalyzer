import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { generateStudyPlan } from '@/lib/utils/plan-generator';
import { addDays, fromDateString, toDateString } from '@/lib/utils/date-utils';
import { loadSubjectInputs } from '@/lib/plan-inputs';

const BUFFER_DAYS = 7;

// A transaction the caller already holds, or the database itself.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

type Plan = typeof schema.studyPlans.$inferSelect;
type Student = typeof schema.students.$inferSelect;

export type RebuildResult =
  | {
      ok: true;
      plan: Plan;
      sessionsCreated: number;
      unscheduledTopicCount: number;
    }
  | { ok: false; status: number; error: string };

/**
 * Rebuilds a plan's schedule from `fromDate` onward, using the SM-2 state
 * stored on each topic. Callers check that the plan belongs to the parent
 * before calling this.
 *
 * - Sessions dated before `fromDate` are history: completed ones are kept, and
 *   any still "planned" are marked skipped (they were never done).
 * - Planned and skipped sessions dated `fromDate` or later are replaced.
 * - The plan row is locked for the swap, so two rebuilds at once can't leave
 *   duplicate sessions.
 * - Pass `ex` (a transaction) to make the rebuild part of the caller's own
 *   transaction, so it commits or rolls back together with the caller's changes.
 */
export async function rebuildPlan({
  plan,
  student,
  fromDate,
  useBufferWeek: requestedBufferWeek,
  ex = db,
}: {
  plan: Plan;
  student: Student;
  fromDate: Date;
  useBufferWeek?: boolean;
  ex?: Tx | typeof db;
}): Promise<RebuildResult> {
  const [exam] = await ex
    .select()
    .from(schema.exams)
    .where(eq(schema.exams.id, plan.examId))
    .limit(1);
  if (!exam) return { ok: false, status: 404, error: 'Exam not found' };

  const examDate = fromDateString(exam.examDate);
  if (examDate.getTime() <= Date.now()) {
    return {
      ok: false,
      status: 400,
      error: 'Exam date has passed; create a new exam and plan instead',
    };
  }

  // Use the requested setting if there is one, otherwise keep the plan's. If
  // the buffer no longer fits before the exam, fall back to the full period.
  const useBufferWeek = requestedBufferWeek ?? plan.useBufferWeek;
  const scheduleEndDate = useBufferWeek
    ? addDays(examDate, -BUFFER_DAYS)
    : examDate;
  const effectiveEndDate =
    scheduleEndDate.getTime() <= Date.now() ? examDate : scheduleEndDate;

  // Nothing left to schedule (for example the last study day just finished).
  if (fromDate.getTime() > effectiveEndDate.getTime()) {
    return {
      ok: true,
      plan,
      sessionsCreated: 0,
      unscheduledTopicCount: plan.unscheduledTopicIds?.length ?? 0,
    };
  }

  const subjectInputs = await loadSubjectInputs(student.id, plan.examId, ex);

  const result = generateStudyPlan({
    examDate,
    scheduleEndDate: effectiveEndDate,
    studyDays: student.studyDays,
    schoolDayMinutes: student.schoolDayMinutes,
    holidayDayMinutes: student.holidayDayMinutes,
    subjects: subjectInputs,
    startDate: fromDate,
  });

  const fromKey = toDateString(fromDate);

  const swap = async (tx: Tx) => {
    await tx.execute(
      sql`select id from study_plans where id = ${plan.id} for update`,
    );

    await tx
      .update(schema.studySessions)
      .set({ status: 'skipped' })
      .where(
        and(
          eq(schema.studySessions.planId, plan.id),
          eq(schema.studySessions.status, 'planned'),
          lt(schema.studySessions.scheduledDate, fromKey),
        ),
      );

    await tx
      .delete(schema.studySessions)
      .where(
        and(
          eq(schema.studySessions.planId, plan.id),
          inArray(schema.studySessions.status, ['planned', 'skipped']),
          gte(schema.studySessions.scheduledDate, fromKey),
        ),
      );

    if (result.sessions.length > 0) {
      await tx.insert(schema.studySessions).values(
        result.sessions.map((s) => ({
          planId: plan.id,
          topicId: s.topicId,
          subjectId: s.subjectId,
          scheduledDate: s.scheduledDate,
          durationMinutes: s.durationMinutes,
          sessionType: s.sessionType,
          isFiller: s.isFiller ?? false,
        })),
      );
    }

    const [updated] = await tx
      .update(schema.studyPlans)
      .set({
        totalDays: result.totalDays,
        averageDailyMinutes: result.averageDailyMinutes,
        weakFocusPercent: result.weakFocusPercent,
        mediumFocusPercent: result.mediumFocusPercent,
        strongFocusPercent: result.strongFocusPercent,
        unscheduledTopicIds: result.unscheduledTopicIds,
        useBufferWeek,
        generatedAt: new Date(),
      })
      .where(eq(schema.studyPlans.id, plan.id))
      .returning();

    return updated;
  };
  const updatedPlan =
    ex === db ? await db.transaction(swap) : await swap(ex as Tx);

  return {
    ok: true,
    plan: updatedPlan,
    sessionsCreated: result.sessions.length,
    unscheduledTopicCount: result.unscheduledTopicIds.length,
  };
}
