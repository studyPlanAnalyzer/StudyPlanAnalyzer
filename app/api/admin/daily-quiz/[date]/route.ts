import { NextRequest, NextResponse } from "next/server";
import { db, schema } from "@/lib/db";
import { and, asc, eq } from "drizzle-orm";
import { getUserFromRequest, unauthorizedResponse, forbiddenResponse } from "@/lib/auth/middleware";
import { withErrorHandling } from "@/lib/api/handler";

const GRADE_GROUPS = ["GROUP_4_7", "GROUP_8_10"] as const;

export const GET = withErrorHandling(async (req: NextRequest, { params }: { params: { date: string } }) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const results = await Promise.all(
    GRADE_GROUPS.map(async (gradeGroup) => {
      const [quiz] = await db
        .select()
        .from(schema.dailyQuizzes)
        .where(and(eq(schema.dailyQuizzes.date, params.date), eq(schema.dailyQuizzes.gradeGroup, gradeGroup)))
        .limit(1);

      if (!quiz) return { gradeGroup, quiz: null, questions: [] };

      const links = await db
        .select()
        .from(schema.dailyQuizQuestions)
        .where(eq(schema.dailyQuizQuestions.dailyQuizId, quiz.id))
        .orderBy(asc(schema.dailyQuizQuestions.order));

      const questionIds = links.map((l) => l.questionId);
      const questionRows =
        questionIds.length > 0
          ? await db.select().from(schema.questions)
          : [];
      const questionById = new Map(questionRows.map((q) => [q.id, q]));

      const questions = links.map((l) => ({ order: l.order, question: questionById.get(l.questionId) ?? null }));

      return { gradeGroup, quiz, questions };
    })
  );

  return NextResponse.json({ date: params.date, groups: results });
});
