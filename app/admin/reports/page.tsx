'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { WeeklyReportView } from '@/components/reports/WeeklyReportView';
import { api, getErrorMessage } from '@/lib/api-client';
import { formatWeekRange } from '@/lib/reports/strings';
import type { WeeklyReportSnapshot } from '@/lib/reports/types';

interface Week { start: string; end: string }
interface Child { id: string; name: string; grade: string; parentName: string; parentEmail: string }
interface Preview {
  student: { id: string; name: string };
  parent: { email: string };
  week: Week;
  eligibility: { wouldGetReport: boolean; reason: string };
  stored: WeeklyReportSnapshot | null;
  preview: WeeklyReportSnapshot;
}

/** Pick a child and a week and see the report. Nothing is stored. */
export default function AdminReportsPage() {
  const [q, setQ] = useState('');
  const [children, setChildren] = useState<Child[]>([]);
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [childId, setChildId] = useState('');
  const [week, setWeek] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [tab, setTab] = useState<'stored' | 'built'>('built');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api
        .get<{ children: Child[]; weeks: Week[] }>(`/api/admin/reports/children?q=${encodeURIComponent(q)}`)
        .then((d) => {
          setChildren(d.children);
          setWeeks(d.weeks);
          setWeek((w) => w || d.weeks[0]?.start || '');
        })
        .catch((e) => setError(getErrorMessage(e)));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const p = await api.get<Preview>(`/api/admin/reports/preview?studentId=${childId}&week=${week}`);
      setPreview(p);
      setTab(p.stored ? 'stored' : 'built');
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Weekly reports</h1>
      <p className="mb-6 text-sm text-slate-500">
        See any child&apos;s weekly report as the parent sees it. Previewing stores nothing.
      </p>

      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-slate-600">
            Find a child (name or parent email)
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Aarav, or parent@gmail.com"
            />
          </label>
          <label className="text-sm text-slate-600">
            Child
            <select value={childId} onChange={(e) => setChildId(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              <option value="">Choose…</option>
              {children.map((c) => (
                <option key={c.id} value={c.id}>{c.name} (grade {c.grade}) · {c.parentEmail}</option>
              ))}
            </select>
          </label>
          <label className="text-sm text-slate-600">
            Week
            <select value={week} onChange={(e) => setWeek(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
              {weeks.map((w) => (
                <option key={w.start} value={w.start}>{formatWeekRange(w.start, w.end)} ({w.start})</option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4">
          <Button onClick={load} disabled={!childId || !week} isLoading={loading}>Show report</Button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        {preview && (
          <div className="mt-6">
            <div className="mb-3 space-y-1 text-sm text-slate-600">
              <p><b className="text-slate-900">{preview.student.name}</b> · {preview.parent.email} · {formatWeekRange(preview.week.start, preview.week.end)}</p>
              <p>{preview.eligibility.reason} {preview.stored ? 'A report is stored for this week.' : 'No report is stored for this week.'}</p>
            </div>
            <div className="mb-3 flex flex-wrap gap-1">
              {([
                ['stored', 'Stored report', !preview.stored],
                ['built', 'Built now', false],
              ] as const).map(([key, label, disabled]) => (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => setTab(key)}
                  className={clsx(
                    'rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-40',
                    tab === key ? 'bg-indigo-100 text-indigo-700' : 'text-slate-600 hover:bg-slate-100',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab === 'stored' && preview.stored && (
              <div className="rounded-xl bg-[#FAF9F6] p-4"><WeeklyReportView report={preview.stored} /></div>
            )}
            {tab === 'built' && (
              <div className="rounded-xl bg-[#FAF9F6] p-4">
                <p className="mb-3 text-xs text-slate-500">Built from today&apos;s data; not stored. A stored report never changes.</p>
                <WeeklyReportView report={preview.preview} />
              </div>
            )}
          </div>
        )}
      </Card>
    </main>
  );
}
