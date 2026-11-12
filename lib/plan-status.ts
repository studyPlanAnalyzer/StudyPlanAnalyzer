import { and, eq, gte, lt, lte, or, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { loadStudyDays } from '@/lib/study-history';
import { PACE_STUDY_DAYS, recentPace } from '@/lib/utils/study-history';
import {
  countStudyDays,
  needWindowEnd,
  planLastDay,
  planStatus,
  type PlanStatus,
} from '@/lib/utils/plan-status';

import { hasEarlierTopics } from '@/lib/plan-schedule';
import { sm2Days } from '@/lib/utils/revision-days';
import type { Executor } from '@/lib/utils/topic-mastery';

/**
 * The parent's status for a live plan (see lib/utils/plan-status.ts): the
 * child's pace over their last study days, the topics the plan lists from
 * today through the next week, and how many are overdue. It reads the same
 * before and after the catch-up check that moves topics left over from
 * earlier days onto today's list: those still-planned rows count as listed
 * (and as overdue when their review was due), wherever they sit.
 */
export async function loadPlanStatus(
  args: {
    studentId: string;
    sundayRevision: boolean;
    plan: { id: string; examId: string; useBufferWeek: boolean };
    examDate: string;
    todayKey: string;
  },
  ex: Executor = db,
): Promise<PlanStatus | null> {
  const { plan, todayKey } = args;
  const lastDay = planLastDay(args.examDate, plan.useBufferWeek, todayKey);
  const windowEnd = needWindowEnd(todayKey, lastDay);
  // The days SM-2 sessions go on (not revision days, once there are earlier topics).
  const days = sm2Days(args.sundayRevision, await hasEarlierTopics(args.studentId, plan.examId, ex));
  const studyDays = countStudyDays(todayKey, windowEnd, days);
  if (studyDays === 0) return null;

  const planned = eq(schema.studySessions.status, 'planned');
  const inWindow = and(
    eq(schema.studySessions.planId, plan.id),
    eq(schema.studySessions.isFiller, false),
    lte(schema.studySessions.scheduledDate, windowEnd),
    or(gte(schema.studySessions.scheduledDate, todayKey), planned),
  );
  const [history, [listed], [overdue]] = await Promise.all([
    loadStudyDays(args.studentId, todayKey, PACE_STUDY_DAYS, ex),
    ex.select({ n: sql<number>`count(*)` }).from(schema.studySessions).where(inWindow),
    ex
      .select({ n: sql<number>`count(distinct ${schema.studySessions.topicId})` })
      .from(schema.studySessions)
      .innerJoin(
        schema.topicSpacedState,
        eq(schema.topicSpacedState.topicId, schema.studySessions.topicId),
      )
      .where(
        and(
          eq(schema.studySessions.planId, plan.id),
          eq(schema.studySessions.isFiller, false),
          lte(schema.studySessions.scheduledDate, todayKey),
          planned,
          lt(schema.topicSpacedState.nextReviewDate, todayKey),
        ),
      ),
  ]);

  return planStatus({
    pace: recentPace(history.map((d) => d.done)),
    listed: Number(listed?.n ?? 0),
    studyDays,
    overdue: Number(overdue?.n ?? 0),
  });
}
