'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

export function BufferWeekChoiceModal({
  examDateLabel,
  minimumRunwayOk,
  onChoose,
  onCancel,
}: {
  examDateLabel: string;
  minimumRunwayOk: boolean;
  onChoose: (useBufferWeek: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <Card className="w-full max-w-md">
        <h2 className="mb-2 text-base font-semibold text-slate-900">
          When should the plan end?
        </h2>
        <p className="mb-4 text-sm text-slate-600">
          Your exam is on {examDateLabel}. Choose how far the schedule should
          run.
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={!minimumRunwayOk}
            onClick={() => onChoose(true)}
            className="rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-transparent"
          >
            <p className="text-sm font-medium text-slate-900">
              End 7 days before the exam
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Leaves a self-directed final week for your child to review and
              prioritize on their own.
              {!minimumRunwayOk &&
                ' Not enough time before the exam for this option.'}
            </p>
          </button>
          <button
            type="button"
            onClick={() => onChoose(false)}
            className="rounded-lg border border-slate-200 p-3 text-left transition-colors hover:border-indigo-400 hover:bg-indigo-50"
          >
            <p className="text-sm font-medium text-slate-900">
              Use the full period, up to the exam date
            </p>
            <p className="mt-1 text-xs text-slate-500">
              The schedule runs all the way to {examDateLabel}.
            </p>
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Card>
    </div>
  );
}
