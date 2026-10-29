import { GRACE_DAYS, isBillingEnabled } from './config';

/**
 * active  - paid; everything works.
 * pending - the parent says they have paid and an admin hasn't checked yet;
 *           everything works for now.
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
  if (!paidUntil) return 'unpaid';
  if (now.getTime() < paidUntil.getTime())
    return paymentStatus === 'pending' ? 'pending' : 'active';
  // Past the date. A payment that was never checked in time is locked at
  // once; a normal paid period gets its grace days.
  if (paymentStatus === 'pending') return 'locked';
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

/** Adds calendar months in UTC, keeping the day (or the month's last day). */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}
