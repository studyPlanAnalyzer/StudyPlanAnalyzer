import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { refreshReports } from '@/lib/reports/generate';

/**
 * Called by the dashboard in the background: makes any weekly reports now
 * due for this parent's children (usually none: one query), then returns the
 * children whose newest report hasn't been opened, for the "New weekly
 * report" notice. A POST because it may create reports.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = await getAuthUserId(req);
  if (!userId) return unauthorizedResponse();
  const { unread } = await refreshReports({ parentId: userId });
  return NextResponse.json({ unread });
});
