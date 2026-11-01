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
import { addMonths } from '@/lib/billing/state';

const bodySchema = z.object({ months: z.number().int().min(1).max(36) });

/**
 * The school paid us for another stretch: its paid-until moves on by that many
 * months (from today, or from its current end if that is later), and every
 * child covered by the school moves with it.
 */
export const POST = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const user = await getUserFromRequest(req);
    if (!user) return unauthorizedResponse();
    if (!user.isAdmin) return forbiddenResponse();

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Enter a number of months (1 to 36).' },
        { status: 400 },
      );

    const result = await db.transaction(async (tx) => {
      const [school] = await tx
        .select()
        .from(schema.schools)
        .where(eq(schema.schools.id, params.id))
        .limit(1);
      if (!school) return null;
      const now = new Date();
      const start =
        school.paidUntil && school.paidUntil.getTime() > now.getTime()
          ? school.paidUntil
          : now;
      const paidUntil = addMonths(start, parsed.data.months);
      await tx
        .update(schema.schools)
        .set({ paidUntil })
        .where(eq(schema.schools.id, school.id));
      await tx
        .update(schema.students)
        .set({ paidUntil, updatedAt: now })
        .where(
          and(
            eq(schema.students.schoolId, school.id),
            eq(schema.students.paymentStatus, 'school'),
          ),
        );
      return { school, paidUntil };
    });
    if (!result)
      return NextResponse.json({ error: 'School not found' }, { status: 404 });
    return NextResponse.json({
      schoolId: result.school.id,
      paidUntil: result.paidUntil.toISOString(),
    });
  },
);
