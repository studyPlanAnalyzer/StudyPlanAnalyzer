import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, eq, gte } from "drizzle-orm";
import { getUserFromRequest, unauthorizedResponse } from "@/lib/auth/middleware";
import { addDays, toDateString, todayUTC } from "@/lib/utils/date-utils";
import { withErrorHandling } from "@/lib/api/handler";

function summarize(attempts: { score: number; completedAt: Date }[]) {
  if (attempts.length === 0) return { completed: 0, averageScore: 0 };
  const total = attempts.reduce((sum, a) => sum + a.score, 0);
  return { completed: attempts.length, averageScore: Math.round((total / attempts.length) * 10) / 10 };
}

export const GET = withErrorHandling(async (req: NextRequest, { params }: { params: { id: string } }) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();

  const [student] = await db
    .select()
    .from(schema.students)
    .where(and(eq(schema.students.id, params.id), eq(schema.students.parentId, user.id)))
    .limit(1);
  if (!student) return NextResponse.json({ error: "Student not found" }, { status: 404 });

  const cutoff30 = addDays(todayUTC(), -30);
  const attempts = await db
    .select({ score: schema.quizAttempts.score, completedAt: schema.quizAttempts.completedAt })
    .from(schema.quizAttempts)
    .where(and(eq(schema.quizAttempts.studentId, student.id), gte(schema.quizAttempts.completedAt, cutoff30)));

  const cutoff7 = addDays(todayUTC(), -7);
  const last7 = attempts.filter((a) => a.completedAt >= cutoff7);

  return NextResponse.json({
    last7Days: summarize(last7),
    last30Days: summarize(attempts),
  });
});
