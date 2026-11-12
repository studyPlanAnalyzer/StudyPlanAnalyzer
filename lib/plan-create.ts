import { db, schema } from '@/lib/db';
import { sessionRows } from '@/lib/session-rows';
import { generateStudyPlan } from '@/lib/utils/plan-generator';
import { appToday } from '@/lib/utils/date-utils';
import { isExamOver } from '@/lib/plan-expiry';
import { scheduleInputFor } from '@/lib/plan-schedule';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Student = typeof schema.students.$inferSelect;
type Exam = typeof schema.exams.$inferSelect;

/**
 * Creates the study plan for an exam: it exists from the moment the exam
 * does, with or without topics yet, and grows as topics are added (each
 * addition rebuilds it). Returns null when the exam is already over. Pass a
 * transaction to make it part of the caller's save.
 */
export async function createPlanForExam(args: {
  student: Student;
  exam: Exam;
  useBufferWeek?: boolean;
  ex?: Tx | typeof db;
}) {
  const ex = args.ex ?? db;
  if (isExamOver(args.exam.examDate)) return null;
  const useBufferWeek = args.useBufferWeek ?? false;
  const result = generateStudyPlan(
    await scheduleInputFor({ student: args.student, exam: args.exam, useBufferWeek, fromDate: appToday(), ex }),
  );
  const [plan] = await ex
    .insert(schema.studyPlans)
    .values({
      studentId: args.student.id,
      examId: args.exam.id,
      totalDays: result.totalDays,
      averageDailyMinutes: result.averageDailyMinutes,
      weakFocusPercent: result.weakFocusPercent,
      mediumFocusPercent: result.mediumFocusPercent,
      strongFocusPercent: result.strongFocusPercent,
      unscheduledTopicIds: result.unscheduledTopicIds,
      useBufferWeek,
    })
    .returning();
  if (result.sessions.length > 0)
    await ex.insert(schema.studySessions).values(sessionRows(plan.id, result.sessions));
  return plan;
}
