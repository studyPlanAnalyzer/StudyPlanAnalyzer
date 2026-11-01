'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, refreshSession } from '@/lib/api-client';
import { PageShell } from '@/components/ui/PageShell';
import { AppHeader } from '@/components/ui/AppHeader';
import { cardClass } from '@/components/ui/Card';
import { PageTitle } from '@/components/ui/PageTitle';
import { Notice } from '@/components/ui/Notice';

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
    <PageShell className="flex flex-col">
      <AppHeader brandHref="/" />

      {/* MAIN CONTENT */}
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-7 sm:py-14">
        <div className={`${cardClass} w-full max-w-lg p-6 sm:p-10`}>
          <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-[22px] bg-[#a4e5c7] text-3xl">
            👋
          </div>

          <PageTitle size="text-3xl sm:text-4xl">
            Welcome.
          </PageTitle>

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
            <Notice className="mt-6">
              {error}
            </Notice>
          )}

          <p className="mt-7 text-center text-sm leading-6 text-[#8A8580]">
            We only receive your name and email address from Google. We never see your Google
            password.
          </p>
        </div>
      </main>
    </PageShell>
  );
}
