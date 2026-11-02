import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { computeStreaks } from '@/lib/utils/streak';
import type { DayCompletion } from '@/lib/types/todo';
import { withErrorHandling } from '@/lib/api/handler';
import { requireChildAccess } from '@/lib/billing/guard';
import { addDays, appToday, toDateString, todayKey } from '@/lib/utils/date-utils';

export const GET = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const denied = await requireChildAccess(params.id, userId, {
      requireOwner: true,
    });
    if (denied) return denied;

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
      const key = toDateString(addDays(appToday(), -i));
      const entry = byDate.get(key) ?? { total: 0, completed: 0 };
      return { date: key, ...entry };
    }).reverse();

    return NextResponse.json({
      currentStreak,
      longestStreak,
      todayCompletionRate,
      last7Days,
    });
  },
);
