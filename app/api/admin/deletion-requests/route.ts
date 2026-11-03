import { NextRequest, NextResponse } from 'next/server';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  forbiddenResponse,
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';

/**
 * Account deletion requests for an admin. ?status=pending (default) lists
 * what is waiting, oldest first, with what the account holds; ?status=all
 * the latest 200 of any status.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const all = req.nextUrl.searchParams.get('status') === 'all';
  const base = db
    .select({
      id: schema.deletionRequests.id,
      status: schema.deletionRequests.status,
      email: schema.deletionRequests.email,
      reason: schema.deletionRequests.reason,
      adminNote: schema.deletionRequests.adminNote,
      requestedAt: schema.deletionRequests.requestedAt,
      handledAt: schema.deletionRequests.handledAt,
      accountName: schema.users.name,
      children: sql<number>`(select count(*)::int from students s where s.parent_id = ${schema.deletionRequests.userId})`,
    })
    .from(schema.deletionRequests)
    .leftJoin(schema.users, eq(schema.users.id, schema.deletionRequests.userId));

  const requests = all
    ? await base.orderBy(desc(schema.deletionRequests.requestedAt)).limit(200)
    : await base
        .where(eq(schema.deletionRequests.status, 'pending'))
        .orderBy(asc(schema.deletionRequests.requestedAt));
  return NextResponse.json({ requests });
});
