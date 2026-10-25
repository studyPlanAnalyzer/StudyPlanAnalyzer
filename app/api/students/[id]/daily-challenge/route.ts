import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, asc, eq } from 'drizzle-orm';
import {
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { gradeGroupFromGradeText } from '@/lib/utils/grade-group';
import { toDateString, todayUTC } from '@/lib/utils/date-utils';
import {
  StudentQuizQuestion,
  QuizAttemptAnswer,
} from '@/lib/types/daily-challenge';
import { withErrorHandling } from '@/lib/api/handler';

async function loadOwnedStudent(studentId: string, parentId: string) {
  const [student] = await db
    .select()
    .from(schema.students)
    .where(
      and(
        eq(schema.students.id, studentId),
        eq(schema.students.parentId, parentId),
      ),
    )
    .limit(1);
  return student ?? null;
}

export const GET = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const student = await loadOwnedStudent(params.id, user.id);
    if (!student)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const gradeGroup = gradeGroupFromGradeText(student.grade);
    if (!gradeGroup) {
      return NextResponse.json({
        eligible: false,
        quiz: null,
        questions: [],
        attempt: null,
      });
    }

    const today = toDateString(todayUTC());
    const [quiz] = await db
      .select()
      .from(schema.dailyQuizzes)
      .where(
        and(
          eq(schema.dailyQuizzes.date, today),
          eq(schema.dailyQuizzes.gradeGroup, gradeGroup),
          eq(schema.dailyQuizzes.isPublished, true),
        ),
      )
      .limit(1);

    if (!quiz) {
      return NextResponse.json({
        eligible: true,
        quiz: null,
        questions: [],
        attempt: null,
      });
    }

    const [existingAttempt] = await db
      .select()
      .from(schema.quizAttempts)
      .where(
        and(
          eq(schema.quizAttempts.studentId, student.id),
          eq(schema.quizAttempts.dailyQuizId, quiz.id),
        ),
      )
      .limit(1);

    const links = await db
      .select()
      .from(schema.dailyQuizQuestions)
      .where(eq(schema.dailyQuizQuestions.dailyQuizId, quiz.id))
      .orderBy(asc(schema.dailyQuizQuestions.order));
    const questionRows = await db.select().from(schema.questions);
    const questionById = new Map(questionRows.map((q) => [q.id, q]));

    if (existingAttempt) {
      // Already attempted — safe to reveal correct answers/explanations now.
      const fullQuestions = links
        .map((l) => questionById.get(l.questionId))
        .filter(Boolean);
      return NextResponse.json({
        eligible: true,
        quiz: { id: quiz.id, date: quiz.date, gradeGroup: quiz.gradeGroup },
        questions: fullQuestions,
        attempt: existingAttempt,
      });
    }

    // Not yet attempted — withhold correctAnswer/explanation.
    const studentQuestions: StudentQuizQuestion[] = links
      .map((l) => questionById.get(l.questionId))
      .filter((q): q is NonNullable<typeof q> => !!q)
      .map((q) => ({
        id: q.id,
        category: q.category,
        questionText: q.questionText,
        options: q.options as string[],
      }));

    return NextResponse.json({
      eligible: true,
      quiz: { id: quiz.id, date: quiz.date, gradeGroup: quiz.gradeGroup },
      questions: studentQuestions,
      attempt: null,
    });
  },
);

const submitSchema = z.object({
  dailyQuizId: z.string().uuid(),
  answers: z
    .array(
      z.object({
        questionId: z.string().uuid(),
        selectedAnswer: z.string().min(1),
      }),
    )
    .length(5),
});

export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();

    const student = await loadOwnedStudent(params.id, user.id);
    if (!student)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const body = await req.json();
    const parsed = submitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { dailyQuizId, answers } = parsed.data;

    const [quiz] = await db
      .select()
      .from(schema.dailyQuizzes)
      .where(
        and(
          eq(schema.dailyQuizzes.id, dailyQuizId),
          eq(schema.dailyQuizzes.isPublished, true),
        ),
      )
      .limit(1);
    if (!quiz)
      return NextResponse.json(
        { error: 'Quiz not found or not published' },
        { status: 404 },
      );

    const today = toDateString(todayUTC());
    if (quiz.date !== today) {
      return NextResponse.json(
        { error: "This quiz is no longer today's challenge" },
        { status: 400 },
      );
    }

    const [existingAttempt] = await db
      .select()
      .from(schema.quizAttempts)
      .where(
        and(
          eq(schema.quizAttempts.studentId, student.id),
          eq(schema.quizAttempts.dailyQuizId, dailyQuizId),
        ),
      )
      .limit(1);
    if (existingAttempt) {
      return NextResponse.json(
        { error: 'This quiz has already been attempted' },
        { status: 409 },
      );
    }

    const links = await db
      .select()
      .from(schema.dailyQuizQuestions)
      .where(eq(schema.dailyQuizQuestions.dailyQuizId, dailyQuizId));
    const validQuestionIds = new Set(links.map((l) => l.questionId));
    if (
      answers.length !== links.length ||
      !answers.every((a) => validQuestionIds.has(a.questionId))
    ) {
      return NextResponse.json(
        { error: "Answers don't match this quiz's questions" },
        { status: 400 },
      );
    }

    const questionRows = await db.select().from(schema.questions);
    const questionById = new Map(questionRows.map((q) => [q.id, q]));

    // Scoring happens here, server-side, using the correctAnswer values that
    // were never sent to the client on GET — the client only ever saw options.
    let score = 0;
    const gradedAnswers: QuizAttemptAnswer[] = answers.map((a) => {
      const question = questionById.get(a.questionId);
      const correct = !!question && question.correctAnswer === a.selectedAnswer;
      if (correct) score += 1;
      return {
        questionId: a.questionId,
        selectedAnswer: a.selectedAnswer,
        correct,
      };
    });

    const [attempt] = await db
      .insert(schema.quizAttempts)
      .values({
        studentId: student.id,
        dailyQuizId,
        score,
        totalQuestions: links.length,
        answers: gradedAnswers,
      })
      .returning();

    const fullQuestions = links
      .sort((a, b) => a.order - b.order)
      .map((l) => questionById.get(l.questionId))
      .filter(Boolean);

    return NextResponse.json(
      { attempt, questions: fullQuestions },
      { status: 201 },
    );
  },
);
