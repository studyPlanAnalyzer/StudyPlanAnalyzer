import clsx from "clsx";

export function Skeleton({ className }: { className?: string }) {
  return <div className={clsx("skeleton rounded-full bg-[#F0EFED]", className)} />;
}

export function SkeletonCard() {
  return (
    <div className="rounded-[32px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-8">
      <Skeleton className="mb-4 h-5 w-1/3" />
      <Skeleton className="mb-3 h-3.5 w-full" />
      <Skeleton className="h-3.5 w-2/3" />
    </div>
  );
}
