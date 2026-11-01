import { NextRequest, NextResponse } from 'next/server';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { reportChild, weekStartSchema } from '@/lib/reports/access';

/** Marks the report read (the first time only), which clears the "New
 * weekly report" notice on the dashboard. */
export const POST = withErrorHandling(
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

    await db
      .update(schema.weeklyReports)
      .set({ readAt: new Date() })
      .where(
        and(
          eq(schema.weeklyReports.studentId, child.id),
          eq(schema.weeklyReports.weekStart, params.weekStart),
          isNull(schema.weeklyReports.readAt),
        ),
      );
    return NextResponse.json({ read: true });
  },
);
