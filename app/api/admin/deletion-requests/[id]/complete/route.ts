import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  forbiddenResponse,
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { deleteAccount } from '@/lib/account-deletion';

/**
 * Carries out a waiting deletion request: the account and all its data are
 * deleted (payments kept with names removed). The request keeps only its
 * reason and dates; the email it held is cleared.
 */
export const POST = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const admin = await getUserFromRequest(req);
    if (!admin) return unauthorizedResponse();
    if (!admin.isAdmin) return forbiddenResponse();

    const done = await db.transaction(async (tx) => {
      const [request] = await tx
        .select()
        .from(schema.deletionRequests)
        .where(
          and(
            eq(schema.deletionRequests.id, params.id),
            eq(schema.deletionRequests.status, 'pending'),
          ),
        )
        .for('update');
      if (!request) return false;
      await tx
        .update(schema.deletionRequests)
        .set({
          status: 'completed',
          email: null,
          handledAt: new Date(),
          handledBy: admin.id === request.userId ? null : admin.id,
        })
        .where(eq(schema.deletionRequests.id, request.id));
      if (request.userId) await deleteAccount(tx, request.userId);
      return true;
    });
    if (!done)
      return NextResponse.json(
        { error: 'This request is not waiting any more.' },
        { status: 409 },
      );
    return NextResponse.json({ completed: true });
  },
);
