import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import {
  forbiddenResponse,
  getUserFromRequest,
  unauthorizedResponse,
} from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';

const bodySchema = z.object({
  note: z.string().trim().min(3, 'Say why, for the parent.').max(500),
});

/**
 * Declines a waiting deletion request (e.g. it doesn't seem to come from the
 * account holder). The note is shown to the parent on their Account page.
 */
export const POST = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const admin = await getUserFromRequest(req);
    if (!admin) return unauthorizedResponse();
    if (!admin.isAdmin) return forbiddenResponse();

    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.flatten().fieldErrors.note?.[0] ?? 'Say why.' },
        { status: 400 },
      );

    const declined = await db
      .update(schema.deletionRequests)
      .set({
        status: 'declined',
        adminNote: parsed.data.note,
        handledAt: new Date(),
        handledBy: admin.id,
      })
      .where(
        and(
          eq(schema.deletionRequests.id, params.id),
          eq(schema.deletionRequests.status, 'pending'),
        ),
      )
      .returning({ id: schema.deletionRequests.id });
    if (declined.length === 0)
      return NextResponse.json(
        { error: 'This request is not waiting any more.' },
        { status: 409 },
      );
    return NextResponse.json({ declined: true });
  },
);
