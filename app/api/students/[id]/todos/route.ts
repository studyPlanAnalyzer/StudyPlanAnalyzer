import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, asc, eq } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { requireChildAccess } from '@/lib/billing/guard';

const createTodoSchema = z.object({
  content: z.string().min(1).max(500),
  todoDate: z.string().min(1), // YYYY-MM-DD
});

export const GET = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const { searchParams } = new URL(req.url);
    const todoDate = searchParams.get('date');
    if (!todoDate) {
      return NextResponse.json(
        { error: 'date query param is required' },
        { status: 400 },
      );
    }

    // The child must be this parent's, and paid up.
    const denied = await requireChildAccess(params.id, userId, {
      requireOwner: true,
    });
    if (denied) return denied;

    const items = await db
      .select()
      .from(schema.todos)
      .where(
        and(
          eq(schema.todos.studentId, params.id),
          eq(schema.todos.todoDate, todoDate),
        ),
      )
      .orderBy(asc(schema.todos.createdAt));

    return NextResponse.json({ todos: items });
  },
);

export const POST = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const body = await req.json();
    const parsed = createTodoSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const denied = await requireChildAccess(params.id, userId, {
      requireOwner: true,
    });
    if (denied) return denied;

    const [todo] = await db
      .insert(schema.todos)
      .values({ ...parsed.data, studentId: params.id })
      .returning();

    return NextResponse.json({ todo }, { status: 201 });
  },
);
