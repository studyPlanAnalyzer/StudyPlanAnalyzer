import clsx from "clsx";

export function StepIndicator({ step, totalSteps, labels }: { step: number; totalSteps: number; labels: string[] }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between text-xs font-medium text-slate-500">
        <span>
          Step {step} of {totalSteps}
        </span>
        <span>{labels[step - 1]}</span>
      </div>
      <div className="mt-2 flex gap-1.5">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={clsx(
              "h-1.5 flex-1 rounded-full transition-colors",
              i < step ? "bg-indigo-600" : "bg-slate-200"
            )}
          />
        ))}
      </div>
    </div>
  );
}
