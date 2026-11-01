'use client';

import { useCallback, useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { PaymentFlow } from '@/components/billing/PaymentFlow';
import type { BillingInfo } from '@/lib/billing/pricing';

interface BillingResponse {
  childName: string;
  billing: BillingInfo;
}

/**
 * Wraps every page of a child. A child whose payment is missing or not
 * verified sees the payment steps instead of the page (so every button leads
 * to payment); a child in the grace days or waiting for verification sees a
 * notice above the page.
 */
export default function StudentLayout(
  props: {
    children: React.ReactNode;
    params: Promise<{ id: string }>;
  }
) {
  const params = use(props.params);

  const {
    children
  } = props;

  const router = useRouter();
  const pathname = usePathname();
  const [data, setData] = useState<BillingResponse | null>(null);
  const lastState = useRef<string | null>(null);

  // "new" is the setup screen of a child that isn't saved yet: no billing.
  const isDraft = params.id === 'new';

  const load = useCallback(() => {
    if (isDraft) return;
    api
      .get<BillingResponse>(`/api/students/${params.id}/billing`)
      .then((d) => {
        lastState.current = d.billing.state;
        setData(d);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        // If billing can't be read, let the page show its own error.
        setData(null);
        lastState.current = 'unknown';
      });
  }, [params.id, router, isDraft]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  // A request that came back 402 (for example the paid period ended while the
  // page was open) makes the shell look again, which shows the payment steps.
  useEffect(() => {
    function onRequired(e: Event) {
      const id = (e as CustomEvent<{ studentId?: string }>).detail?.studentId;
      if (!id || id === params.id) load();
    }
    window.addEventListener('payment-required', onRequired);
    return () => window.removeEventListener('payment-required', onRequired);
  }, [params.id, load]);

  // Anything other than a plainly paid child is looked at again on each
  // navigation, so it unlocks (or locks) without a reload.
  useEffect(() => {
    if (lastState.current && lastState.current !== 'active') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const onPayPage = pathname.endsWith('/pay');
  if (isDraft || onPayPage) return <>{children}</>;

  if (lastState.current === null) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <SkeletonCard />
      </div>
    );
  }

  const billing = data?.billing;
  if (billing && (billing.state === 'locked' || billing.state === 'unpaid')) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
            <Link
              href="/dashboard"
              className="text-lg font-semibold text-indigo-700"
            >
              StudyPlan Analyzer
            </Link>
            <Link
              href="/dashboard"
              className="text-sm text-slate-500 hover:text-slate-800"
            >
              Back to dashboard
            </Link>
          </div>
        </header>
        <main className="px-6 py-10">
          {billing.state === 'locked' &&
            billing.paymentStatus !== 'rejected' && (
              <p className="mx-auto mb-4 max-w-xl rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {data?.childName}&apos;s payment is due, so the app is locked.
                Pay below to unlock it.
              </p>
            )}
          <PaymentFlow
            studentId={params.id}
            onDone={() => {
              load();
              router.refresh();
            }}
          />
        </main>
      </div>
    );
  }

  return (
    <>
      {billing?.state === 'grace' && (
        <div className="border-b border-amber-200 bg-amber-50 px-6 py-2 text-center text-sm text-amber-900">
          Payment due for {data?.childName}. The app will lock on{' '}
          {billing.graceEndsAt
            ? new Date(billing.graceEndsAt).toLocaleDateString()
            : 'soon'}
          .{' '}
          <Link
            href={`/students/${params.id}/pay`}
            className="font-semibold underline"
          >
            Pay now
          </Link>
        </div>
      )}
      {billing?.state === 'pending' && (
        <div className="border-b border-indigo-200 bg-indigo-50 px-6 py-2 text-center text-sm text-indigo-900">
          Your payment will be verified within 24 hours.
        </div>
      )}
      {children}
    </>
  );
}
