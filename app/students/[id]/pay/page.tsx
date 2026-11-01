'use client';;
import { use } from "react";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PaymentFlow } from '@/components/billing/PaymentFlow';

export default function PayPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="relative z-30 bg-[#FAF9F6]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-5 py-5 sm:gap-6 sm:px-7 lg:px-0">
          <Link
            href="/dashboard"
            className="flex min-w-0 items-center gap-3 sm:gap-4"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-black text-xl font-bold text-white sm:h-14 sm:w-14 sm:text-2xl">
              S
            </div>
            <span className="truncate text-lg font-bold tracking-tight sm:text-2xl">
              StudyPlan Analyzer
            </span>
          </Link>

          <Link
            href="/dashboard"
            className="flex h-12 shrink-0 items-center justify-center rounded-full bg-[#F0EFED] px-5 text-sm font-semibold transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:px-6 sm:text-base"
          >
            <span className="sm:hidden">Dashboard</span>
            <span className="hidden sm:inline">← Back to dashboard</span>
          </Link>
        </div>
      </header>
      <main className="px-6 py-10">
        <PaymentFlow
          studentId={params.id}
          onDone={() => router.push(`/students/${params.id}/analysis`)}
        />
      </main>
    </div>
  );
}
