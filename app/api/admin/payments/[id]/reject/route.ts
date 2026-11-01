import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  forbiddenResponse,
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';

const bodySchema = z.object({ note: z.string().trim().max(500).optional() });

/**
 * The payment couldn't be verified: the child goes back to how it was before
 * the temporary access, marked as rejected, so the parent is asked to pay
 * again.
 */
export const POST = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();
    if (!user.isAdmin) return forbiddenResponse();

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed' }, { status: 400 });

    const payment = await db.transaction(async (tx) => {
      const now = new Date();
      const [p] = await tx
        .update(schema.payments)
        .set({
          status: 'rejected',
          adminNote: parsed.data.note || null,
          reviewedAt: now,
          reviewedBy: user.id,
        })
        .where(
          and(
            eq(schema.payments.id, params.id),
            eq(schema.payments.status, 'pending'),
          ),
        )
        .returning();
      if (!p) return null;
      if (p.studentId) {
        // Only if this payment is the one the child is waiting on.
        await tx
          .update(schema.students)
          .set({
            paidUntil: p.previousPaidUntil,
            paymentStatus: 'rejected',
            updatedAt: now,
          })
          .where(
            and(
              eq(schema.students.id, p.studentId),
              eq(schema.students.paymentStatus, 'pending'),
            ),
          );
      }
      return p;
    });
    if (!payment)
      return NextResponse.json(
        { error: 'This payment is not waiting to be checked.' },
        { status: 409 },
      );
    return NextResponse.json({ payment });
  },
);
