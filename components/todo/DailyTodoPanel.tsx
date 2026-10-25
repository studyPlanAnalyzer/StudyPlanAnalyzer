'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
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
    <Card className="mb-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">
          Today&apos;s to-dos
        </h2>
        {stats && (
          <span className="flex items-center gap-1 text-sm font-medium text-orange-600">
            🔥 {stats.currentStreak}-day streak
          </span>
        )}
      </div>

      {stats && (
        <div className="mb-4 rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-slate-500">
            {streakMessage(stats.currentStreak)}
          </p>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>Longest streak: {stats.longestStreak} days</span>
            <span>Today: {stats.todayCompletionRate}% complete</span>
          </div>
          <div className="mt-2 flex gap-1">
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
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div
                    className={`h-6 w-full rounded ${
                      d.total === 0
                        ? 'bg-slate-200'
                        : pct === 1
                          ? 'bg-emerald-500'
                          : pct > 0
                            ? 'bg-amber-400'
                            : 'bg-red-300'
                    }`}
                    title={`${d.date}: ${d.completed}/${d.total}`}
                  />
                  <span className="text-[10px] text-slate-400">{label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {totalCount > 0 && (
        <div className="mb-4">
          <p className="mb-1 text-xs text-slate-500">
            {completedCount} of {totalCount} done today
          </p>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-indigo-600 transition-all"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="mb-4 flex gap-2">
        {isAdding ? (
          <div className="flex flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-400">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
            Adding &ldquo;{newTodo.trim()}&rdquo;...
          </div>
        ) : (
          <>
            <input
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="Add a task for today..."
              disabled={isAdding}
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
            />
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={isAdding || !newTodo.trim()}
            >
              Add
            </Button>
          </>
        )}
      </div>

      {todos === null ? (
        <p className="text-sm text-slate-400">Loading...</p>
      ) : todos.length === 0 ? (
        <p className="text-sm text-slate-400">
          No tasks yet — add your first one above.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {todos.map((todo) => {
            const isPending = pendingIds.has(todo.id);
            return (
              <li
                key={todo.id}
                className={`flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 transition-opacity ${
                  isPending ? 'opacity-50' : ''
                }`}
              >
                {isPending ? (
                  <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
                ) : (
                  <input
                    type="checkbox"
                    checked={todo.isCompleted}
                    onChange={() => handleToggle(todo)}
                    disabled={isPending}
                    className="h-4 w-4"
                  />
                )}
                <span
                  className={`flex-1 text-sm ${
                    todo.isCompleted
                      ? 'text-slate-400 line-through'
                      : 'text-slate-700'
                  }`}
                >
                  {todo.content}
                </span>
                <button
                  onClick={() => handleDelete(todo.id)}
                  disabled={isPending}
                  className="text-sm text-slate-400 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Delete task"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
