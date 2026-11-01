import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { reportChild, weekStartSchema } from '@/lib/reports/access';

/** One stored weekly report, exactly as it was made (the snapshot). Reading
 * it changes nothing; the page marks it read with POST …/read. */
export const GET = withErrorHandling(
  async (
    req: NextRequest,
    props: { params: Promise<{ id: string; weekStart: string }> },
  ) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();
    if (!weekStartSchema.safeParse(params.weekStart).success)
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });

    const child = await reportChild(params.id, userId);
    if (child instanceof NextResponse) return child;

    const [row] = await db
      .select({
        snapshot: schema.weeklyReports.snapshot,
        generatedAt: schema.weeklyReports.generatedAt,
        readAt: schema.weeklyReports.readAt,
      })
      .from(schema.weeklyReports)
      .where(
        and(
          eq(schema.weeklyReports.studentId, child.id),
          eq(schema.weeklyReports.weekStart, params.weekStart),
        ),
      )
      .limit(1);
    if (!row)
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });

    return NextResponse.json({ report: row.snapshot, readAt: row.readAt });
  },
);
