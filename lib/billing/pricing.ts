import { PLAN_IDS, PLANS, type PlanId } from './config';
import { billingStateOf, graceEndsAt, isDue, type BillingState } from './state';

export type ChildForBilling = {
  id: string;
  createdAt: Date;
  paidUntil: Date | null;
  paymentStatus: string;
};

/** 0 for the parent's oldest child, 1 for the next one, and so on. */
export function rankOf(children: ChildForBilling[], studentId: string): number {
  const sorted = [...children].sort(
    (a, b) =>
      a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id),
  );
  return sorted.findIndex((c) => c.id === studentId);
}

export function isPlanId(v: unknown): v is PlanId {
  return typeof v === 'string' && (PLAN_IDS as string[]).includes(v);
}

/** The price in rupees of a plan for the child at this position. */
export function priceFor(plan: PlanId, rank: number): number {
  return rank === 0 ? PLANS[plan].firstRs : PLANS[plan].additionalRs;
}

export type Quote = {
  plan: PlanId;
  label: string;
  months: number;
  amountRs: number;
  perMonthRs: number;
};

export function quotesFor(rank: number): Quote[] {
  return PLAN_IDS.map((plan) => {
    const amountRs = priceFor(plan, rank);
    return {
      plan,
      label: PLANS[plan].label,
      months: PLANS[plan].months,
      amountRs,
      perMonthRs: Math.round(amountRs / PLANS[plan].months),
    };
  });
}

export type BillingInfo = {
  state: BillingState;
  paymentStatus: string;
  paidUntil: string | null;
  graceEndsAt: string | null;
  /** True when a pay button should be shown. */
  due: boolean;
  quotes: Quote[];
};

/** Everything the pages need to show a child's billing, worked out on the server. */
export function billingInfoFor(
  children: ChildForBilling[],
  studentId: string,
  now: Date = new Date(),
): BillingInfo {
  const child = children.find((c) => c.id === studentId);
  const paidUntil = child?.paidUntil ?? null;
  const paymentStatus = child?.paymentStatus ?? 'none';
  const state = billingStateOf(paidUntil, paymentStatus, now);
  return {
    state,
    paymentStatus,
    paidUntil: paidUntil ? paidUntil.toISOString() : null,
    graceEndsAt: paidUntil ? graceEndsAt(paidUntil).toISOString() : null,
    due: isDue(state),
    quotes: quotesFor(Math.max(0, rankOf(children, studentId))),
  };
}
