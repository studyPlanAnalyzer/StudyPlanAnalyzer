import { NextRequest, NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  forbiddenResponse,
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';

/**
 * Payments for an admin to check. ?status=pending (default) shows what is
 * waiting, oldest first; ?status=all shows the latest 200 of any status.
 */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const status = req.nextUrl.searchParams.get('status') ?? 'pending';
  const base = db
    .select({
      payment: schema.payments,
      parentEmail: schema.users.email,
      accountName: schema.users.name,
    })
    .from(schema.payments)
    .innerJoin(schema.users, eq(schema.users.id, schema.payments.userId));

  const rows =
    status === 'all'
      ? await base.orderBy(desc(schema.payments.createdAt)).limit(200)
      : await base
          .where(eq(schema.payments.status, status))
          .orderBy(schema.payments.submittedAt)
          .limit(200);

  return NextResponse.json({
    payments: rows.map((r) => ({
      ...r.payment,
      parentEmail: r.parentEmail,
      accountName: r.accountName,
    })),
  });
});
