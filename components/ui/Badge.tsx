import clsx from "clsx";

type Tone = "weak" | "medium" | "strong" | "neutral" | "brand";

const toneClasses: Record<Tone, string> = {
  weak: "bg-red-50 text-red-700 border-red-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  strong: "bg-green-50 text-green-700 border-green-200",
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
  brand: "bg-indigo-50 text-indigo-700 border-indigo-200",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        toneClasses[tone]
      )}
    >
      {children}
    </span>
  );
}
