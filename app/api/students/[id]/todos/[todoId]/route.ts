import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import {
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from "@/lib/api/handler";

const updateTodoSchema = z.object({
  content: z.string().min(1).max(500).optional(),
  isCompleted: z.boolean().optional(),
});

export const PATCH = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: { id: string; todoId: string } },
) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();

  const body = await req.json();
  const parsed = updateTodoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }

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
});

export const DELETE = withErrorHandling(async (
  req: NextRequest,
  { params }: { params: { id: string; todoId: string } },
) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();

  await db
    .delete(schema.todos)
    .where(
      and(
        eq(schema.todos.id, params.todoId),
        eq(schema.todos.studentId, params.id),
      ),
    );

  return NextResponse.json({ success: true });
});
