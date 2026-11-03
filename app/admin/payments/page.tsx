'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { api, getErrorMessage } from '@/lib/api-client';
import { formatInstantDateTime } from '@/lib/utils/date-utils';

interface PaymentRow {
  id: string;
  status: string;
  plan: string;
  months: number;
  amountRs: number;
  remarkCode: string;
  transactionId: string | null;
  parentName: string | null;
  childName: string | null;
  schoolName: string | null;
  parentEmail: string;
  submittedAt: string | null;
}

export default function AdminPaymentsPage() {
  const [rows, setRows] = useState<PaymentRow[] | null>(null);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<{ payments: PaymentRow[] }>(`/api/admin/payments?status=${filter}`)
      .then((d) => setRows(d.payments))
      .catch((e) => setError(getErrorMessage(e, "Couldn't load payments.")));
  }, [filter]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  async function act(id: string, action: 'verify' | 'reject') {
    if (
      action === 'reject' &&
      !window.confirm('Reject this payment? The child will be locked.')
    )
      return;
    setBusyId(id);
    setError(null);
    try {
      await api.post(`/api/admin/payments/${id}/${action}`, {});
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
        <h1 className="text-2xl font-extrabold tracking-tight text-black">Payments</h1>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href="/admin/schools" size="sm" variant="secondary">
            Schools
          </ButtonLink>
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
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      {rows === null && <p className="text-sm text-[#65615D]">Loading…</p>}
      {rows?.length === 0 && (
        <p className="text-sm text-[#65615D]">Nothing here.</p>
      )}
      <div className="flex flex-col gap-3">
        {rows?.map((p) => (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="text-sm text-black/80">
                <p className="font-semibold text-black">
                  Rs {p.amountRs} · {p.months} month{p.months > 1 ? 's' : ''} ·{' '}
                  <span className="uppercase text-[#65615D]">{p.status}</span>
                </p>
                <p>
                  Transaction ID:{' '}
                  <b className="font-mono">{p.transactionId ?? '—'}</b>
                </p>
                <p>
                  Remark code: <span className="font-mono">{p.remarkCode}</span>
                </p>
                <p>
                  Parent: {p.parentName ?? '—'} ({p.parentEmail}) · Child:{' '}
                  {p.childName ?? '—'} · School: {p.schoolName ?? '—'}
                </p>
                {p.submittedAt && (
                  <p className="text-xs text-[#8A8580]">
                    Submitted {formatInstantDateTime(p.submittedAt)}
                  </p>
                )}
              </div>
              {p.status === 'pending' && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    isLoading={busyId === p.id}
                    onClick={() => act(p.id, 'verify')}
                  >
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={busyId === p.id}
                    onClick={() => act(p.id, 'reject')}
                  >
                    Reject
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
