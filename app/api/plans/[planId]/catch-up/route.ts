import { NextRequest, NextResponse } from 'next/server';
import { and, eq, lt } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { toDateString, todayUTC } from '@/lib/utils/date-utils';
import { rebuildPlan } from '@/lib/plan-rebuild';

export const maxDuration = 60;

// Called when the Today or plan page opens. If an earlier day still has
// required sessions nobody did, those are treated as missed: the plan is
// rebuilt from today (the missed ones become "skipped" history, and any topic
// still due comes back at the front of the schedule). Does nothing otherwise.
export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: { planId: string } }) => {
    const userId = getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    // The plan with its owner, and the check for missed sessions, in ONE round
    // (it was three queries in a row, on every Plan and Today page load). The
    // missed check only reveals a yes/no and is ignored unless the plan is
    // this parent's.
    const today = todayUTC();
    const [foundRows, missedRows] = await Promise.all([
      db
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
        .limit(1),
      db
        .select({ id: schema.studySessions.id })
        .from(schema.studySessions)
        .where(
          and(
            eq(schema.studySessions.planId, params.planId),
            eq(schema.studySessions.status, 'planned'),
            eq(schema.studySessions.isFiller, false),
            lt(schema.studySessions.scheduledDate, toDateString(today)),
          ),
        )
        .limit(1),
    ]);
    const found = foundRows[0];
    if (!found)
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    const { plan, student } = found;
    const missed = missedRows[0];
    if (!missed) return NextResponse.json({ updated: false });

    const result = await rebuildPlan({ plan, student, fromDate: today });
    return NextResponse.json({ updated: result.ok });
  },
);
