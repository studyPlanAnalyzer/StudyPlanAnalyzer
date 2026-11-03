// Billing rules in one place. Prices are whole rupees.
//
// Payment is manual for now: the parent pays our QR, tells us the transaction
// id, and an admin checks it. (Or a school pays in bulk and gives its parents
// a reference code.)

export type PlanId = 'monthly' | 'term';

export const PLANS: Record<
  PlanId,
  {
    label: string;
    months: number;
    /** Price for the parent's oldest child. */
    firstRs: number;
    /** Price for every other child. */
    additionalRs: number;
  }
> = {
  monthly: { label: 'Monthly', months: 1, firstRs: 250, additionalRs: 200 },
  term: {
    label: 'Term (3 months)',
    months: 3,
    firstRs: 600,
    additionalRs: 500,
  },
};

export const PLAN_IDS = Object.keys(PLANS) as PlanId[];

/** Days after a paid period ends in which the child still works. */
export const GRACE_DAYS = 2;

/**
 * Payments waiting to be checked longer than these are flagged to admins
 * (we tell parents "within 24 hours"). The child stays usable either way.
 */
export const PENDING_SLOW_HOURS = 24;
export const PENDING_OVERDUE_HOURS = 48;

/** The payment QR image: put yours at public/payment-qr.png. */
export const PAYMENT_QR_URL = '/payment-qr.png';

/** Set BILLING_ENABLED=false to switch billing off (for development). */
export function isBillingEnabled(): boolean {
  return process.env.BILLING_ENABLED !== 'false';
}
