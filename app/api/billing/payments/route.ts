import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { PLANS, isBillingEnabled } from '@/lib/billing/config';
import { billingStateOf, isDue } from '@/lib/billing/state';
import { isPlanId, priceFor, rankOf } from '@/lib/billing/pricing';
import { makeRemarkCode } from '@/lib/billing/codes';

const bodySchema = z.object({
  studentId: z.string().uuid(),
  plan: z.string(),
});

/**
 * Step 1 of paying by QR: the parent chose a plan. The price is worked out
 * here, from the child's position among the parent's children, and a payment
 * is recorded with a random remark code (which includes the child's name) for
 * the parent to put in their payment. A payment can only be started while one
 * is due, never early and never while another is waiting to be checked.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = getAuthUserId(req);
  if (!userId) return unauthorizedResponse();

  if (!isBillingEnabled())
    return NextResponse.json(
      { error: 'Billing is switched off.' },
      { status: 400 },
    );

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success || !isPlanId(parsed.data.plan))
    return NextResponse.json(
      { error: 'Choose the monthly or the term plan.' },
      { status: 400 },
    );
  const { studentId } = parsed.data;
  const plan = parsed.data.plan;

  const children = await db
    .select({
      id: schema.students.id,
      name: schema.students.name,
      createdAt: schema.students.createdAt,
      paidUntil: schema.students.paidUntil,
      paymentStatus: schema.students.paymentStatus,
    })
    .from(schema.students)
    .where(eq(schema.students.parentId, userId));
  const child = children.find((c) => c.id === studentId);
  if (!child)
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const state = billingStateOf(child.paidUntil, child.paymentStatus);
  if (state === 'pending')
    return NextResponse.json(
      {
        error: `${child.name}'s payment is waiting to be verified. There's nothing more to pay right now.`,
      },
      { status: 409 },
    );
  if (!isDue(state))
    return NextResponse.json(
      { error: `${child.name} is already paid up. Payment isn't due yet.` },
      { status: 409 },
    );

  const amountRs = priceFor(plan, rankOf(children, studentId));

  // Earlier unfinished attempts for this child are replaced by this one.
  // A clash on the random remark code is astronomically unlikely, but retry.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const payment = await db.transaction(async (tx) => {
        await tx
          .update(schema.payments)
          .set({ status: 'superseded' })
          .where(
            and(
              eq(schema.payments.studentId, studentId),
              eq(schema.payments.status, 'awaiting'),
            ),
          );
        const [created] = await tx
          .insert(schema.payments)
          .values({
            userId,
            studentId,
            plan,
            months: PLANS[plan].months,
            amountRs,
            remarkCode: makeRemarkCode(child.name),
          })
          .returning();
        return created;
      });
      return NextResponse.json(
        {
          paymentId: payment.id,
          plan,
          months: payment.months,
          amountRs: payment.amountRs,
          remarkCode: payment.remarkCode,
        },
        { status: 201 },
      );
    } catch (err: any) {
      const code = err?.code ?? err?.cause?.code;
      if (code !== '23505' || attempt === 2) throw err;
    }
  }
  throw new Error('unreachable');
});
