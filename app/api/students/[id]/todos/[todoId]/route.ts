import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { requireChildAccess } from '@/lib/billing/guard';

const updateTodoSchema = z.object({
  content: z.string().min(1).max(500).optional(),
  isCompleted: z.boolean().optional(),
});

export const PATCH = withErrorHandling(
  async (
    req: NextRequest,
    props: { params: Promise<{ id: string; todoId: string }> },
  ) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const body = await req.json();
    const parsed = updateTodoSchema.safeParse(body);
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
      .update(schema.todos)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(
        and(
          eq(schema.todos.id, params.todoId),
          eq(schema.todos.studentId, params.id),
        ),
      )
      .returning();

    if (!todo) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    return NextResponse.json({ todo });
  },
);

export const DELETE = withErrorHandling(
  async (
    req: NextRequest,
    props: { params: Promise<{ id: string; todoId: string }> },
  ) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const denied = await requireChildAccess(params.id, userId, {
      requireOwner: true,
    });
    if (denied) return denied;

    const deleted = await db
      .delete(schema.todos)
      .where(
        and(
          eq(schema.todos.id, params.todoId),
          eq(schema.todos.studentId, params.id),
        ),
      )
      .returning({ id: schema.todos.id });
    if (deleted.length === 0)
      return NextResponse.json({ error: 'Not found' }, { status: 404 });

    return NextResponse.json({ success: true });
  },
);
