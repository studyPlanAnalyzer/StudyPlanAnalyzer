import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { logError } from '@/lib/api/handler';
import { billingStateOf } from '@/lib/billing/state';
import { addDays, fromDateString, toDateString } from '@/lib/utils/date-utils';
import { buildWeeklyReport } from './build-weekly-report';
import { loadReportInput } from './load-report-inputs';
import {
  lastFinishedWeek,
  previousWeek,
  weekContaining,
  weekStartingOn,
  type ReportWeek,
} from './week';
import type { BillingForReport } from './types';

// ---------------------------------------------------------------------------
// Weekly reports, made on demand.
//
// Nothing runs on a schedule. When a parent opens the app (the dashboard, or
// a child's reports), each child is checked against the last finished week
// with ONE query for all the children: is that child-week already decided?
// Usually it is, and that is all the work. Otherwise the child "catches up":
//
//   - The weeks looked at run back from the last finished week, at most
//     LOOKBACK_WEEKS, never before the week the child was added, and skip
//     any week already decided.
//   - A week gets a report only if the child actually did something in it
//     (activityWeeks): a session finished, a test logged, or a daily
//     challenge attempted. Sessions that were only scheduled don't count.
//   - Of those, only the newest MAX_CATCH_UP_REPORTS are built. The last
//     finished week gets the full report; older ones are "built later" and
//     leave out the sections that describe the child's state now.
//   - Every week looked at is recorded in weekly_report_checks, report or
//     not, so it is never looked at again and a quiet week costs nothing.
//
// Each week is built in its own transaction under a per-child lock, so two
// requests at once can't build the same report twice or award a milestone
// twice: the second waits, then finds the week already decided.
//
// Billing: a child that is locked, unpaid or never paid NOW gets nothing
// built (and the read APIs show it nothing). A child paid now gets reports
// for past weeks even if it was locked then.
// ---------------------------------------------------------------------------

export const LOOKBACK_WEEKS = 12;
export const MAX_CATCH_UP_REPORTS = 4;

type Student = typeof schema.students.$inferSelect;

/** Billing state for a report, or null when the child gets no report:
 * locked, or never paid / unpaid. */
export function reportBilling(
  s: Pick<Student, 'paidUntil' | 'paymentStatus'>,
  now: Date,
): BillingForReport | null {
  const state = billingStateOf(s.paidUntil, s.paymentStatus, now);
  return state === 'active' || state === 'pending' || state === 'grace' ? state : null;
}

/** The child existed by the week's last day. */
export function existedBy(s: Pick<Student, 'createdAt'>, week: ReportWeek) {
  return s.createdAt.getTime() < addDays(fromDateString(week.end), 1).getTime();
}

/**
 * The weeks between `from` and `to` (inclusive, week starts) in which the
 * child did something: a session marked completed or partly completed
 * (study_sessions.status, by study_sessions.completed_at), a test logged
 * with at least one mark (assessments.assessment_date), or a daily challenge
 * attempted (quiz_attempts.completed_at). One query.
 */
export async function activityWeeks(studentId: string, from: ReportWeek, to: ReportWeek) {
  const startAt = fromDateString(from.start).toISOString();
  const endAt = addDays(fromDateString(to.end), 1).toISOString();
  const { rows } = await db.execute<{ day: string }>(sql`
    select distinct day::text as day from (
      select (ss.completed_at)::date as day
        from study_sessions ss
        join study_plans sp on sp.id = ss.plan_id
       where sp.student_id = ${studentId}
         and ss.status in ('completed', 'partly_completed')
         and ss.completed_at >= ${startAt} and ss.completed_at < ${endAt}
      union all
      select a.assessment_date as day
        from assessments a
       where a.student_id = ${studentId}
         and a.assessment_date between ${from.start} and ${to.end}
         and exists (select 1 from marks m where m.assessment_id = a.id)
      union all
      select (qa.completed_at)::date as day
        from quiz_attempts qa
       where qa.student_id = ${studentId}
         and qa.completed_at >= ${startAt} and qa.completed_at < ${endAt}
    ) activity`);
  return new Set(rows.map((r) => weekContaining(String(r.day).slice(0, 10)).start));
}

/** Builds and stores one week's report, unless another request already
 * decided that week. Returns whether this call built it. */
