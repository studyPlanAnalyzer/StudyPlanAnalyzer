'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { api, getErrorMessage } from '@/lib/api-client';
import { formatInstantDateTime } from '@/lib/utils/date-utils';
import { DELETION_DEADLINE_HOURS } from '@/lib/account-deletion-config';

interface RequestRow {
  id: string;
  status: 'pending' | 'completed' | 'cancelled' | 'declined';
  email: string | null;
  reason: string;
  adminNote: string | null;
  requestedAt: string;
  handledAt: string | null;
  accountName: string | null;
  children: number;
}

// Time left to carry a request out (we promise parents 24 hours).
function DeadlineBadge({ requestedAt }: { requestedAt: string }) {
  const hoursLeft =
    DELETION_DEADLINE_HOURS -
    (Date.now() - new Date(requestedAt).getTime()) / 3_600_000;
  if (hoursLeft <= 0) return <Badge tone="weak">Overdue</Badge>;
  const label =
    hoursLeft < 1 ? 'Due within the hour' : `Due in ${Math.floor(hoursLeft)} h`;
  return <Badge tone={hoursLeft <= 6 ? 'medium' : 'neutral'}>{label}</Badge>;
}

export default function AdminDeletionsPage() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<{ requests: RequestRow[] }>(`/api/admin/deletion-requests?status=${filter}`)
      .then((d) => setRows(d.requests))
      .catch((e) => setError(getErrorMessage(e, "Couldn't load the requests.")));
  }, [filter]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  async function act(r: RequestRow, action: 'complete' | 'decline') {
    let body: { note?: string } = {};
    if (action === 'complete') {
      if (
        !window.confirm(
          `Delete ${r.email ?? 'this account'} and all of its data (${r.children} ${r.children === 1 ? 'child' : 'children'})? Payment records are kept without names. This can't be undone.`,
        )
      )
        return;
    } else {
      const note = window.prompt('Why are you declining? The parent will see this.');
      if (!note?.trim()) return;
      body = { note: note.trim() };
    }
    setBusyId(r.id);
    setError(null);
    try {
      await api.post(`/api/admin/deletion-requests/${r.id}/${action}`, body);
      load();
    } catch (e) {
      setError(getErrorMessage(e, 'That did not work.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-black">
          Data deletion requests
        </h1>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={filter === 'pending' ? 'primary' : 'secondary'}
            onClick={() => setFilter('pending')}
          >
            Waiting
          </Button>
          <Button
            size="sm"
            variant={filter === 'all' ? 'primary' : 'secondary'}
            onClick={() => setFilter('all')}
          >
            All
          </Button>
        </div>
      </div>

      <p className="mb-6 text-sm text-[#65615D]">
        Parents are told their account is deleted within {DELETION_DEADLINE_HOURS}{' '}
        hours. Check the request comes from the account holder, then delete.
      </p>

      {error && <p className="mb-4 text-sm font-medium text-red-600">{error}</p>}
      {rows === null && <p className="text-sm text-[#65615D]">Loading…</p>}
      {rows?.length === 0 && <p className="text-sm text-[#65615D]">Nothing here.</p>}

      <div className="flex flex-col gap-3">
        {rows?.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 text-sm text-black/80">
                <p className="font-semibold text-black">
                  {r.accountName ?? 'Deleted account'}{' '}
                  {r.email && <span className="font-normal">({r.email})</span>} ·{' '}
                  <span className="uppercase text-[#65615D]">{r.status}</span>
                </p>
                {r.status === 'pending' && (
                  <p>
                    {r.children} {r.children === 1 ? 'child' : 'children'} on this account
                  </p>
                )}
                <p className="mt-1 whitespace-pre-wrap">Reason: {r.reason}</p>
                {r.adminNote && <p className="mt-1">Note: {r.adminNote}</p>}
                <p className="mt-1 text-xs text-[#8A8580]">
                  Requested {formatInstantDateTime(r.requestedAt)}
                  {r.handledAt && ` · handled ${formatInstantDateTime(r.handledAt)}`}
                </p>
                {r.status === 'pending' && (
                  <div className="mt-2">
                    <DeadlineBadge requestedAt={r.requestedAt} />
                  </div>
                )}
              </div>
              {r.status === 'pending' && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="danger"
                    isLoading={busyId === r.id}
                    onClick={() => act(r, 'complete')}
                  >
                    Delete account and data
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === r.id}
                    onClick={() => act(r, 'decline')}
                  >
                    Decline
                  </Button>
                </div>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
