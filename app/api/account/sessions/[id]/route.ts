import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  getAuthUserId,
  sessionFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { clearAuthCookies } from '@/lib/auth/cookies';

/**
 * Signs one of the parent's devices out: its session (and refresh tokens)
 * is deleted, so that device's next request is signed out at once. Signing
 * out this device also clears its cookies.
 */
export const DELETE = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const ended = await db
      .delete(schema.userSessions)
      .where(
        and(
          eq(schema.userSessions.id, params.id),
          eq(schema.userSessions.userId, userId),
        ),
      )
      .returning({ id: schema.userSessions.id });
    if (ended.length === 0)
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });

    const res = NextResponse.json({ signedOut: true });
    if (params.id === sessionFromRequest(req)?.sid) clearAuthCookies(res);
    return res;
  },
);
