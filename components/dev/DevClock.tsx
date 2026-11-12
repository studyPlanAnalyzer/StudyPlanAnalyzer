'use client';

import { useState } from 'react';
import { formatDay } from '@/lib/utils/date-utils';

/**
 * Development-only floating panel for the dev clock (lib/dev-clock.ts): move
 * the app's "today" back and forth to test SM-2 reviews, plan rebuilds,
 * catch-up and exam expiry. Each change reloads the page so the server and
 * the browser both pick up the new day. The root layout renders this only in
 * development.
 */
export function DevClock({
  today,
  realToday,
}: {
  today: string;
  realToday: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const faked = today !== realToday;

  async function change(body: { date: string | null } | { shiftDays: number }) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/dev/today', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
      setBusy(false);
    }
  }

  const label = formatDay(today, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const step =
    'h-8 rounded-full bg-[#F0EFED] px-3 text-xs font-semibold text-black hover:bg-[#E7E5E2] disabled:opacity-50';

  return (
    <div className="fixed right-3 bottom-24 z-50 text-black sm:bottom-4">
      {open ? (
        <div className="w-64 rounded-2xl border border-black/10 bg-white p-3 shadow-lg">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-bold tracking-wide uppercase">
              Dev clock
            </span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-xs text-black/60 hover:text-black"
            >
              Close
            </button>
          </div>
          <p className="text-sm">
            Today: <b>{label}</b> {faked && <span className="text-red-600">(fake)</span>}
          </p>
          <p className="mb-3 text-xs text-black/60">Real day: {realToday}</p>
          <div className="mb-2 flex gap-1.5">
            <button type="button" disabled={busy} className={step} onClick={() => change({ shiftDays: -1 })}>
              −1 day
            </button>
            <button type="button" disabled={busy} className={step} onClick={() => change({ shiftDays: 1 })}>
              +1 day
            </button>
            <button type="button" disabled={busy} className={step} onClick={() => change({ shiftDays: 7 })}>
              +7 days
            </button>
          </div>
          <input
            type="date"
            disabled={busy}
            defaultValue={today}
            onChange={(e) => e.target.value && change({ date: e.target.value })}
            className="mb-2 h-8 w-full rounded-lg border border-black/15 px-2 text-sm"
          />
          {faked && (
            <button
              type="button"
              disabled={busy}
              onClick={() => change({ date: null })}
              className="h-8 w-full rounded-full bg-black text-xs font-semibold text-white hover:bg-black/80 disabled:opacity-50"
            >
              Back to the real day
            </button>
          )}
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={`h-9 rounded-full px-3 text-xs font-semibold shadow-md ${
            faked ? 'bg-red-600 text-white' : 'bg-white text-black ring-1 ring-black/10'
          }`}
        >
          🕐 {faked ? `Fake day: ${label}` : 'Dev clock'}
        </button>
      )}
    </div>
  );
}
