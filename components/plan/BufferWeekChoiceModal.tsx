'use client';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

const option =
  'rounded-[22px] bg-[#F0EFED] p-4 text-left transition-colors hover:bg-[#E7E5E2] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#F0EFED]';

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
    <Modal className="max-w-md">
        <h2 className="mb-2 text-lg font-bold">
          When should the plan end?
        </h2>
        <p className="mb-4 text-sm leading-6 text-[#65615D]">
          Your exam is on {examDateLabel}. Choose how far the schedule should
          run.
        </p>
        <div className="flex flex-col gap-3">
          <button
            type="button"
            disabled={!minimumRunwayOk}
            onClick={() => onChoose(true)}
            className={option}
          >
            <p className="text-sm font-bold sm:text-base">
              End 7 days before the exam
            </p>
            <p className="mt-1 text-sm text-[#65615D]">
              Leaves a self-directed final week for your child to review and
              prioritize on their own.
              {!minimumRunwayOk &&
                ' Not enough time before the exam for this option.'}
            </p>
          </button>
          <button
            type="button"
            onClick={() => onChoose(false)}
            className={option}
          >
            <p className="text-sm font-bold sm:text-base">
              Use the full period, up to the exam date
            </p>
            <p className="mt-1 text-sm text-[#65615D]">
              The schedule runs all the way to {examDateLabel}.
            </p>
          </button>
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
    </Modal>
  );
}
