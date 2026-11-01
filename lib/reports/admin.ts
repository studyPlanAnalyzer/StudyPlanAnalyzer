import { and, eq, ilike, or } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { buildWeeklyReport } from './build-weekly-report';
import { loadReportInput } from './load-report-inputs';
import { existedBy, reportBilling } from './generate';
import { lastFinishedWeek, previousWeek, weekStartingOn, type ReportWeek } from './week';
import type { WeeklyReportSnapshot } from './types';

// ---------------------------------------------------------------------------
// The admin reports page: pick a child and a week and see the report. Builds
// in memory only; nothing here stores a report or awards a milestone.
// ---------------------------------------------------------------------------

/** The last finished week and the ones before it, newest first. */
export function recentWeeks(now: Date, count = 8): ReportWeek[] {
  const out = [lastFinishedWeek(now)];
  while (out.length < count) out.push(previousWeek(out[out.length - 1]));
  return out;
}

/** A week from a URL, or null if it isn't a report week start. */
export function parseWeek(start: string | null | undefined, now: Date): ReportWeek | null {
  if (!start) return lastFinishedWeek(now);
  try {
    return weekStartingOn(start);
  } catch {
    return null;
  }
}

export async function searchChildren(q: string) {
  const term = `%${q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  return db
    .select({
      id: schema.students.id,
      name: schema.students.name,
      grade: schema.students.grade,
      parentName: schema.users.name,
      parentEmail: schema.users.email,
    })
    .from(schema.students)
    .innerJoin(schema.users, eq(schema.users.id, schema.students.parentId))
    .where(q.trim() ? or(ilike(schema.students.name, term), ilike(schema.users.email, term)) : undefined)
    .orderBy(schema.students.name)
    .limit(20);
}

export interface ChildPreview {
  student: { id: string; name: string };
  parent: { email: string };
  week: ReportWeek;
  /** Whether the app would make this child a report for the week. */
  eligibility: { wouldGetReport: boolean; reason: string };
  /** The stored report, if one was made. */
  stored: WeeklyReportSnapshot | null;
  /** The report as it would be built now (not stored). */
  preview: WeeklyReportSnapshot;
}

export async function previewForChild(a: {
  studentId: string;
  week: ReportWeek;
  now: Date;
}): Promise<ChildPreview | null> {
  const [row] = await db
    .select({ student: schema.students, parentEmail: schema.users.email })
    .from(schema.students)
    .innerJoin(schema.users, eq(schema.users.id, schema.students.parentId))
    .where(eq(schema.students.id, a.studentId))
    .limit(1);
  if (!row) return null;
  const { student } = row;

  const billing = reportBilling(student, a.now);
  const eligibility = !existedBy(student, a.week)
    ? { wouldGetReport: false, reason: 'Added after this week ended.' }
    : billing === null
      ? { wouldGetReport: false, reason: 'Billing is locked, unpaid or never paid: no report is made.' }
      : {
          wouldGetReport: true,
          reason:
            'Gets a report if the child finished a session, logged a test or tried a daily challenge that week.' +
            (billing === 'grace' ? ' In the grace days: the report adds a payment line.' : ''),
        };

  const [stored] = await db
    .select({ snapshot: schema.weeklyReports.snapshot })
    .from(schema.weeklyReports)
    .where(and(eq(schema.weeklyReports.studentId, student.id), eq(schema.weeklyReports.weekStart, a.week.start)))
    .limit(1);
  const preview = buildWeeklyReport(
    await loadReportInput({
      student,
      week: a.week,
      billing: billing ?? 'active',
      builtLater: a.week.start !== lastFinishedWeek(a.now).start,
    }),
  );

  return {
    student: { id: student.id, name: student.name },
    parent: { email: row.parentEmail },
    week: a.week,
    eligibility,
    stored: stored?.snapshot ?? null,
    preview,
  };
}
