import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { billingInfoFor } from '@/lib/billing/pricing';

/**
 * Billing details for one child (state, dates, prices) plus what the payment
 * form pre-fills. Never blocked, so a locked child can still show it.
 */
export const GET = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const [children, users] = await Promise.all([
      db
        .select({
          id: schema.students.id,
          name: schema.students.name,
          schoolName: schema.students.schoolName,
          createdAt: schema.students.createdAt,
          paidUntil: schema.students.paidUntil,
          paymentStatus: schema.students.paymentStatus,
        })
        .from(schema.students)
        .where(eq(schema.students.parentId, userId)),
      db
        .select({ name: schema.users.name })
        .from(schema.users)
        .where(eq(schema.users.id, userId))
        .limit(1),
    ]);
    const child = children.find((c) => c.id === params.id);
    if (!child)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    return NextResponse.json({
      studentId: child.id,
      childName: child.name,
      schoolName: child.schoolName ?? '',
      parentName: users[0]?.name ?? '',
      billing: billingInfoFor(children, child.id),
    });
  },
);
