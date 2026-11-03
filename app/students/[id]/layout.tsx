'use client';

import { useCallback, useEffect, useRef, useState, use } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { Notice } from '@/components/ui/Notice';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { PaymentFlow } from '@/components/billing/PaymentFlow';
import type { BillingInfo } from '@/lib/billing/pricing';
import { formatInstantDay } from '@/lib/utils/date-utils';

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
      <PageShell>
        <div className="mx-auto max-w-3xl px-5 py-10 sm:px-7">
          <SkeletonCard />
        </div>
      </PageShell>
    );
  }

  const billing = data?.billing;
  if (billing && (billing.state === 'locked' || billing.state === 'unpaid')) {
    return (
      <PageShell className="pb-10">
        <AppHeader>
          <BackLink href="/dashboard" label="Back to dashboard" short="Dashboard" />
        </AppHeader>
        <PageMain>
          {billing.state === 'locked' &&
            billing.paymentStatus !== 'rejected' && (
              <Notice tone="warning" className="mx-auto mb-6 max-w-3xl font-medium">
                {data?.childName}&apos;s payment is due, so the app is locked.
                Pay below to unlock it.
              </Notice>
            )}
          <PaymentFlow
            studentId={params.id}
            onDone={() => {
              load();
              router.refresh();
            }}
          />
        </PageMain>
      </PageShell>
    );
  }

  return (
    <>
      {billing?.state === 'grace' && (
        <div className="border-b border-amber-200 bg-[#fff5dc] px-5 py-3 text-center text-sm font-medium text-[#805500]">
          Payment due for {data?.childName}. The app will lock on{' '}
          {billing.graceEndsAt
            ? formatInstantDay(billing.graceEndsAt)
            : 'soon'}
          .{' '}
          <Link
            href={`/students/${params.id}/pay`}
            className="inline-flex min-h-11 items-center font-semibold underline"
          >
            Pay now
          </Link>
        </div>
      )}
      {billing?.state === 'pending' && (
        <div className="border-b border-black/5 bg-[#EEF0FF] px-5 py-3 text-center text-sm font-medium text-black">
          We&apos;re checking your payment, usually within 24 hours. The app stays open while we check.
        </div>
      )}
      {children}
    </>
  );
}