async function buildWeek(student: Student, week: ReportWeek, billing: BillingForReport, builtLater: boolean) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`weekly-report:${student.id}`}))`);
    const [done] = await tx
      .select({ w: schema.weeklyReportChecks.weekStart })
      .from(schema.weeklyReportChecks)
      .where(and(eq(schema.weeklyReportChecks.studentId, student.id), eq(schema.weeklyReportChecks.weekStart, week.start)))
      .limit(1);
    if (done) return false;

    // Reads committed data only: earlier weeks (and their milestones) built
    // by this or another request are already committed.
    const snapshot = buildWeeklyReport(await loadReportInput({ student, week, billing, builtLater }));
    const [row] = await tx
      .insert(schema.weeklyReports)
      .values({ studentId: student.id, weekStart: week.start, snapshot })
      .onConflictDoNothing()
      .returning({ id: schema.weeklyReports.id });
    if (row && snapshot.milestonesUnlocked.length > 0)
      await tx
        .insert(schema.studentMilestones)
        .values(snapshot.milestonesUnlocked.map((key) => ({ studentId: student.id, key, weekStart: week.start })))
        .onConflictDoNothing();
    await tx
      .insert(schema.weeklyReportChecks)
      .values({ studentId: student.id, weekStart: week.start })
      .onConflictDoNothing();
    return !!row;
  });
}

/** Looks at the child's undecided weeks and builds the reports due. */
async function catchUp(student: Student, billing: BillingForReport, now: Date): Promise<number> {
  const last = lastFinishedWeek(now);
  const added = weekContaining(toDateString(student.createdAt));
  let first = last;
  for (let i = 1; i < LOOKBACK_WEEKS && first.start > added.start; i++) first = previousWeek(first);

  const [checked, active] = await Promise.all([
    db
      .select({ w: schema.weeklyReportChecks.weekStart })
      .from(schema.weeklyReportChecks)
      .where(
        and(
          eq(schema.weeklyReportChecks.studentId, student.id),
          gte(schema.weeklyReportChecks.weekStart, first.start),
          lte(schema.weeklyReportChecks.weekStart, last.start),
        ),
      ),
    activityWeeks(student.id, first, last),
  ]);
  const decided = new Set(checked.map((c) => c.w));

  const undecided: string[] = [];
  for (let w = first; w.start <= last.start; w = weekStartingOn(toDateString(addDays(fromDateString(w.start), 7))))
    if (!decided.has(w.start)) undecided.push(w.start);
  const toBuild = undecided.filter((w) => active.has(w)).slice(-MAX_CATCH_UP_REPORTS);

  // Quiet weeks, and active weeks older than the newest few, are decided now:
  // no report, and never looked at again.
  const noReport = undecided.filter((w) => !toBuild.includes(w));
  if (noReport.length > 0)
    await db
      .insert(schema.weeklyReportChecks)
      .values(noReport.map((w) => ({ studentId: student.id, weekStart: w })))
      .onConflictDoNothing();

  let built = 0;
  for (const w of toBuild) {
    try {
      if (await buildWeek(student, weekStartingOn(w), billing, w !== last.start)) built++;
    } catch (err) {
      // Left undecided, so the next visit tries again; the other weeks and
      // children carry on.
      logError(`[reports] report for student ${student.id}, week ${w} failed:`, err);
    }
  }
  return built;
}

export interface Unread {
  studentId: string;
  weekStart: string;
}

/**
 * The on-demand check for some of a parent's children (all of them, or one),
 * then the children whose newest report hasn't been opened yet. When nothing
 * is due this is one query; the newest-report lookup is part of it.
 */
export async function refreshReports(a: {
  parentId: string;
  studentId?: string;
  now?: Date;
}): Promise<{ built: number; unread: Unread[] }> {
  const now = a.now ?? new Date();
  const last = lastFinishedWeek(now);

  // Correlated subqueries name the outer table in full: inside a select field
  // Drizzle writes a column as a bare "id", which Postgres would read as the
  // subquery table's own id.
  const studentId = sql.raw('"students"."id"');
  const query = () =>
    db
      .select({
        student: schema.students,
        decided: sql<boolean>`exists (
          select 1 from ${schema.weeklyReportChecks} c
           where c.student_id = ${studentId} and c.week_start = ${last.start})`,
        newestWeek: sql<string | null>`(
          select r.week_start::text from ${schema.weeklyReports} r
           where r.student_id = ${studentId}
           order by r.week_start desc limit 1)`,
        newestRead: sql<boolean | null>`(
          select r.read_at is not null from ${schema.weeklyReports} r
           where r.student_id = ${studentId}
           order by r.week_start desc limit 1)`,
      })
      .from(schema.students)
      .where(
        a.studentId
          ? and(eq(schema.students.parentId, a.parentId), eq(schema.students.id, a.studentId))
          : eq(schema.students.parentId, a.parentId),
      );

  let rows = await query();
  let built = 0;
  for (const r of rows) {
    const billing = reportBilling(r.student, now);
    if (!billing || r.decided || !existedBy(r.student, last)) continue;
    built += await catchUp(r.student, billing, now);
  }
  if (built > 0) rows = await query();

  const unread = rows
    .filter((r) => reportBilling(r.student, now) && r.newestWeek && r.newestRead === false)
    .map((r) => ({ studentId: r.student.id, weekStart: r.newestWeek! }));
  return { built, unread };
}
