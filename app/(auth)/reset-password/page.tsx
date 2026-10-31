'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/Input';
import { api, ApiError } from '@/lib/api-client';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';

  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (newPassword !== confirmPassword) {
      setError("Passwords don't match");
      return;
    }

    setIsLoading(true);
    try {
      const { resetToken } = await api.post<{ resetToken: string }>(
        '/api/auth/verify-otp',
        {
          email,
          code,
          purpose: 'PASSWORD_RESET',
        },
      );
      await api.post('/api/auth/reset-password', { resetToken, newPassword });
      router.push('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
    } finally {
      setIsLoading(false);
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
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#a4e5c7] text-3xl">
            🔒
          </div>

          <h1 className="dashboard-headline relative inline-block max-w-full text-3xl font-extrabold leading-tight tracking-[-0.045em] sm:text-4xl">
            Reset your password.
          </h1>

          <p className="mt-4 text-sm leading-7 text-[#65615D] sm:text-base">
            Enter the code sent to{' '}
            <span className="break-all font-bold text-black">{email}</span> and
            choose a new password.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-5">
            <Input
              label="Reset code"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
            <Input
              label="New password"
              type="password"
              required
              minLength={8}
              hint="At least 8 characters"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <Input
              label="Confirm new password"
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#F7CC46] px-6 py-3.5 text-sm font-semibold text-black shadow-[0_5px_12px_rgba(0,0,0,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F0C33A] hover:shadow-[0_7px_16px_rgba(0,0,0,0.10)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:py-4 sm:text-base"
            >
              {isLoading ? 'Resetting…' : 'Reset password'}
            </button>
          </form>

          <p className="mt-7 text-center text-sm text-[#65615D] sm:text-base">
            Remembered it?{' '}
            <Link
              href="/login"
              className="font-bold text-black underline underline-offset-4 transition hover:text-black/60"
            >
              Back to login
            </Link>
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

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
