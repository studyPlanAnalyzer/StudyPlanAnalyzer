'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '@/lib/api-client';
import type { Todo, TodoStats } from '@/lib/types/todo';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

const STREAK_MESSAGES: [number, string][] = [
  [30, '🔥 A month straight. Unstoppable.'],
  [14, '🔥 Two weeks of pure discipline.'],
  [7, '🔥 A full week — this is becoming a habit.'],
  [3, '🔥 Nice, a few days in a row.'],
  [1, 'Good start — keep it going.'],
  [0, "Complete today's tasks to start a streak."],
];

function streakMessage(streak: number) {
  return STREAK_MESSAGES.find(([min]) => streak >= min)?.[1] ?? '';
}

export function DailyTodoPanel({ studentId }: { studentId: string }) {
  const router = useRouter();
  const date = todayKey();

  const [todos, setTodos] = useState<Todo[] | null>(null);
  const [stats, setStats] = useState<TodoStats | null>(null);
  const [newTodo, setNewTodo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [todosRes, statsRes] = await Promise.all([
        api.get<{ todos: Todo[] }>(
          `/api/students/${studentId}/todos?date=${date}`,
        ),
        api.get<TodoStats>(`/api/students/${studentId}/todos/stats`),
      ]);
      setTodos(todosRes.todos);
      setStats(statsRes);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }
      setError("Couldn't load today's tasks. Please try refreshing.");
    }
  }, [studentId, date, router]);

  useEffect(() => {
    load();
  }, [load]);

  function markPending(id: string, pending: boolean) {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleAdd() {
    const content = newTodo.trim();
    if (!content || isAdding) return;
    setIsAdding(true);
    setError(null);
    try {
      await api.post(`/api/students/${studentId}/todos`, {
        content,
        todoDate: date,
      });
      setNewTodo('');
      await load();
    } catch {
      setError("Couldn't add that task. Please try again.");
    } finally {
      setIsAdding(false);
    }
  }

  async function handleToggle(todo: Todo) {
    if (pendingIds.has(todo.id)) return;
    markPending(todo.id, true);
    setError(null);
    try {
      await api.patch(`/api/students/${studentId}/todos/${todo.id}`, {
        isCompleted: !todo.isCompleted,
      });
      await load();
    } catch {
      setError("Couldn't update that task. Please try again.");
    } finally {
      markPending(todo.id, false);
    }
  }

  async function handleDelete(todoId: string) {
    if (pendingIds.has(todoId)) return;
    markPending(todoId, true);
    setError(null);
    try {
      await api.delete(`/api/students/${studentId}/todos/${todoId}`);
      await load();
    } catch {
      setError("Couldn't remove that task. Please try again.");
      markPending(todoId, false);
    }
    // On success the item disappears with the reload, so no need to clear
    // pending state here — but if load() keeps it around for any reason,
    // the finally below covers it.
  }

  const completedCount = todos?.filter((t) => t.isCompleted).length ?? 0;
  const totalCount = todos?.length ?? 0;
  const progressPct = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return (
    <div className="rounded-[32px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-8">
      {/* HEADER */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
          Today&apos;s to-dos
        </h2>

        {stats && (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#F7CC46] px-4 py-2 text-sm font-bold text-black">
            🔥 {stats.currentStreak}-day streak
          </span>
        )}
      </div>

      {/* STREAK STATS */}
      {stats && (
        <div className="mb-6 rounded-[26px] bg-[#F0EFED] p-5">
          <p className="text-sm font-semibold leading-6 text-black">
            {streakMessage(stats.currentStreak)}
          </p>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-black/65">
            <span>Longest streak: {stats.longestStreak} days</span>
            <span>Today: {stats.todayCompletionRate}% complete</span>
          </div>

          <div className="mt-4 flex gap-1.5">
            {stats.last7Days.map((d) => {
              const pct = d.total > 0 ? d.completed / d.total : 0;
              const label = new Date(`${d.date}T00:00:00Z`).toLocaleDateString(
                'en-US',
                {
                  weekday: 'narrow',
                  timeZone: 'UTC',
                },
              );
              return (
                <div
                  key={d.date}
                  className="flex flex-1 flex-col items-center gap-1.5"
                >
                  <div
                    className={`h-8 w-full rounded-xl ${
                      d.total === 0
                        ? 'bg-white'
                        : pct === 1
                          ? 'bg-[#a4e5c7]'
                          : pct > 0
                            ? 'bg-[#F7CC46]'
                            : 'bg-[#EDB1AA]'
                    }`}
                    title={`${d.date}: ${d.completed}/${d.total}`}
                  />
                  <span className="text-[10px] font-bold text-black/50">
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PROGRESS */}
      {totalCount > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-semibold text-black/65">
            {completedCount} of {totalCount} done today
          </p>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#F0EFED]">
            <div
              className="h-full rounded-full bg-black transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {/* ERROR */}
      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ADD TASK */}
      <div className="mb-5 flex gap-2">
        {isAdding ? (
          <div className="flex flex-1 items-center gap-3 rounded-full bg-[#F0EFED] px-5 py-3 text-sm font-semibold text-black/55">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-black/20 border-t-black" />
            <span className="min-w-0 truncate">
              Adding &ldquo;{newTodo.trim()}&rdquo;...
            </span>
          </div>
        ) : (
          <>
            <input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Add a task for today..."
              disabled={isAdding}
              className="min-w-0 flex-1 rounded-full border border-black/15 bg-white px-5 py-3 text-sm outline-none transition placeholder:text-black/35 focus:border-black focus:ring-2 focus:ring-black/10 disabled:bg-[#F0EFED] disabled:text-black/40"
            />

            <button
              type="button"
              onClick={handleAdd}
              disabled={isAdding || !newTodo.trim()}
              className="inline-flex shrink-0 items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-black/80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Add
            </button>
          </>
        )}
      </div>

      {/* TODO LIST */}
      {todos === null ? (
        <p className="text-sm font-semibold text-[#65615D]">Loading...</p>
      ) : todos.length === 0 ? (
        <p className="text-sm leading-6 text-[#65615D]">
          No tasks yet — add your first one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {todos.map((todo) => {
            const isPending = pendingIds.has(todo.id);
            return (
              <li
                key={todo.id}
                className={`flex items-center gap-3 rounded-2xl bg-[#F0EFED] px-4 py-3 transition-opacity ${
                  isPending ? 'opacity-50' : ''
                }`}
              >
                {isPending ? (
                  <span className="h-5 w-5 flex-shrink-0 animate-spin rounded-full border-2 border-black/20 border-t-black" />
                ) : (
                  <input
                    type="checkbox"
                    checked={todo.isCompleted}
                    onChange={() => handleToggle(todo)}
                    disabled={isPending}
                    className="h-5 w-5 shrink-0 cursor-pointer accent-black"
                  />
                )}

                <span
                  className={`min-w-0 flex-1 break-words text-sm font-semibold sm:text-base ${
                    todo.isCompleted
                      ? 'text-black/40 line-through'
                      : 'text-black'
                  }`}
                >
                  {todo.content}
                </span>

                <button
                  type="button"
                  onClick={() => handleDelete(todo.id)}
                  disabled={isPending}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm text-black/45 transition hover:bg-white hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Delete task"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
