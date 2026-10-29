import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  forbiddenResponse,
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { addMonths } from '@/lib/billing/state';

/**
 * The payment was checked and is good: the child is paid for the plan's
 * months, counted from now.
 */
export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();
    if (!user.isAdmin) return forbiddenResponse();

    const result = await db.transaction(async (tx) => {
      const now = new Date();
      const [payment] = await tx
        .update(schema.payments)
        .set({ status: 'verified', reviewedAt: now, reviewedBy: user.id })
        .where(
          and(
            eq(schema.payments.id, params.id),
            eq(schema.payments.status, 'pending'),
          ),
        )
        .returning();
      if (!payment) return null;
      let paidUntil: Date | null = null;
      if (payment.studentId) {
        paidUntil = addMonths(now, payment.months);
        await tx
          .update(schema.students)
          .set({ paidUntil, paymentStatus: 'verified', updatedAt: now })
          .where(eq(schema.students.id, payment.studentId));
      }
      return { payment, paidUntil };
    });
    if (!result)
      return NextResponse.json(
        { error: 'This payment is not waiting to be checked.' },
        { status: 409 },
      );
    return NextResponse.json({
      payment: result.payment,
      paidUntil: result.paidUntil?.toISOString() ?? null,
    });
  },
);
