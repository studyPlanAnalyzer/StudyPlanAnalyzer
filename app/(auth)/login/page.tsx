'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, ApiError, refreshSession } from '@/lib/api-client';

// Google Identity Services ("Sign in with Google"), loaded from Google. Only
// the parts used here are typed.
interface GoogleCredentialResponse {
  credential: string;
}
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize(options: {
            client_id: string;
            callback: (r: GoogleCredentialResponse) => void;
            ux_mode?: 'popup' | 'redirect';
            auto_select?: boolean;
          }): void;
          renderButton(el: HTMLElement, options: Record<string, unknown>): void;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';

// Where to go after signing in: the page the visitor was sent here from, if
// it is a path on this site (never another site: no open redirect).
function nextPath(): string {
  const next = new URLSearchParams(window.location.search).get('next');
  return next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
    ? next
    : '/dashboard';
}

/**
 * Sign-in and sign-up in one: "Continue with Google". Google's popup hands
 * this page an ID token, which goes to POST /api/auth/google (same origin);
 * the server checks it and signs the parent in. A first sign-in creates the
 * account.
 */
export default function LoginPage() {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Sent here because the 15-minute access cookie wasn't there (for example,
  // arriving from a link on another site, which SameSite=Strict cookies don't
  // ride along with)? A still-valid refresh cookie signs straight back in.
  useEffect(() => {
    refreshSession().then((ok) => {
      if (ok) router.replace(nextPath());
    });
  }, [router]);

  const onCredential = useCallback(
    async (r: GoogleCredentialResponse) => {
      setError(null);
      setIsLoading(true);
      try {
        await api.post('/api/auth/google', { credential: r.credential });
        router.push(nextPath());
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'Something went wrong');
        setIsLoading(false);
      }
    },
    [router],
  );

  // Loads Google's script once and draws its button. Drawn again whenever the
  // button's container comes back (after a failed sign-in).
  useEffect(() => {
    if (isLoading) return;
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setError('Google sign-in is not set up yet.');
      return;
    }
    const render = () => {
      const g = window.google?.accounts.id;
      if (!g || !buttonRef.current) return;
      g.initialize({ client_id: clientId, callback: onCredential, ux_mode: 'popup', auto_select: false });
      g.renderButton(buttonRef.current, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: 300,
      });
    };
    if (window.google?.accounts?.id) {
      render();
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_SCRIPT}"]`);
    if (!script) {
      script = document.createElement('script');
      script.src = GOOGLE_SCRIPT;
      script.async = true;
      document.head.appendChild(script);
    }
    const failed = () =>
      setError("Couldn't load Google sign-in. Check your connection and try again.");
    script.addEventListener('load', render);
    script.addEventListener('error', failed);
    return () => {
      script?.removeEventListener('load', render);
      script?.removeEventListener('error', failed);
    };
  }, [onCredential, isLoading]);

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
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-7 sm:py-14">
        <div className="w-full max-w-lg rounded-[32px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-10">
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#a4e5c7] text-3xl">
            👋
          </div>

          <h1 className="dashboard-headline relative inline-block max-w-full text-3xl font-extrabold leading-tight tracking-[-0.045em] sm:text-4xl">
            Welcome.
          </h1>

          <p className="mt-4 text-sm leading-7 text-[#65615D] sm:text-base">
            Sign in with your Google account to see your child&apos;s study plan. New here? The
            same button creates your account.
          </p>

          <div className="mt-8 flex min-h-[44px] justify-center">
            {isLoading ? (
              <p className="text-sm font-semibold text-[#65615D]">Signing you in…</p>
            ) : (
              <div ref={buttonRef} />
            )}
          </div>

          {error && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <p className="mt-7 text-center text-xs leading-5 text-[#8A8580]">
            We only receive your name and email address from Google. We never see your Google
            password.
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
