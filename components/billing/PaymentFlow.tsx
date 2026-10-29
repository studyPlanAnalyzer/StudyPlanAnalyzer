'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { api, getErrorMessage } from '@/lib/api-client';
import { PAYMENT_QR_URL } from '@/lib/billing/config';
import type { BillingInfo } from '@/lib/billing/pricing';

export interface BillingDetails {
  studentId: string;
  childName: string;
  schoolName: string;
  parentName: string;
  billing: BillingInfo;
}

type Step = 'who' | 'plan' | 'qr' | 'details' | 'school' | 'done';
type DoneKind = 'qr' | 'school' | 'pending';

interface Started {
  paymentId: string;
  plan: string;
  months: number;
  amountRs: number;
  remarkCode: string;
}

export function PaymentFlow({
  studentId,
  onDone,
}: {
  studentId: string;
  onDone: () => void;
}) {
  const [info, setInfo] = useState<BillingDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('who');
  const [doneKind, setDoneKind] = useState<DoneKind>('qr');
  const [plan, setPlan] = useState<string>('term');
  const [started, setStarted] = useState<Started | null>(null);
  const [noted, setNoted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [txn, setTxn] = useState('');
  const [parentName, setParentName] = useState('');
  const [childName, setChildName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schoolResult, setSchoolResult] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<BillingDetails>(`/api/students/${studentId}/billing`)
      .then((d) => {
        setInfo(d);
        setParentName(d.parentName);
        setChildName(d.childName);
        setSchoolName(d.schoolName);
        if (d.billing.state === 'pending') {
          setDoneKind('pending');
          setStep('done');
        }
      })
      .catch((e) =>
        setLoadError(getErrorMessage(e, "Couldn't load payment details.")),
      );
  }, [studentId]);

  if (loadError) return <p className="text-sm text-red-600">{loadError}</p>;
  if (!info) return <SkeletonCard />;

  const { billing } = info;
  const quote =
    billing.quotes.find((q) => q.plan === plan) ?? billing.quotes[0];

  async function startPayment() {
    setBusy(true);
    setError(null);
    try {
      const s = await api.post<Started>('/api/billing/payments', {
        studentId,
        plan,
      });
      setStarted(s);
      setNoted(false);
      setStep('qr');
    } catch (e) {
      setError(getErrorMessage(e, "Couldn't start the payment."));
    } finally {
      setBusy(false);
    }
  }

  async function submitDetails() {
    if (!started) return;
    setBusy(true);
    setError(null);
    try {
      await api.put(`/api/billing/payments/${started.paymentId}`, {
        transactionId: txn.trim(),
        parentName: parentName.trim(),
        childName: childName.trim(),
        schoolName: schoolName.trim(),
      });
      setDoneKind('qr');
      setStep('done');
    } catch (e) {
      setError(getErrorMessage(e, "Couldn't submit the payment."));
    } finally {
      setBusy(false);
    }
  }

  async function submitSchoolCode() {
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ schoolName: string }>(
        '/api/billing/school-code',
        { studentId, code: code.trim() },
      );
      setSchoolResult(r.schoolName);
      setDoneKind('school');
      setStep('done');
    } catch (e) {
      setError(getErrorMessage(e, "Couldn't check that code."));
    } finally {
      setBusy(false);
    }
  }

  async function copyRemark() {
    if (!started) return;
    try {
      await navigator.clipboard.writeText(started.remarkCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* the code is shown on screen anyway */
    }
  }

  const errorBox = error && (
    <p className="mb-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
      {error}
    </p>
  );

  return (
    <div className="mx-auto w-full max-w-xl">
      {billing.paymentStatus === 'rejected' && step !== 'done' && (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          We couldn&apos;t verify the last payment for {info.childName}. The
          payment is not verified, so please pay again below.
        </p>
      )}

      {step === 'who' && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            Activate {info.childName}&apos;s account
          </h2>
          <p className="mb-5 text-sm text-slate-500">
            Who is paying for {info.childName}&apos;s study plan?
          </p>
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep('plan');
              }}
              className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-indigo-400 hover:bg-indigo-50/40"
            >
              <p className="font-semibold text-slate-900">
                I&apos;ll pay myself
              </p>
              <p className="text-sm text-slate-500">
                Pay by QR code from your phone.
              </p>
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setStep('school');
              }}
              className="rounded-2xl border border-slate-200 p-4 text-left transition hover:border-indigo-400 hover:bg-indigo-50/40"
            >
              <p className="font-semibold text-slate-900">
                The payment was already made to the school
              </p>
              <p className="text-sm text-slate-500">
                Enter the reference code your school gave you.
              </p>
            </button>
          </div>
        </Card>
      )}

      {step === 'plan' && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            Choose a plan
          </h2>
          <p className="mb-4 text-sm text-slate-500">For {info.childName}.</p>
          {errorBox}
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            {billing.quotes.map((q) => (
              <button
                key={q.plan}
                type="button"
                onClick={() => setPlan(q.plan)}
                className={clsx(
                  'rounded-2xl border p-4 text-left transition',
                  plan === q.plan
                    ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600'
                    : 'border-slate-200 hover:border-indigo-300',
                )}
              >
                <p className="text-sm font-medium text-slate-500">{q.label}</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">
                  Rs {q.amountRs}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {q.months === 1
                    ? 'for 1 month'
                    : `Rs ${q.perMonthRs}/month, for ${q.months} months`}
                </p>
              </button>
            ))}
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('who')}>
              Back
            </Button>
            <Button onClick={startPayment} isLoading={busy}>
              Continue to payment
            </Button>
          </div>
        </Card>
      )}

      {step === 'qr' && started && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            Pay Rs {started.amountRs} for the{' '}
            {started.months === 1 ? 'monthly' : `${started.months}-month`} plan
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Scan the QR code and pay exactly Rs {started.amountRs}.
          </p>
          <div className="mb-4 flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={PAYMENT_QR_URL}
              alt="Payment QR code"
              className="h-56 w-56 rounded-2xl border border-slate-200 object-contain"
            />
          </div>
          <div className="mb-4 rounded-xl bg-slate-50 p-3">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Write this in the payment remark
            </p>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className="font-mono text-lg font-semibold text-slate-900">
                {started.remarkCode}
              </span>
              <Button size="sm" variant="secondary" onClick={copyRemark}>
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
          </div>
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Keep your transaction ID</p>
            <p className="mt-1">
              After paying, copy or screenshot the <b>transaction ID</b> from
              your payment app. You must enter it on the next page so we can
              verify your payment.
            </p>
            <label className="mt-3 flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={noted}
                onChange={(e) => setNoted(e.target.checked)}
              />
              <span>I have paid and I have my transaction ID ready.</span>
            </label>
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('plan')}>
              Back
            </Button>
            <Button disabled={!noted} onClick={() => setStep('details')}>
              Next
            </Button>
          </div>
        </Card>
      )}

      {step === 'details' && started && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            Confirm your payment
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            All fields are required.
          </p>
          {errorBox}
          <div className="mb-5 flex flex-col gap-4">
            <Input
              label="Transaction ID"
              value={txn}
              onChange={(e) => setTxn(e.target.value)}
              placeholder="Copy it exactly from your payment app"
            />
            <Input
              label="Your name"
              value={parentName}
              onChange={(e) => setParentName(e.target.value)}
            />
            <Input
              label="Child's name"
              value={childName}
              onChange={(e) => setChildName(e.target.value)}
            />
            <Input
              label="School name"
              value={schoolName}
              onChange={(e) => setSchoolName(e.target.value)}
            />
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('qr')}>
              Back
            </Button>
            <Button
              onClick={submitDetails}
              isLoading={busy}
              disabled={
                !txn.trim() ||
                !parentName.trim() ||
                !childName.trim() ||
                !schoolName.trim()
              }
            >
              Submit payment
            </Button>
          </div>
        </Card>
      )}

      {step === 'school' && (
        <Card>
          <h2 className="mb-1 text-lg font-semibold text-slate-900">
            School reference code
          </h2>
          <p className="mb-4 text-sm text-slate-500">
            Paste the code your school gave you.
          </p>
          {errorBox}
          <div className="mb-5">
            <Input
              label="Reference code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. SCH-ABCD-EFGH"
            />
          </div>
          <div className="flex justify-between">
            <Button variant="ghost" onClick={() => setStep('who')}>
              Back
            </Button>
            <Button
              onClick={submitSchoolCode}
              isLoading={busy}
              disabled={!code.trim()}
            >
              Verify code
            </Button>
          </div>
        </Card>
      )}

      {step === 'done' && (
        <Card>
          <h2 className="mb-2 text-lg font-semibold text-slate-900">
            {doneKind === 'school' ? 'You are all set' : 'Payment received'}
          </h2>
          <p className="mb-5 text-sm text-slate-600">
            {doneKind === 'school'
              ? `${info.childName} is covered through ${schoolResult ?? 'your school'}. You can start using the app now.`
              : `Your payment will be verified within 24 hours. You can use the app for ${info.childName} in the meantime. If we can't verify it, the app will be locked and you'll need to pay again.`}
          </p>
          <Button onClick={onDone}>Continue</Button>
        </Card>
      )}
    </div>
  );
}
