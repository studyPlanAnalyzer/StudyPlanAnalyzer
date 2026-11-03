import { NextRequest, NextResponse } from 'next/server';
import { and, desc, eq, gt } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  getAuthUserId,
  sessionFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { deviceLabel } from '@/lib/auth/device';

/** The parent's signed-in devices (live sessions), newest first. */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const userId = await getAuthUserId(req);
  if (!userId) return unauthorizedResponse();
  const current = sessionFromRequest(req)?.sid;

  const rows = await db
    .select({
      id: schema.userSessions.id,
      userAgent: schema.userSessions.userAgent,
      createdAt: schema.userSessions.createdAt,
    })
    .from(schema.userSessions)
    .where(
      and(
        eq(schema.userSessions.userId, userId),
        gt(schema.userSessions.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(schema.userSessions.createdAt));

  return NextResponse.json({
    sessions: rows.map((s) => ({
      id: s.id,
      device: deviceLabel(s.userAgent),
      signedInAt: s.createdAt.toISOString(),
      current: s.id === current,
    })),
  });
});
