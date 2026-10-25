import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import {
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { computeStreaks } from '@/lib/utils/streak';
import type { DayCompletion } from '@/lib/types/todo';
import { withErrorHandling } from "@/lib/api/handler";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export const GET = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();

  const rows = await db
    .select({
      todoDate: schema.todos.todoDate,
      isCompleted: schema.todos.isCompleted,
    })
    .from(schema.todos)
    .where(eq(schema.todos.studentId, params.id));

  const byDate = new Map<string, { total: number; completed: number }>();
  for (const row of rows) {
    const entry = byDate.get(row.todoDate) ?? { total: 0, completed: 0 };
    entry.total += 1;
    if (row.isCompleted) entry.completed += 1;
    byDate.set(row.todoDate, entry);
  }

  const days: DayCompletion[] = Array.from(byDate.entries()).map(
    ([date, v]) => ({
      date,
      ...v,
    }),
  );
  const { currentStreak, longestStreak } = computeStreaks(days, todayKey());

  const today = byDate.get(todayKey()) ?? { total: 0, completed: 0 };
  const todayCompletionRate =
    today.total > 0 ? Math.round((today.completed / today.total) * 100) : 0;

  const last7Days: DayCompletion[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    const entry = byDate.get(key) ?? { total: 0, completed: 0 };
    return { date: key, ...entry };
  }).reverse();

  return NextResponse.json({
    currentStreak,
    longestStreak,
    todayCompletionRate,
    last7Days,
  });
});
