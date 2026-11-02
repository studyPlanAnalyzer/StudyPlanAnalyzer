import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { appToday } from '@/lib/utils/date-utils';
import { rebuildPlan } from '@/lib/plan-rebuild';
import { paymentRequiredResponse } from '@/lib/billing/guard';
import { withErrorHandling } from '@/lib/api/handler';

export const maxDuration = 60;

// The body is optional. Callers that just want to rebuild the plan with its
// existing setting can send nothing (or an empty object).
const regenerateSchema = z.object({
  useBufferWeek: z.boolean().optional(),
});

export const POST = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ planId: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const rawBody = await req.json().catch(() => ({}));
    const parsedBody = regenerateSchema.safeParse(rawBody ?? {});
    if (!parsedBody.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsedBody.error.flatten() },
        { status: 400 },
      );
    }
    const requestedBufferWeek = parsedBody.data.useBufferWeek;

    // The plan and its owner in one query (it used to be two in a row).
    const [found] = await db
      .select({ plan: schema.studyPlans, student: schema.students })
      .from(schema.studyPlans)
      .innerJoin(
        schema.students,
        eq(schema.students.id, schema.studyPlans.studentId),
      )
      .where(
        and(
          eq(schema.studyPlans.id, params.planId),
          eq(schema.students.parentId, userId),
        ),
      )
      .limit(1);
    if (!found)
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    const { plan, student } = found;
    const denied = paymentRequiredResponse(student);
    if (denied) return denied;

    const result = await rebuildPlan({
      plan,
      student,
      fromDate: appToday(),
      useBufferWeek: requestedBufferWeek,
    });
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({
      plan: result.plan,
      sessionsCreated: result.sessionsCreated,
      unscheduledTopicCount: result.unscheduledTopicCount,
    });
  },
);
