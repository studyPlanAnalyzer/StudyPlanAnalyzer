import { GRACE_DAYS, isBillingEnabled } from './config';
import { APP_UTC_OFFSET_MS } from '@/lib/utils/date-utils';

/**
 * active  - paid; everything works.
 * pending - the parent says they have paid and an admin hasn't checked yet;
 *           everything works until an admin verifies or rejects it, however
 *           long that takes (an admin's delay never locks a child).
 * grace   - a paid period ended less than GRACE_DAYS ago; still works, but
 *           payment is due.
 * locked  - nothing works until it is paid (and verified).
 * unpaid  - never paid (a new child); locked in the same way.
 */
export type BillingState = 'active' | 'pending' | 'grace' | 'locked' | 'unpaid';

/** Stored on the child: how the current period came about. */
export type PaymentStatus =
  | 'none'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'school';

export type BillingRow = {
  id: string;
  paidUntil: Date | null;
  paymentStatus: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function graceEndsAt(paidUntil: Date): Date {
  return new Date(paidUntil.getTime() + GRACE_DAYS * DAY_MS);
}

export function billingStateOf(
  paidUntil: Date | null,
  paymentStatus: string,
  now: Date = new Date(),
): BillingState {
  if (!isBillingEnabled()) return 'active';
  // A submitted payment keeps the child usable until an admin verifies it (a
  // new paid period) or rejects it (back to how it was before), so a slow
  // check never locks the child or pushes the parent into paying twice. A
  // fake transaction id is stopped by the rejection, and each id can only be
  // used once.
  if (paymentStatus === 'pending') return 'pending';
  if (!paidUntil) return 'unpaid';
  if (now.getTime() < paidUntil.getTime()) return 'active';
  // Past the date: a paid period gets its grace days, then locks.
  return now.getTime() < graceEndsAt(paidUntil).getTime() ? 'grace' : 'locked';
}

/** Whether the child's pages and data can be used. */
export function canUse(state: BillingState): boolean {
  return state === 'active' || state === 'pending' || state === 'grace';
}

/** Whether a pay button should be offered (never while paid or waiting). */
export function isDue(state: BillingState): boolean {
  return state === 'grace' || state === 'locked' || state === 'unpaid';
}

/**
 * Adds calendar months as they run in Nepal, keeping the day (or the month's
 * last day) and the time of day: paid on 31 January at 01:00 in Nepal runs to
 * 28/29 February at 01:00 there, whatever the server's time zone.
 */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime() + APP_UTC_OFFSET_MS);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return new Date(d.getTime() - APP_UTC_OFFSET_MS);
}
