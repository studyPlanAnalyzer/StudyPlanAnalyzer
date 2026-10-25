import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import {
  getUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from "@/lib/api/handler";

const updateQuestionSchema = z.object({
  category: z
    .enum([
      'IQ_LOGIC',
      'SCIENCE',
      'GENERAL_KNOWLEDGE',
      'TECH_AI',
      'MATHEMATICS',
    ])
    .optional(),
  gradeGroup: z.enum(['GROUP_4_7', 'GROUP_8_10']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  questionText: z.string().min(1).optional(),
  options: z.array(z.string().min(1)).length(4).optional(),
  correctAnswer: z.string().min(1).optional(),
  explanation: z.string().nullable().optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'ARCHIVED']).optional(),
});

export const PUT = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: { id: string } },
) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const [existing] = await db
    .select()
    .from(schema.questions)
    .where(eq(schema.questions.id, params.id))
    .limit(1);
  if (!existing)
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  const body = await req.json();
  const parsed = updateQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const nextOptions = parsed.data.options ?? (existing.options as string[]);
  const nextCorrectAnswer = parsed.data.correctAnswer ?? existing.correctAnswer;
  if (!nextOptions.includes(nextCorrectAnswer)) {
    return NextResponse.json(
      { error: 'correctAnswer must be one of the 4 options' },
      { status: 400 },
    );
  }

  const [question] = await db
    .update(schema.questions)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(schema.questions.id, params.id))
    .returning();

  return NextResponse.json({ question });
});
