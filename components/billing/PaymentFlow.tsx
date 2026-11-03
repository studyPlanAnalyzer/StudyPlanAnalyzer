'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { buttonClass } from '@/components/ui/Button';
import { cardClass } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Notice } from '@/components/ui/Notice';
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

type Method = 'self' | 'school';
type DoneKind = 'qr' | 'school' | 'pending';

interface Started {
  paymentId: string;
  plan: string;
  months: number;
  amountRs: number;
  remarkCode: string;
}

const primaryBtn = buttonClass('yellow', 'lg');

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={clsx(
        'h-5 w-5 transition-transform duration-200',
        open && 'rotate-180',
      )}
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function SectionLabel({ n, children }: { n: number; children: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black text-sm font-bold text-white">
        {n}
      </span>
      <p className="text-sm font-bold uppercase tracking-wide">{children}</p>
    </div>
  );
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
  const [method, setMethod] = useState<Method | null>(null);
  const [done, setDone] = useState(false);
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
          setDone(true);
        }
      })
      .catch((e) =>
        setLoadError(getErrorMessage(e, "Couldn't load payment details.")),
      );
  }, [studentId]);

  if (loadError)
    return (
      <Notice className="mx-auto w-full max-w-3xl">{loadError}</Notice>
    );
  if (!info) return <SkeletonCard />;

  const { billing } = info;
  const quote =
    billing.quotes.find((q) => q.plan === plan) ?? billing.quotes[0];

  function openMethod(m: Method) {
    setError(null);
    setMethod((prev) => (prev === m ? null : m));
  }

  // Picking a different plan after the payment was started discards that
  // payment on screen; pressing Pay again starts a fresh one.
  function choosePlan(p: string) {
    if (p === plan) return;
    setPlan(p);
    if (started) {
      setStarted(null);
      setNoted(false);
      setError(null);
    }
  }

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
      setDone(true);
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
      setDone(true);
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
    <Notice className="mt-5">{error}</Notice>
  );

  // ---------------------------------------------------------------- DONE
  if (done) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <div
          className={`${cardClass} px-6 py-14 text-center sm:px-10 sm:py-16`}
        >
          <div
            className={clsx(
              'mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[28px] text-4xl',
              doneKind === 'school' ? 'bg-[#a4e5c7]' : 'bg-[#F7CC46]',
            )}
          >
            {doneKind === 'school' ? '✅' : '⏳'}
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            {doneKind === 'school' ? 'You are all set.' : 'Payment received.'}
          </h2>

          <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-[#65615D] sm:text-base">
            {doneKind === 'school'
              ? `${info.childName} is covered through ${schoolResult ?? 'your school'}. You can start using the app now.`
              : `We'll check your payment, usually within 24 hours. ${info.childName} can use the app the whole time we're checking, and there's nothing more to pay. Only if we can't find the payment will we ask you to pay again.`}
          </p>

          <button
            type="button"
            onClick={onDone}
            className={`${primaryBtn} mt-8`}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- FLOW
  const detailsReady =
    !!started &&
    noted &&
    !!txn.trim() &&
    !!parentName.trim() &&
    !!childName.trim() &&
    !!schoolName.trim();

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* HEADING */}
      <div className="mb-8">
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Activate {info.childName}&apos;s account.
        </h2>
        <p className="mt-3 text-sm leading-6 text-[#65615D] sm:text-base">
          Who is paying for {info.childName}&apos;s study plan?
        </p>
      </div>

      {billing.paymentStatus === 'rejected' && (
        <Notice tone="warning" className="mb-6 font-medium">
          We couldn&apos;t verify the last payment for {info.childName}. The
          payment is not verified, so please pay again below.
        </Notice>
      )}

      <div className="flex flex-col gap-5">
        {/* ---------------------------------------------- PAY MYSELF */}
        <section
          className={clsx(
            cardClass,
            'overflow-hidden transition-shadow',
            method === 'self' && 'ring-2 ring-black',
          )}
        >
          <button
            type="button"
            onClick={() => openMethod('self')}
            aria-expanded={method === 'self'}
            className="flex w-full items-center gap-4 p-6 text-left sm:p-8"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-[#F7CC46] text-2xl">
              💳
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-lg font-extrabold tracking-tight sm:text-xl">
                I&apos;ll pay myself
              </p>
              <p className="mt-1 text-sm text-[#65615D] sm:text-base">
                Pay by QR code from your phone.
              </p>
            </div>

            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F0EFED]">
              <ChevronIcon open={method === 'self'} />
            </span>
          </button>

          {method === 'self' && (
            <div className="border-t border-black/10 px-6 pb-6 pt-6 sm:px-8 sm:pb-8">
              {/* 1. PLAN */}
              <SectionLabel n={1}>Choose a plan</SectionLabel>

              <div className="grid gap-3 sm:grid-cols-2">
                {billing.quotes.map((q) => (
                  <button
                    key={q.plan}
                    type="button"
                    onClick={() => choosePlan(q.plan)}
                    aria-pressed={plan === q.plan}
                    className={clsx(
                      'rounded-[26px] p-5 text-left transition-all duration-200 active:scale-[0.99]',
                      plan === q.plan
                        ? 'bg-[#F7CC46] ring-2 ring-black'
                        : 'bg-[#F0EFED] hover:bg-[#E7E5E2]',
                    )}
                  >
                    <p className="text-sm font-bold">{q.label}</p>
                    <p className="mt-1 text-3xl font-extrabold tracking-tight">
                      Rs {q.amountRs}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-black/60">
                      {q.months === 1
                        ? 'for 1 month'
                        : `Rs ${q.perMonthRs}/month, for ${q.months} months`}
                    </p>
                  </button>
                ))}
              </div>

              {!started && (
                <>
                  {errorBox}

                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      onClick={startPayment}
                      disabled={busy}
                      className={primaryBtn}
                    >
                      {busy ? 'Starting…' : `Pay Rs ${quote.amountRs}`}
                    </button>
                  </div>
                </>
              )}

              {started && (
                <>
                  <p className="mt-3 text-sm font-semibold text-[#65615D]">
                    Choosing a different plan starts a new payment.
                  </p>

                  {/* 2. QR */}
                  <div className="mt-8 border-t border-black/10 pt-8">
                    <SectionLabel n={2}>Scan and pay</SectionLabel>

                    <div className="rounded-[26px] bg-[#F0EFED] p-5 sm:p-6">
                      <p className="text-lg font-extrabold tracking-tight sm:text-xl">
                        Pay Rs {started.amountRs} for the{' '}
                        {started.months === 1
                          ? 'monthly'
                          : `${started.months}-month`}{' '}
                        plan
                      </p>
                      <p className="mt-1 text-sm text-[#65615D] sm:text-base">
                        Scan the QR code and pay exactly Rs {started.amountRs}.
                      </p>

                      <div className="my-5 flex justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={PAYMENT_QR_URL}
                          alt="Payment QR code"
                          className="h-56 w-56 rounded-[26px] bg-white object-contain p-3"
                        />
                      </div>

                      <div className="rounded-2xl bg-white p-4">
                        <p className="text-sm font-bold uppercase tracking-wide text-black/50">
                          Write this in the payment remark
                        </p>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                          <span className="break-all font-mono text-lg font-bold">
                            {started.remarkCode}
                          </span>
                          <button
                            type="button"
                            onClick={copyRemark}
                            className={buttonClass('primary', 'md')}
                          >
                            {copied ? 'Copied' : 'Copy'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* 3. CONFIRM */}
                  <div className="mt-8 border-t border-black/10 pt-8">
                    <SectionLabel n={3}>Confirm your payment</SectionLabel>

                    <Notice tone="warning" className="mb-5">
                      <p className="font-bold">Keep your transaction ID</p>
                      <p className="mt-1 leading-6">
                        After paying, copy or screenshot the{' '}
                        <b>transaction ID</b> from your payment app. Enter it
                        below so we can verify your payment.
                      </p>
                      <label className="mt-1 flex min-h-11 cursor-pointer items-center gap-3 py-1 font-semibold">
                        <input
                          type="checkbox"
                          className="h-5 w-5 shrink-0 cursor-pointer accent-black"
                          checked={noted}
                          onChange={(e) => setNoted(e.target.checked)}
                        />
                        <span>
                          I have paid and I have my transaction ID ready.
                        </span>
                      </label>
                    </Notice>

                    <p className="mb-4 text-sm text-[#65615D]">
                      All fields are required.
                    </p>

                    <div className="grid gap-5 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <Input
                          label="Transaction ID"
                          value={txn}
                          onChange={(e) => setTxn(e.target.value)}
                          placeholder="Copy it exactly from your payment app"
                        />
                      </div>
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
                      <div className="sm:col-span-2">
                        <Input
                          label="School name"
                          value={schoolName}
                          onChange={(e) => setSchoolName(e.target.value)}
                        />
                      </div>
                    </div>

                    {errorBox}

                    <div className="mt-6 flex justify-end">
                      <button
                        type="button"
                        onClick={submitDetails}
                        disabled={busy || !detailsReady}
                        className={primaryBtn}
                      >
                        {busy ? 'Submitting…' : 'Submit payment'}
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* ---------------------------------------------- SCHOOL PAID */}
        <section
          className={clsx(
            cardClass,
            'overflow-hidden transition-shadow',
            method === 'school' && 'ring-2 ring-black',
          )}
        >
          <button
            type="button"
            onClick={() => openMethod('school')}
            aria-expanded={method === 'school'}
            className="flex w-full items-center gap-4 p-6 text-left sm:p-8"
          >
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-[#a4e5c7] text-2xl">
              🏫
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-lg font-extrabold tracking-tight sm:text-xl">
                The payment was already made to the school
              </p>
              <p className="mt-1 text-sm text-[#65615D] sm:text-base">
                Enter the reference code your school gave you.
              </p>
            </div>

            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#F0EFED]">
              <ChevronIcon open={method === 'school'} />
            </span>
          </button>

          {method === 'school' && (
            <div className="border-t border-black/10 px-6 pb-6 pt-6 sm:px-8 sm:pb-8">
              <SectionLabel n={1}>School reference code</SectionLabel>

              <p className="mb-4 text-sm text-[#65615D] sm:text-base">
                Paste the code your school gave you.
              </p>

              <Input
                label="Reference code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. SCH-ABCD-EFGH"
              />

              {errorBox}

              <div className="mt-6 flex justify-end">
                <button
                  type="button"
                  onClick={submitSchoolCode}
                  disabled={busy || !code.trim()}
                  className={primaryBtn}
                >
                  {busy ? 'Checking…' : 'Verify code'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
