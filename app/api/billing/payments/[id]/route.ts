import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { billingStateOf, isDue } from '@/lib/billing/state';

class Conflict extends Error {}

const bodySchema = z.object({
  transactionId: z
    .string()
    .trim()
    .min(4, 'Enter the transaction ID from your payment.')
    .max(64)
    .regex(
      /^[A-Za-z0-9._\-\/]+$/,
      'The transaction ID looks wrong. Copy it exactly.',
    ),
  parentName: z.string().trim().min(1, 'Enter your name.').max(200),
  childName: z.string().trim().min(1, "Enter your child's name.").max(200),
  schoolName: z.string().trim().min(1, 'Enter the school name.').max(200),
});

/**
 * Step 2 of paying by QR: the parent says they have paid and gives the
 * transaction id and names. The child can be used straight away while an
 * admin checks the payment. If the payment is later rejected, the child is
 * put back as it was.
 */
export const PUT = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      const first = Object.values(parsed.error.flatten().fieldErrors)
        .flat()
        .find(Boolean);
      return NextResponse.json(
        {
          error: first ?? 'Validation failed',
          details: parsed.error.flatten(),
        },
        { status: 400 },
      );
    }
    const data = parsed.data;
    // Compared without regard to capitals, so one id can't be used twice.
    const transactionId = data.transactionId.toUpperCase();

    const [payment] = await db
      .select()
      .from(schema.payments)
      .where(
        and(
          eq(schema.payments.id, params.id),
          eq(schema.payments.userId, userId),
        ),
      )
      .limit(1);
    if (!payment)
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    if (payment.status === 'pending')
      return NextResponse.json({ status: 'pending' }); // already submitted
    if (payment.status !== 'awaiting' || !payment.studentId)
      return NextResponse.json(
        {
          error: 'This payment can no longer be submitted. Please start again.',
        },
        { status: 409 },
      );
    const studentId = payment.studentId;

    try {
      await db.transaction(async (tx) => {
        const [student] = await tx
          .select({
            paidUntil: schema.students.paidUntil,
            paymentStatus: schema.students.paymentStatus,
          })
          .from(schema.students)
          .where(
            and(
              eq(schema.students.id, studentId),
              eq(schema.students.parentId, userId),
            ),
          )
          .limit(1);
        if (!student) throw new Conflict('Student not found');
        if (!isDue(billingStateOf(student.paidUntil, student.paymentStatus)))
          throw new Conflict("Payment isn't due for this child.");

        // Anything else of this child's that was waiting is replaced.
        await tx
          .update(schema.payments)
          .set({ status: 'superseded' })
          .where(
            and(
              eq(schema.payments.studentId, studentId),
              inArray(schema.payments.status, ['awaiting', 'pending']),
            ),
          );
        const now = new Date();
        await tx
          .update(schema.payments)
          .set({
            status: 'pending',
            transactionId,
            parentName: data.parentName,
            childName: data.childName,
            schoolName: data.schoolName,
            previousPaidUntil: student.paidUntil,
            submittedAt: now,
          })
          .where(eq(schema.payments.id, payment.id));

        // The paid-until date is left as it was: 'pending' alone keeps the
        // child usable until the payment is verified (a new period) or
        // rejected (this date applies again).
        await tx
          .update(schema.students)
          .set({ paymentStatus: 'pending', updatedAt: now })
          .where(eq(schema.students.id, studentId));
      });
      return NextResponse.json({ status: 'pending' });
    } catch (err: any) {
      if (err instanceof Conflict)
        return NextResponse.json({ error: err.message }, { status: 409 });
      const code = err?.code ?? err?.cause?.code;
      if (code === '23505')
        return NextResponse.json(
          {
            error:
              'This transaction ID has already been used. Check it and try again.',
          },
          { status: 409 },
        );
      throw err;
    }
  },
);
