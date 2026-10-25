"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

function tomorrowDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function DailyQuizIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/admin/daily-quiz/${tomorrowDateString()}`);
  }, [router]);

  return <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-400">Loading…</div>;
}
