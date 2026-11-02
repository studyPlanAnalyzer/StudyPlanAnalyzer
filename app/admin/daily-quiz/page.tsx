"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { addDays, appToday, toDateString } from "@/lib/utils/date-utils";

// Tomorrow in Nepal, the day students will see the quiz.
function tomorrowDateString(): string {
  return toDateString(addDays(appToday(), 1));
}

export default function DailyQuizIndexPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/admin/daily-quiz/${tomorrowDateString()}`);
  }, [router]);

  return <div className="flex min-h-[50vh] items-center justify-center text-sm text-[#8A8580]">Loading…</div>;
}
