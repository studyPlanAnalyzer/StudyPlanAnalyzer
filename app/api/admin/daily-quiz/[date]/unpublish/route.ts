import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { getUserFromRequest, unauthorizedResponse, forbiddenResponse } from "@/lib/auth/middleware";
import { withErrorHandling } from "@/lib/api/handler";

const unpublishSchema = z.object({
  gradeGroup: z.enum(["GROUP_4_7", "GROUP_8_10"]),
});

export const POST = withErrorHandling(async (req: NextRequest, { params }: { params: { date: string } }) => {
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

  const attempts = await db.select().from(schema.quizAttempts).where(eq(schema.quizAttempts.dailyQuizId, quiz.id));
  if (attempts.length > 0) {
    return NextResponse.json(
      {
        error: `${attempts.length} student(s) have already attempted this quiz — it can no longer be unpublished. Prepare a fresh quiz for a future date instead.`,
      },
      { status: 409 }
    );
  }

  await db
    .update(schema.dailyQuizzes)
    .set({ isPublished: false, updatedAt: new Date() })
    .where(eq(schema.dailyQuizzes.id, quiz.id));

  return NextResponse.json({ message: "Unpublished. You can now change the questions and republish." });
});
