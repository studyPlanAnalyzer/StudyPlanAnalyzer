export interface Todo {
  id: string;
  studentId: string;
  content: string;
  isCompleted: boolean;
  todoDate: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;
}

export interface DayCompletion {
  date: string; // YYYY-MM-DD
  total: number;
  completed: number;
}

export interface TodoStats {
  currentStreak: number;
  longestStreak: number;
  todayCompletionRate: number; // 0-100
  last7Days: DayCompletion[];
}
