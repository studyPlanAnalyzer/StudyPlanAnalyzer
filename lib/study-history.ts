import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { addDays, fromDateString, toDateString } from '@/lib/utils/date-utils';
import type { StudyDay } from '@/lib/utils/study-history';

type Executor = Pick<typeof db, 'select'>;

/** How far back to look for the child's recent study days. */
const LOOKBACK_DAYS = 120;

/**
 * The child's last `count` study days before `beforeKey` (oldest first):
 * days that had topics on the list, across all their plans, so the pace
 * carries over from one exam cycle to the next. Days without a plan (a
 * holiday, an exam break) aren't study days. A day where nothing was done
 * is one, with 0 done. One query.
 */
export async function loadStudyDays(
  studentId: string,
  beforeKey: string,
  count: number,
  ex: Executor = db,
): Promise<StudyDay[]> {
  const done = sql<number>`count(*) filter (where ${schema.studySessions.status} in ('completed', 'partly_completed'))`;
  const rows = await ex
    .select({
      day: schema.studySessions.scheduledDate,
      listed: sql<number>`count(*)`,
      done,
    })
    .from(schema.studySessions)
    .innerJoin(schema.studyPlans, eq(schema.studyPlans.id, schema.studySessions.planId))
    .where(
      and(
        eq(schema.studyPlans.studentId, studentId),
        eq(schema.studySessions.isFiller, false),
        lt(schema.studySessions.scheduledDate, beforeKey),
        gte(
          schema.studySessions.scheduledDate,
          toDateString(addDays(fromDateString(beforeKey), -LOOKBACK_DAYS)),
        ),
      ),
    )
    .groupBy(schema.studySessions.scheduledDate)
    .orderBy(desc(schema.studySessions.scheduledDate))
    .limit(count);
  return rows
    .map((r) => ({ date: r.day, listed: Number(r.listed), done: Number(r.done) }))
    .reverse();
}
