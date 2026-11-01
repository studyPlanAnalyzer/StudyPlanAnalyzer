'use client';;
import { use } from "react";

import { useRouter } from 'next/navigation';
import { PaymentFlow } from '@/components/billing/PaymentFlow';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { PageMain, PageShell } from '@/components/ui/PageShell';

export default function PayPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  return (
    <PageShell className="pb-10">
      <AppHeader>
        <BackLink href="/dashboard" label="Back to dashboard" short="Dashboard" />
      </AppHeader>
      <PageMain>
        <PaymentFlow
          studentId={params.id}
          onDone={() => router.push(`/students/${params.id}/analysis`)}
        />
      </PageMain>
    </PageShell>
  );
}
