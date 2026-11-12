import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { paymentRequiredResponse } from '@/lib/billing/guard';
import { loadRevision, recordRevision } from '@/lib/revision';
import { todayKey } from '@/lib/utils/date-utils';

async function ownedStudent(
  req: NextRequest,
  id: string,
): Promise<{ error: Response } | { student: typeof schema.students.$inferSelect }> {
  const userId = await getAuthUserId(req);
  if (!userId) return { error: unauthorizedResponse() };
  const [student] = await db
    .select()
    .from(schema.students)
    .where(and(eq(schema.students.id, id), eq(schema.students.parentId, userId)))
    .limit(1);
  if (!student) return { error: NextResponse.json({ error: 'Student not found' }, { status: 404 }) };
  const denied = paymentRequiredResponse(student);
  if (denied) return { error: denied };
  return { student };
}

/** The revision list: every earlier-exam topic under its heading (lib/revision.ts). */
export const GET = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const { id } = await props.params;
    const owned = await ownedStudent(req, id);
    if ('error' in owned) return owned.error;
    return NextResponse.json(await loadRevision(owned.student, todayKey()));
  },
);

const bodySchema = z.object({
  topicId: z.string().uuid(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
});

/** "Revised it": records today's revision of an earlier topic and its rating. */
export const POST = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const { id } = await props.params;
    const owned = await ownedStudent(req, id);
    if ('error' in owned) return owned.error;
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 });
    const today = todayKey();
    const result = await recordRevision(owned.student, parsed.data.topicId, parsed.data.rating, today);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(
      { backOnDailyList: result.backOnDailyList, revision: await loadRevision(owned.student, today) },
      { status: 201 },
    );
  },
);
