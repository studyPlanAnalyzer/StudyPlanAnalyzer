'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { api, getErrorMessage } from '@/lib/api-client';

interface SchoolRow {
  id: string;
  name: string;
  referenceCode: string;
  paidUntil: string | null;
  [key: string]: unknown;
}

export default function AdminSchoolsPage() {
  const [rows, setRows] = useState<SchoolRow[] | null>(null);
  const [name, setName] = useState('');
  const [months, setMonths] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<{ schools: SchoolRow[] }>('/api/admin/schools')
      .then((d) => setRows(d.schools))
      .catch((e) => setError(getErrorMessage(e, "Couldn't load schools.")));
  }, []);
  useEffect(load, [load]);

  async function add() {
    setBusy('new');
    setError(null);
    try {
      await api.post('/api/admin/schools', { name: name.trim() });
      setName('');
      load();
    } catch (e) {
      setError(getErrorMessage(e, "Couldn't add the school."));
    } finally {
      setBusy(null);
    }
  }

  async function extend(id: string) {
    setBusy(id);
    setError(null);
    try {
      await api.post(`/api/admin/schools/${id}/extend`, {
        months: months[id] ?? 3,
      });
      load();
    } catch (e) {
      setError(getErrorMessage(e, "Couldn't extend."));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight text-black">Schools</h1>
        <ButtonLink href="/admin/payments" size="sm" variant="secondary">
            Payments
          </ButtonLink>
      </div>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1">
            <Input
              label="New school"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button
            onClick={add}
            isLoading={busy === 'new'}
            disabled={!name.trim()}
          >
            Add school
          </Button>
        </div>
      </Card>
      {rows === null && <p className="text-sm text-[#65615D]">Loading…</p>}
      <div className="flex flex-col gap-3">
        {rows?.map((s) => (
          <Card key={s.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-sm text-black/80">
                <p className="font-semibold text-black">{s.name}</p>
                <p>
                  Code: <b className="font-mono">{s.referenceCode}</b>
                </p>
                <p className="text-xs text-[#65615D]">
                  {s.paidUntil
                    ? `Paid until ${new Date(s.paidUntil).toLocaleDateString()}`
                    : 'Not paid yet: parents cannot use the code'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-lg border border-black/15 px-2 py-1.5 text-sm"
                  value={months[s.id] ?? 3}
                  onChange={(e) =>
                    setMonths((m) => ({ ...m, [s.id]: Number(e.target.value) }))
                  }
                >
                  {[1, 3, 6, 12].map((n) => (
                    <option key={n} value={n}>
                      {n} month{n > 1 ? 's' : ''}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  isLoading={busy === s.id}
                  onClick={() => extend(s.id)}
                >
                  Add paid time
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
