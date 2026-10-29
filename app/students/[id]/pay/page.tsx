'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { PaymentFlow } from '@/components/billing/PaymentFlow';

export default function PayPage({ params }: { params: { id: string } }) {
  const router = useRouter();
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
        <PaymentFlow
          studentId={params.id}
          onDone={() => router.push(`/students/${params.id}/analysis`)}
        />
      </main>
    </div>
  );
}
