import { NextRequest, NextResponse } from 'next/server';
import { and, eq, ne } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  getAuthUserId,
  sessionFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';

/** Signs the parent out everywhere except this device. */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = await getAuthUserId(req);
  const current = sessionFromRequest(req)?.sid;
  if (!userId || !current) return unauthorizedResponse();

  const ended = await db
    .delete(schema.userSessions)
    .where(
      and(
        eq(schema.userSessions.userId, userId),
        ne(schema.userSessions.id, current),
      ),
    )
    .returning({ id: schema.userSessions.id });
  return NextResponse.json({ signedOut: ended.length });
});
