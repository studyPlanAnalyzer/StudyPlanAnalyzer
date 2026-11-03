'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getErrorMessage } from '@/lib/api-client';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { Badge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import { cardClass } from '@/components/ui/Card';
import { Notice } from '@/components/ui/Notice';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { PageTitle } from '@/components/ui/PageTitle';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { formatInstantDateTime } from '@/lib/utils/date-utils';

interface Device {
  id: string;
  device: string;
  signedInAt: string;
  current: boolean;
}

interface DeletionRequest {
  status: 'pending' | 'completed' | 'cancelled' | 'declined';
  reason: string;
  adminNote: string | null;
  requestedAt: string;
}

const sectionCard = `${cardClass} p-6 sm:p-8 lg:p-10`;

/**
 * The parent's account: the devices they are signed in on (any can be signed
 * out), and a request to delete the account and all its data.
 */
export default function AccountPage() {
  const router = useRouter();
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [request, setRequest] = useState<DeletionRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [d, r] = await Promise.all([
        api.get<{ sessions: Device[] }>('/api/account/sessions'),
        api.get<{ request: DeletionRequest | null }>('/api/account/deletion-request'),
      ]);
      setDevices(d.sessions);
      setRequest(r.request);
    } catch (e) {
      setError(getErrorMessage(e, "Couldn't load your account."));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(key: string, action: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function signOut(device: Device) {
    if (device.current) {
      setBusy(device.id);
      try {
        await api.post('/api/auth/logout');
      } finally {
        router.push('/login');
      }
      return;
    }
    await run(device.id, () => api.delete(`/api/account/sessions/${device.id}`));
  }

  function requestDeletion() {
    if (
      !window.confirm(
        'Ask us to delete your account and all your children’s data? You can cancel until we carry it out.',
      )
    )
      return;
    run('delete', () =>
      api.post('/api/account/deletion-request', { reason: reason.trim() }),
    ).then(() => setReason(''));
  }

  const others = devices?.filter((d) => !d.current) ?? [];
  const pending = request?.status === 'pending';

  return (
    <PageShell>
      <AppHeader>
        <BackLink href="/dashboard" label="Back to dashboard" short="Dashboard" />
      </AppHeader>

      <PageMain>
        <section className="mb-8 sm:mb-10">
          <PageTitle>Your account.</PageTitle>
        </section>

        {error && <Notice className="mb-6">{error}</Notice>}

        {!devices && !error && <SkeletonCard />}

        {devices && (
          <div className="space-y-7">
            {/* SIGNED-IN DEVICES */}
            <section className={sectionCard}>
              <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                Signed-in devices
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#65615D] sm:text-base">
                Every phone or computer where you are signed in. Sign out any you
                don&apos;t recognise or no longer use.
              </p>

              <ul className="mt-6 divide-y divide-black/5">
                {devices.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-semibold text-black">
                        {d.device}
                        {d.current && <Badge tone="brand">This device</Badge>}
                      </p>
                      <p className="mt-1 text-sm text-[#65615D]">
                        Signed in {formatInstantDateTime(d.signedInAt)}
                      </p>
                    </div>
                    <button
                      type="button"
                      className={buttonClass('secondary', 'sm')}
                      disabled={busy !== null}
                      onClick={() => signOut(d)}
                    >
                      {busy === d.id ? 'Signing out…' : 'Sign out'}
                    </button>
                  </li>
                ))}
              </ul>

              {others.length > 0 && (
                <button
                  type="button"
                  className={buttonClass('outline', 'md', 'mt-4')}
                  disabled={busy !== null}
                  onClick={() =>
                    run('others', () => api.post('/api/account/sessions/sign-out-others'))
                  }
                >
                  {busy === 'others' ? 'Signing out…' : 'Sign out of all other devices'}
                </button>
              )}
            </section>

            {/* DELETE ACCOUNT AND DATA */}
            <section className={sectionCard}>
              <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                Delete my account and data
              </h2>
              <p className="mt-1 text-sm leading-6 text-[#65615D] sm:text-base">
                We delete your account and everything in it: your children,
                their subjects, tests, plans, reports and to-dos. Records of
                payments you made are kept for our accounts, without your name
                or your children&apos;s names. We carry out requests within 24
                hours, and you can cancel until then.
              </p>

              {pending && request ? (
                <div className="mt-6">
                  <Notice tone="warning">
                    You asked us to delete your account on{' '}
                    {formatInstantDateTime(request.requestedAt)}. We&apos;ll carry
                    it out within 24 hours of that.
                  </Notice>
                  <button
                    type="button"
                    className={buttonClass('secondary', 'md', 'mt-4')}
                    disabled={busy !== null}
                    onClick={() =>
                      run('cancel', () => api.delete('/api/account/deletion-request'))
                    }
                  >
                    {busy === 'cancel' ? 'Cancelling…' : 'Cancel my request'}
                  </button>
                </div>
              ) : (
                <div className="mt-6">
                  {request?.status === 'declined' && (
                    <Notice tone="info" className="mb-4">
                      We didn&apos;t carry out your last request
                      {request.adminNote ? `: ${request.adminNote}` : '.'}
                    </Notice>
                  )}
                  <label htmlFor="reason" className="text-sm font-semibold text-black">
                    Why do you want to delete your account?
                  </label>
                  <textarea
                    id="reason"
                    rows={3}
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-2 w-full rounded-2xl border border-[#dcdad3] bg-white px-4 py-3 text-base outline-none focus:border-black"
                  />
                  <button
                    type="button"
                    className={buttonClass('danger', 'md', 'mt-4')}
                    disabled={busy !== null || reason.trim().length < 10}
                    onClick={requestDeletion}
                  >
                    {busy === 'delete' ? 'Sending…' : 'Ask to delete my account'}
                  </button>
                  {reason.trim().length > 0 && reason.trim().length < 10 && (
                    <p className="mt-2 text-sm text-[#65615D]">
                      A few more words, please (at least 10 characters).
                    </p>
                  )}
                </div>
              )}
            </section>
          </div>
        )}
      </PageMain>
    </PageShell>
  );
}
