import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getUserFromRequest, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';

// A parent asks for their account and all their data to be deleted. An admin
// checks the request and carries it out within 24 hours (see
// /api/admin/deletion-requests); until then the parent can cancel it.

const bodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(10, 'Tell us in a few words why (at least 10 characters).')
    .max(1000),
});

async function latestRequest(userId: string) {
  const [row] = await db
    .select({
      id: schema.deletionRequests.id,
      status: schema.deletionRequests.status,
      reason: schema.deletionRequests.reason,
      adminNote: schema.deletionRequests.adminNote,
      requestedAt: schema.deletionRequests.requestedAt,
      handledAt: schema.deletionRequests.handledAt,
    })
    .from(schema.deletionRequests)
    .where(eq(schema.deletionRequests.userId, userId))
    .orderBy(desc(schema.deletionRequests.requestedAt))
    .limit(1);
  return row ?? null;
}

/** The parent's latest request (pending, cancelled or declined), if any. */
export const GET = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  return NextResponse.json({ request: await latestRequest(user.id) });
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();

  const parsed = bodySchema.safeParse(await req.json());
  if (!parsed.success)
    return NextResponse.json(
      {
        error:
          parsed.error.flatten().fieldErrors.reason?.[0] ?? 'Enter a reason.',
      },
      { status: 400 },
    );

  const latest = await latestRequest(user.id);
  if (latest?.status === 'pending')
    return NextResponse.json(
      { error: 'Your deletion request is already waiting to be carried out.' },
      { status: 409 },
    );

  const [request] = await db
    .insert(schema.deletionRequests)
    .values({ userId: user.id, email: user.email, reason: parsed.data.reason })
    .returning();
  return NextResponse.json({ request }, { status: 201 });
});

/** Cancels the parent's waiting request. */
export const DELETE = withErrorHandling(async (req: NextRequest) => {
  const user = await getUserFromRequest(req);
  if (!user) return unauthorizedResponse();
  const cancelled = await db
    .update(schema.deletionRequests)
    .set({ status: 'cancelled', handledAt: new Date() })
    .where(
      and(
        eq(schema.deletionRequests.userId, user.id),
        eq(schema.deletionRequests.status, 'pending'),
      ),
    )
    .returning({ id: schema.deletionRequests.id });
  if (cancelled.length === 0)
    return NextResponse.json(
      { error: 'There is no waiting request to cancel.' },
      { status: 404 },
    );
  return NextResponse.json({ cancelled: true });
});
