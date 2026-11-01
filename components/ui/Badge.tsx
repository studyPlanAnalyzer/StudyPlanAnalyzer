import clsx from "clsx";

type Tone = "weak" | "medium" | "strong" | "neutral" | "brand";

const toneClasses: Record<Tone, string> = {
  weak: "bg-[#F1B5AE]/40 text-[#A4473D]",
  medium: "bg-[#fff5dc] text-[#805500]",
  strong: "bg-[#9DDFC2]/40 text-[#145c3d]",
  neutral: "bg-[#F0EFED] text-black/70",
  brand: "bg-[#EEF0FF] text-black",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold",
        toneClasses[tone]
      )}
    >
      {children}
    </span>
  );
}
