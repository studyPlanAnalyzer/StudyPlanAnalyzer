import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, desc, eq, ilike, SQL } from 'drizzle-orm';
import {
  getUserFromRequest,
  unauthorizedResponse,
  forbiddenResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from "@/lib/api/handler";

const createQuestionSchema = z.object({
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
  options: z
    .array(z.string().min(1))
    .length(4, 'Exactly 4 options are required'),
  correctAnswer: z.string().min(1),
  explanation: z.string().optional(),
  source: z.enum(['ai', 'manual']).optional().default('manual'),
});

export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const params = req.nextUrl.searchParams;
  const gradeGroup = params.get('gradeGroup');
  const category = params.get('category');
  const status = params.get('status');
  const search = params.get('search');

  const conditions: SQL[] = [];
  if (gradeGroup)
    conditions.push(
      eq(schema.questions.gradeGroup, gradeGroup as 'GROUP_4_7' | 'GROUP_8_10'),
    );
  if (category)
    conditions.push(
      eq(
        schema.questions.category,
        category as 'IQ_LOGIC' | 'SCIENCE' | 'GENERAL_KNOWLEDGE',
      ),
    );
  if (status)
    conditions.push(
      eq(
        schema.questions.status,
        status as 'PENDING' | 'APPROVED' | 'REJECTED' | 'ARCHIVED',
      ),
    );
  if (search)
    conditions.push(ilike(schema.questions.questionText, `%${search}%`));

  const rows = await db
    .select()
    .from(schema.questions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(schema.questions.createdAt));

  return NextResponse.json({ questions: rows });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  if (!user.isAdmin) return forbiddenResponse();

  const body = await req.json();
  const parsed = createQuestionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (!parsed.data.options.includes(parsed.data.correctAnswer)) {
    return NextResponse.json(
      { error: 'correctAnswer must be one of the 4 options' },
      { status: 400 },
    );
  }

  const [question] = await db
    .insert(schema.questions)
    .values({ ...parsed.data, status: 'PENDING' })
    .returning();

  return NextResponse.json({ question }, { status: 201 });
});
