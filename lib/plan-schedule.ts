import { sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { BUFFER_WEEK_DAYS } from '@/lib/utils/study-limits';
import { addDays, appToday, fromDateString } from '@/lib/utils/date-utils';
import { loadSubjectInputs } from '@/lib/plan-inputs';
import { sm2Days } from '@/lib/utils/revision-days';
import type { PlanGeneratorInput } from '@/lib/utils/plan-generator';

import type { Executor } from '@/lib/utils/topic-mastery';
type Student = Pick<typeof schema.students.$inferSelect, 'id' | 'sundayRevision'>;
type Exam = Pick<typeof schema.exams.$inferSelect, 'id' | 'examDate'>;

/**
 * Whether the child has topics from earlier exams to revise: a lowest-level
 * topic, in an active subject, tagged with an exam other than `examId`
 * (lib/utils/revision.ts isEarlierTopic: an untagged topic is the current
 * exam's). Once they do, revision
 * days carry no SM-2 sessions (lib/utils/revision-days.ts).
 */
export async function hasEarlierTopics(
  studentId: string,
  examId: string,
  ex: Executor = db,
): Promise<boolean> {
  const { rows } = await ex.execute(sql`
    select 1 from ${schema.topics} t
    join ${schema.subjects} s on s.id = t.subject_id
    where s.student_id = ${studentId} and s.is_active
      and t.exam_id is distinct from ${examId}
      and (t.exam_id is not null or t.exam_name is not null)
      and not exists (select 1 from ${schema.topics} c where c.parent_topic_id = t.id)
    limit 1`);
  return rows.length > 0;
}

/**
 * The last day the plan runs to: the start of the buffer week when it is on
 * and still ahead, else the exam itself (the generator stops the day before).
 */
export function scheduleEndFor(examDate: string, useBufferWeek: boolean): Date {
  const exam = fromDateString(examDate);
  const bufferStart = addDays(exam, -BUFFER_WEEK_DAYS);
  return useBufferWeek && bufferStart.getTime() > appToday().getTime() ? bufferStart : exam;
}

/** Everything the generator needs for this exam's plan, from `fromDate`. */
export async function scheduleInputFor(args: {
  student: Student;
  exam: Exam;
  useBufferWeek: boolean;
  fromDate: Date;
  ex?: Executor;
}): Promise<PlanGeneratorInput> {
  const ex = args.ex ?? db;
  const [subjects, earlier] = await Promise.all([
    loadSubjectInputs(args.student.id, args.exam.id, ex, { scope: 'plan' }),
    hasEarlierTopics(args.student.id, args.exam.id, ex),
  ]);
  return {
    examDate: fromDateString(args.exam.examDate),
    scheduleEndDate: scheduleEndFor(args.exam.examDate, args.useBufferWeek),
    studyDays: sm2Days(args.student.sundayRevision, earlier),
    subjects,
    startDate: args.fromDate,
  };
}
