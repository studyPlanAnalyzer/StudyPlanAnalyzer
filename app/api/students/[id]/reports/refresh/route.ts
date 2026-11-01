import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { reportChild } from '@/lib/reports/access';
import { refreshReports } from '@/lib/reports/generate';

/** Called when a child's reports are opened: makes any reports now due for
 * this child, before the page reads them. */
export const POST = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();
    const child = await reportChild(params.id, userId);
    if (child instanceof NextResponse) return child;
    const { built } = await refreshReports({ parentId: userId, studentId: child.id });
    return NextResponse.json({ built });
  },
);
