'use client';

const BUFFER_DAYS = 7;

// Same rule the API applies: once the last 7 days are set aside, the schedule
// must still end in the future.
export function hasBufferRunway(examDate: string | null | undefined): boolean {
  if (!examDate) return false;
  const msUntilExam = new Date(examDate).getTime() - Date.now();
  return msUntilExam > BUFFER_DAYS * 24 * 60 * 60 * 1000;
}

// Compact version of the "End 7 days before the exam" option from
// BufferWeekChoiceModal, for use inside other popups and banners.
export function BufferWeekToggle({
  checked,
  onChange,
  runwayOk,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  runwayOk: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-slate-300 disabled:opacity-50"
        checked={checked && runwayOk}
        disabled={disabled || !runwayOk}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium text-slate-900">
          End {BUFFER_DAYS} days before the exam
        </span>
        <span className="block text-xs text-slate-500">
          Leaves a self-directed final week for your child to review and
          prioritize on their own.
          {!runwayOk && ' Not enough time before the exam for this option.'}
        </span>
      </span>
    </label>
  );
}
