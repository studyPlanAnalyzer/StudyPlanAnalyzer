import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { isBillingEnabled } from '@/lib/billing/config';
import { billingStateOf, isDue } from '@/lib/billing/state';
import { canonicalSchoolCode } from '@/lib/billing/codes';
import { rateLimit } from '@/lib/rate-limit';

const bodySchema = z.object({
  studentId: z.string().uuid(),
  code: z.string().min(1).max(40),
});

/**
 * The fee was paid to the school: the parent pastes the reference code the
 * school gave them. A valid code from a school whose payment is active covers
 * the child until the school's paid-until date, at once, with no checking.
 */
export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = await getAuthUserId(req);
  if (!userId) return unauthorizedResponse();
  // A valid code unlocks the child for free, so codes can't be tried en masse.
  const limited = rateLimit(`school-code:${userId}`, 10, 15 * 60);
  if (limited) return limited;

  if (!isBillingEnabled())
    return NextResponse.json(
      { error: 'Billing is switched off.' },
      { status: 400 },
    );

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json(
      { error: 'Enter the reference code.' },
      { status: 400 },
    );
  const { studentId } = parsed.data;

  const canonical = canonicalSchoolCode(parsed.data.code);
  const [children, schools] = await Promise.all([
    db
      .select({
        id: schema.students.id,
        name: schema.students.name,
        paidUntil: schema.students.paidUntil,
        paymentStatus: schema.students.paymentStatus,
      })
      .from(schema.students)
      .where(eq(schema.students.parentId, userId)),
    canonical
      ? db
          .select()
          .from(schema.schools)
          .where(eq(schema.schools.referenceCode, canonical))
          .limit(1)
      : Promise.resolve([]),
  ]);
  const child = children.find((c) => c.id === studentId);
  if (!child)
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const state = billingStateOf(child.paidUntil, child.paymentStatus);
  if (state === 'pending')
    return NextResponse.json(
      { error: `${child.name}'s payment is waiting to be verified.` },
      { status: 409 },
    );
  if (!isDue(state))
    return NextResponse.json(
      { error: `${child.name} is already paid up.` },
      { status: 409 },
    );

  const school = schools[0];
  if (!school)
    return NextResponse.json(
      {
        error:
          "That code isn't right. Check it with your school office and try again.",
      },
      { status: 400 },
    );
  if (!school.paidUntil || school.paidUntil.getTime() <= Date.now())
    return NextResponse.json(
      {
        error: `${school.name}'s payment isn't active right now. Please ask the school office.`,
      },
      { status: 400 },
    );

  await db.transaction(async (tx) => {
    await tx
      .update(schema.payments)
      .set({ status: 'superseded' })
      .where(
        and(
          eq(schema.payments.studentId, studentId),
          inArray(schema.payments.status, ['awaiting', 'pending']),
        ),
      );
    await tx
      .update(schema.students)
      .set({
        schoolId: school.id,
        paidUntil: school.paidUntil,
        paymentStatus: 'school',
        updatedAt: new Date(),
      })
      .where(eq(schema.students.id, studentId));
  });

  return NextResponse.json({
    status: 'school',
    schoolName: school.name,
    paidUntil: school.paidUntil.toISOString(),
  });
});
