import { NextRequest, NextResponse } from 'next/server';
import { desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { reportChild } from '@/lib/reports/access';

/** The child's weekly reports, newest first: just what the list shows. */
export const GET = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const child = await reportChild(params.id, userId);
    if (child instanceof NextResponse) return child;

    const reports = await db
      .select({
        weekStart: schema.weeklyReports.weekStart,
        weekEnd: sql<string>`${schema.weeklyReports.snapshot}->'week'->>'end'`,
        headline: sql<string>`${schema.weeklyReports.snapshot}->>'headline'`,
        // Version 3 reports count topics done; version 2 ones, minutes.
        topicsDone: sql<number | null>`(${schema.weeklyReports.snapshot}->'topicsDone'->>'count')::int`,
        studyMinutes: sql<number | null>`(${schema.weeklyReports.snapshot}->'studyTime'->>'minutes')::int`,
        builtLater: sql<boolean>`coalesce((${schema.weeklyReports.snapshot}->'context'->>'builtLater')::boolean, false)`,
        readAt: schema.weeklyReports.readAt,
      })
      .from(schema.weeklyReports)
      .where(eq(schema.weeklyReports.studentId, child.id))
      .orderBy(desc(schema.weeklyReports.weekStart));

    return NextResponse.json({ student: child, reports });
  },
);
