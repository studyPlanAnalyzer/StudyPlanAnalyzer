import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { and, count, eq } from "drizzle-orm";
import { getUserFromRequest, unauthorizedResponse, forbiddenResponse } from "@/lib/auth/middleware";
import { withErrorHandling } from "@/lib/api/handler";
import { recountQuestionUsage } from "@/lib/question-usage";

const unpublishSchema = z.object({
  gradeGroup: z.enum(["GROUP_4_7", "GROUP_8_10"]),
});

export const POST = withErrorHandling(async (req: NextRequest, props: { params: Promise<{ date: string }> }) => {
  const params = await props.params;
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const body = await req.json();
  const parsed = unpublishSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten() }, { status: 400 });
  }

  const [quiz] = await db
    .select()
    .from(schema.dailyQuizzes)
    .where(and(eq(schema.dailyQuizzes.date, params.date), eq(schema.dailyQuizzes.gradeGroup, parsed.data.gradeGroup)))
    .limit(1);
  if (!quiz) return NextResponse.json({ error: "No quiz found for that date/grade group" }, { status: 404 });

  // The quiz row is locked, then its attempts counted: a student submitting
  // at the same moment either finishes first (and is counted, so the quiz
  // stays published) or waits and then finds it unpublished.
  const attempted = await db.transaction(async (tx) => {
    await tx
      .select({ id: schema.dailyQuizzes.id })
      .from(schema.dailyQuizzes)
      .where(eq(schema.dailyQuizzes.id, quiz.id))
      .for("update");
    const [{ n }] = await tx
      .select({ n: count() })
      .from(schema.quizAttempts)
      .where(eq(schema.quizAttempts.dailyQuizId, quiz.id));
    if (n > 0) return n;

    await tx
      .update(schema.dailyQuizzes)
      .set({ isPublished: false, updatedAt: new Date() })
      .where(eq(schema.dailyQuizzes.id, quiz.id));
    // The quiz no longer counts as a use of its questions.
    const links = await tx
      .select({ questionId: schema.dailyQuizQuestions.questionId })
      .from(schema.dailyQuizQuestions)
      .where(eq(schema.dailyQuizQuestions.dailyQuizId, quiz.id));
    await recountQuestionUsage(
      tx,
      links.map((l) => l.questionId),
    );
    return 0;
  });
  if (attempted > 0) {
    return NextResponse.json(
      {
        error: `${attempted} student(s) have already attempted this quiz — it can no longer be unpublished. Prepare a fresh quiz for a future date instead.`,
      },
      { status: 409 }
    );
  }

  return NextResponse.json({ message: "Unpublished. You can now change the questions and republish." });
});
