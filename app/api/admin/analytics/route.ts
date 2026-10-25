import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { gte } from "drizzle-orm";
import { getUserFromRequest, unauthorizedResponse, forbiddenResponse } from "@/lib/auth/middleware";
import { addDays, toDateString, todayUTC } from "@/lib/utils/date-utils";
import { withErrorHandling } from "@/lib/api/handler";

const LOOKBACK_DAYS = 30;

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const cutoff = toDateString(addDays(todayUTC(), -LOOKBACK_DAYS));

  const quizzes = await db.select().from(schema.dailyQuizzes).where(gte(schema.dailyQuizzes.date, cutoff));
  const quizIds = quizzes.map((q) => q.id);

  const attempts = quizIds.length > 0 ? await db.select().from(schema.quizAttempts) : [];
  const quizIdSet = new Set(quizIds);
  const relevantAttempts = attempts.filter((a) => quizIdSet.has(a.dailyQuizId));

  // Total students in the system, as a rough denominator for participation.
  // A precise per-grade-group total would need a live headcount of students
  // in that grade group; keeping this simple since it's a rough indicator,
  // not a precise KPI.
  const allStudents = await db.select({ id: schema.students.id }).from(schema.students);

  const quizById = new Map(quizzes.map((q) => [q.id, q]));

  interface DayGroupStat {
    date: string;
    gradeGroup: string;
    attemptsCount: number;
    averageScore: number;
  }

  const statsMap = new Map<string, DayGroupStat>();
  for (const quiz of quizzes) {
    const key = `${quiz.date}|${quiz.gradeGroup}`;
    if (!statsMap.has(key)) {
      statsMap.set(key, { date: quiz.date, gradeGroup: quiz.gradeGroup, attemptsCount: 0, averageScore: 0 });
    }
  }

  const scoreSums = new Map<string, number>();
  for (const attempt of relevantAttempts) {
    const quiz = quizById.get(attempt.dailyQuizId);
    if (!quiz) continue;
    const key = `${quiz.date}|${quiz.gradeGroup}`;
    const stat = statsMap.get(key);
    if (!stat) continue;
    stat.attemptsCount += 1;
    scoreSums.set(key, (scoreSums.get(key) ?? 0) + attempt.score);
  }

  for (const [key, stat] of statsMap) {
    const sum = scoreSums.get(key) ?? 0;
    stat.averageScore = stat.attemptsCount > 0 ? Math.round((sum / stat.attemptsCount) * 10) / 10 : 0;
  }

  const results = Array.from(statsMap.values()).sort((a, b) => (a.date < b.date ? 1 : -1));

  return NextResponse.json({
    lookbackDays: LOOKBACK_DAYS,
    totalStudentsInSystem: allStudents.length,
    days: results,
  });
});
