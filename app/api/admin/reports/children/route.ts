import { NextRequest, NextResponse } from 'next/server';
import { forbiddenResponse, getUserFromRequest, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { recentWeeks, searchChildren } from '@/lib/reports/admin';

/** Children to preview (by child name or parent email), and recent weeks. */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const q = (req.nextUrl.searchParams.get('q') ?? '').slice(0, 100);
  const [children, weeks] = await Promise.all([searchChildren(q), Promise.resolve(recentWeeks(new Date()))]);
  return NextResponse.json({ children, weeks });
});
