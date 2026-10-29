import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { isBillingEnabled } from './config';
import { billingStateOf, canUse, type BillingRow } from './state';

/**
 * 402 for a child whose payment is due, unverified or missing. The shared api
 * client turns this into the payment pop-up.
 */
export function paymentRequiredResponse(
  student: BillingRow,
): NextResponse | null {
  const state = billingStateOf(student.paidUntil, student.paymentStatus);
  if (canUse(state)) return null;
  return NextResponse.json(
    {
      error:
        student.paymentStatus === 'rejected'
          ? "We couldn't verify the last payment for this child. Please pay again."
          : 'Payment is due for this child.',
      code: 'PAYMENT_REQUIRED',
      studentId: student.id,
      state,
      paymentStatus: student.paymentStatus,
    },
    { status: 402 },
  );
}

// A child that is plainly paid stays usable until its paidUntil, and a normal
// payment can only move that date later, so remembering "usable until X" can't
// let anyone in wrongly. Only 'active' children are remembered: a child that
// is pending (an admin may reject it any moment), due or locked is always
// looked up fresh. One entry per server instance; a cold instance just looks
// the child up once.
const paidCache = new Map<string, number>();
const CACHE_MAX = 5000;

/**
 * For routes that don't already read the child's row: checks the child can be
 * used, with no database trip once it is known to be paid. Returns a 402
 * response if not, or null (also null when the child isn't this parent's, so
 * the route's own ownership check answers 404 as before).
 */
export async function requireChildAccess(
  studentId: string,
  userId: string,
  opts: { requireOwner?: boolean } = {},
): Promise<NextResponse | null> {
  // requireOwner: for routes that have no ownership check of their own. A
  // child that isn't this parent's is a 404 instead of being waved through.
  const strict = opts.requireOwner === true;
  if (!isBillingEnabled() && !strict) return null;
  const key = `${userId}:${studentId}`;
  const until = paidCache.get(key);
  if (until !== undefined && until > Date.now()) return null;

  const [row] = await db
    .select({
      id: schema.students.id,
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
  if (!row)
    return strict
      ? NextResponse.json({ error: 'Student not found' }, { status: 404 })
      : null;

  const denied = paymentRequiredResponse(row);
  if (denied) {
    paidCache.delete(key);
    return denied;
  }
  if (
    row.paidUntil &&
    billingStateOf(row.paidUntil, row.paymentStatus) === 'active' &&
    row.paymentStatus !== 'school'
  ) {
    if (paidCache.size >= CACHE_MAX) paidCache.clear();
    paidCache.set(key, row.paidUntil.getTime());
  }
  return null;
}
