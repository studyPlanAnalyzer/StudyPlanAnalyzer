import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import {
  getUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth/middleware';
import { CATEGORY_ORDER, QuestionCategory } from '@/lib/types/daily-challenge';
import { isRealDateString, todayKey } from '@/lib/utils/date-utils';
import { recountQuestionUsage } from '@/lib/question-usage';
import { withErrorHandling } from '@/lib/api/handler';

const publishSchema = z.object({
  gradeGroup: z.enum(['GROUP_4_7', 'GROUP_8_10']),
  // exactly one question id per category
  questionIds: z.object({
    IQ_LOGIC: z.string().uuid(),
    SCIENCE: z.string().uuid(),
    GENERAL_KNOWLEDGE: z.string().uuid(),
    TECH_AI: z.string().uuid(),
    MATHEMATICS: z.string().uuid(),
  }),
});

/**
 * Publishing is intentionally a full replace, not a patch: once published a
 * quiz is treated as locked (see the unpublish route), so the only way back
 * in here is unpublish -> republish, which always re-validates every
 * question and recounts timesUsed/lastUsedAt from the published quizzes.
 */
export const POST = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ date: string }> }) => {
    const params = await props.params;
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();
    if (!user.isAdmin) return forbiddenResponse();
    if (!isRealDateString(params.date))
      return NextResponse.json(
        { error: 'Use a real date (YYYY-MM-DD)' },
        { status: 400 },
      );
    // A quiz for a day that has passed would never be seen by a student.
    if (params.date < todayKey())
      return NextResponse.json(
        { error: 'This day has passed. Publish quizzes for today or later.' },
        { status: 400 },
      );

    const body = await req.json();
    const parsed = publishSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { gradeGroup, questionIds } = parsed.data;

    const [existing] = await db
      .select()
      .from(schema.dailyQuizzes)
      .where(
        and(
          eq(schema.dailyQuizzes.date, params.date),
          eq(schema.dailyQuizzes.gradeGroup, gradeGroup),
        ),
      )
      .limit(1);

    if (existing?.isPublished) {
      return NextResponse.json(
        {
          error:
            'This quiz is already published. Unpublish it first if you need to change the questions.',
        },
        { status: 409 },
      );
    }

    // Validate all 3 selected questions: must exist, be APPROVED, match this
    // grade group, and each must actually belong to the category it's being
    // used for.
    const selections: { category: QuestionCategory; questionId: string }[] =
      CATEGORY_ORDER.map((category) => ({
        category,
        questionId: questionIds[category],
      }));

    for (const { category, questionId } of selections) {
      const [q] = await db
        .select()
        .from(schema.questions)
        .where(eq(schema.questions.id, questionId))
        .limit(1);
      if (!q)
        return NextResponse.json(
          { error: `Question for ${category} not found` },
          { status: 404 },
        );
      if (q.status !== 'APPROVED') {
        return NextResponse.json(
          { error: `Question for ${category} is not approved` },
          { status: 400 },
        );
      }
      if (q.gradeGroup !== gradeGroup) {
        return NextResponse.json(
          {
            error: `Question for ${category} doesn't match the selected grade group`,
          },
          { status: 400 },
        );
      }
      if (q.category !== category) {
        return NextResponse.json(
          { error: `Selected question isn't categorized as ${category}` },
          { status: 400 },
        );
      }
    }

    // The quiz, its question links and the usage counters are saved together,
    // and the quiz is marked published as the very last step, so students can
    // never see a quiz whose questions are half replaced.
    const quiz = await db.transaction(async (tx) => {
      const [row] = existing
        ? [existing]
        : await tx
            .insert(schema.dailyQuizzes)
            .values({ date: params.date, gradeGroup, isPublished: false })
            .returning();

      // Clear any stale links (e.g. left over from a prior unpublish) then
      // create fresh ones in the fixed category order.
      const previous = await tx
        .select({ questionId: schema.dailyQuizQuestions.questionId })
        .from(schema.dailyQuizQuestions)
        .where(eq(schema.dailyQuizQuestions.dailyQuizId, row.id));
      await tx
        .delete(schema.dailyQuizQuestions)
        .where(eq(schema.dailyQuizQuestions.dailyQuizId, row.id));
      await tx.insert(schema.dailyQuizQuestions).values(
        selections.map((s, order) => ({
          dailyQuizId: row.id,
          questionId: s.questionId,
          order,
        })),
      );

      const [published] = await tx
        .update(schema.dailyQuizzes)
        .set({ isPublished: true, updatedAt: new Date() })
        .where(eq(schema.dailyQuizzes.id, row.id))
        .returning();

      // Questions now in the quiz, and any it no longer uses.
      await recountQuestionUsage(tx, [
        ...selections.map((s) => s.questionId),
        ...previous.map((p) => p.questionId),
      ]);
      return published;
    });

    return NextResponse.json({ quiz }, { status: 201 });
  },
);
