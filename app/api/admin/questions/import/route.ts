import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import {
  getUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from "@/lib/api/handler";

/**
 * Expected import format
 * ----------------------
 * This endpoint accepts a JSON array of rows shaped like:
 *
 *   {
 *     "category": "IQ_LOGIC" | "SCIENCE" | "GENERAL_KNOWLEDGE",
 *     "gradeGroup": "GROUP_4_7" | "GROUP_8_10",
 *     "difficulty": "easy" | "medium" | "hard",   // optional, defaults to "medium"
 *     "questionText": "What comes next in the sequence: 2, 4, 8, 16, ?",
 *     "option1": "24",
 *     "option2": "32",
 *     "option3": "30",
 *     "option4": "20",
 *     "correctAnswer": "32",                       // must exactly match one of option1-4
 *     "explanation": "Each number doubles the one before it."  // optional
 *   }
 *
 * The admin UI at /admin/questions can also accept a CSV file with the same
 * column names (category, gradeGroup, difficulty, questionText, option1,
 * option2, option3, option4, correctAnswer, explanation) — it's parsed
 * client-side into this same JSON shape before being POSTed here, so this
 * endpoint only ever sees JSON.
 *
 * Every imported row is created as a `questions` row with status = PENDING;
 * nothing is visible to students, or even selectable for a daily quiz, until
 * an admin explicitly approves it from /admin/questions.
 *
 * AI generation itself happens outside this app (e.g. asking Claude/Cursor
 * to draft a batch of age-appropriate questions in this JSON shape) — this
 * endpoint is only the import step.
 */

const importRowSchema = z
  .object({
    category: z.enum([
      'IQ_LOGIC',
      'SCIENCE',
      'GENERAL_KNOWLEDGE',
      'TECH_AI',
      'MATHEMATICS',
    ]),
    gradeGroup: z.enum(['GROUP_4_7', 'GROUP_8_10']),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional().default('medium'),
    questionText: z.string().min(1),
    option1: z.string().min(1),
    option2: z.string().min(1),
    option3: z.string().min(1),
    option4: z.string().min(1),
    correctAnswer: z.string().min(1),
    explanation: z.string().optional(),
  })
  .refine(
    (row) =>
      [row.option1, row.option2, row.option3, row.option4].includes(
        row.correctAnswer,
      ),
    {
      message: 'correctAnswer must exactly match one of option1-4',
      path: ['correctAnswer'],
    },
  );

const importSchema = z.array(importRowSchema).min(1).max(500);

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const body = await req.json();
  const parsed = importSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const rows = parsed.data.map((row) => ({
    source: 'ai' as const,
    category: row.category,
    gradeGroup: row.gradeGroup,
    difficulty: row.difficulty,
    questionText: row.questionText,
    options: [row.option1, row.option2, row.option3, row.option4],
    correctAnswer: row.correctAnswer,
    explanation: row.explanation || null,
    status: 'PENDING' as const,
  }));

  const inserted = await db
    .insert(schema.questions)
    .values(rows)
    .returning({ id: schema.questions.id });

  return NextResponse.json({ importedCount: inserted.length }, { status: 201 });
});
