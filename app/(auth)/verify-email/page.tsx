'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api-client';

function VerifyEmailForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(
      () => setCooldown((c) => Math.max(0, c - 1)),
      1000,
    );
    return () => clearInterval(timer);
  }, [cooldown]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      // On success this also sets the session cookie server-side —
      // verifying the email is what logs the user in for the first time.
      await api.post('/api/auth/verify-otp', {
        email,
        code,
        purpose: 'EMAIL_VERIFICATION',
      });
      router.push('/onboarding');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleResend() {
    setError(null);
    setMessage(null);
    setIsResending(true);
    try {
      const res = await api.post<{ message: string }>('/api/auth/send-otp', {
        email,
        purpose: 'EMAIL_VERIFICATION',
      });
      setMessage(res.message);
      setCooldown(60);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setIsResending(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-[#FAF9F6] text-black">
      {/* HEADER */}
      <header className="relative z-30">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-5 py-5 sm:px-7 lg:px-0">
          {/* BRAND */}
          <Link href="/" className="flex shrink-0 items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-xl font-bold text-white sm:h-14 sm:w-14 sm:text-2xl">
              S
            </div>

            <span className="text-xl font-bold tracking-tight sm:text-2xl">
              StudyPlan Analyzer
            </span>
          </Link>

          {/* BACK TO LOGIN */}
          <Link
            href="/login"
            className="flex h-12 items-center justify-center rounded-full bg-[#F0EFED] px-5 text-sm font-semibold transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:px-6 sm:text-base"
          >
            Back to login
          </Link>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-7 sm:py-14">
        <div className="w-full max-w-lg rounded-[32px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-10">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#a8acf0] text-3xl">
            ✉️
          </div>

          <h1 className="dashboard-headline relative inline-block max-w-full text-3xl font-extrabold leading-tight tracking-[-0.045em] sm:text-4xl">
            Verify your email.
          </h1>

          <p className="mt-4 text-sm leading-7 text-[#65615D] sm:text-base">
            We sent a 6-digit code to{' '}
            <span className="break-all font-bold text-black">{email}</span>.
            Enter it below to finish creating your account.
          </p>

          <form onSubmit={handleVerify} className="mt-8 flex flex-col gap-5">
            <Input
              label="Verification code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {message && (
              <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                {message}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#F7CC46] px-6 py-3.5 text-sm font-semibold text-black shadow-[0_5px_12px_rgba(0,0,0,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F0C33A] hover:shadow-[0_7px_16px_rgba(0,0,0,0.10)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:py-4 sm:text-base"
            >
              {isLoading ? 'Verifying…' : 'Verify email'}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-[#65615D] sm:text-base">
            Didn&apos;t get a code?{' '}
            <button
              type="button"
              onClick={handleResend}
              disabled={isResending || cooldown > 0}
              className="font-bold text-black underline underline-offset-4 transition hover:text-black/60 disabled:cursor-not-allowed disabled:text-black/35 disabled:no-underline"
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
            </button>
          </p>
        </div>
      </main>

      {/* HEADLINE ANIMATION */}
      <style jsx global>{`
        @keyframes headline-enter {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes underline-draw {
          from {
            transform: scaleX(0);
          }
          to {
            transform: scaleX(1);
          }
        }

        .dashboard-headline {
          animation: headline-enter 700ms ease-out both;
        }

        .dashboard-headline::after {
          content: '';
          position: absolute;
          left: 0;
          bottom: -5px;
          width: 100%;
          height: 3px;
          border-radius: 999px;
          background: #f7cc46;
          transform: scaleX(0);
          transform-origin: left;
          animation: underline-draw 900ms 400ms ease-out forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .dashboard-headline,
          .dashboard-headline::after {
            animation: none;
            opacity: 1;
            transform: none;
          }

          .dashboard-headline::after {
            transform: scaleX(1);
          }
        }
      `}</style>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmailForm />
    </Suspense>
  );
}
