import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { fromDateString, weekNumberFromStart } from '@/lib/utils/date-utils';
import { withErrorHandling } from '@/lib/api/handler';
import { isExamOver } from '@/lib/plan-expiry';

export const GET = withErrorHandling(
  async (req: NextRequest, { params }: { params: { planId: string } }) => {
    // The id comes from the verified token: no database round trip for auth.
    const userId = getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    // One parallel round instead of six queries in a row. The plan is joined
    // to its student (ownership) and its exam; sessions, subjects and topics
    // are keyed through the plan, so they don't have to wait for it. Nothing
    // is returned unless the ownership check on the first query passes.
    // Archived subjects are included on purpose, since sessions that were
    // already scheduled or completed can still point at them.
    const owner = db
      .select({ studentId: schema.studyPlans.studentId })
      .from(schema.studyPlans)
      .where(eq(schema.studyPlans.id, params.planId));
    const [planRows, sessionRows, subjectRows, topicRows] = await Promise.all([
      db
        .select({
          plan: schema.studyPlans,
          student: schema.students,
          exam: schema.exams,
        })
        .from(schema.studyPlans)
        .innerJoin(
          schema.students,
          eq(schema.students.id, schema.studyPlans.studentId),
        )
        .leftJoin(schema.exams, eq(schema.exams.id, schema.studyPlans.examId))
        .where(
          and(
            eq(schema.studyPlans.id, params.planId),
            eq(schema.students.parentId, userId),
          ),
        )
        .limit(1),
      db
        .select()
        .from(schema.studySessions)
        .where(eq(schema.studySessions.planId, params.planId))
        .orderBy(asc(schema.studySessions.scheduledDate)),
      db
        .select()
        .from(schema.subjects)
        .where(inArray(schema.subjects.studentId, owner)),
      db
        .select({ topic: schema.topics })
        .from(schema.topics)
        .innerJoin(
          schema.subjects,
          eq(schema.subjects.id, schema.topics.subjectId),
        )
        .where(inArray(schema.subjects.studentId, owner)),
    ]);
    const found = planRows[0];
    if (!found)
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    const { plan, student, exam } = found;

    // The exam is over: the plan is cleared, and reported as gone.
    if (exam && isExamOver(exam.examDate)) {
      await db
        .delete(schema.studyPlans)
        .where(eq(schema.studyPlans.id, plan.id));
      return NextResponse.json(
        { error: 'This plan has ended with its exam' },
        { status: 404 },
      );
    }

    const topicById = new Map(topicRows.map((r) => [r.topic.id, r.topic]));
    const subjectById = new Map(subjectRows.map((s) => [s.id, s]));

    // The exact list of topics the generator couldn't fit anywhere on the
    // calendar is stored at generation time (see generate/regenerate), not
    // recomputed here — a topic that's simply "not due yet" (its next spaced
    // review falls after the exam date) is intentionally absent from the
    // plan and must not be confused with one that genuinely ran out of room.
    const unscheduledTopics = (plan.unscheduledTopicIds ?? [])
      .map((topicId) => topicById.get(topicId))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({
        id: t.id,
        name: t.name,
        subjectName: subjectById.get(t.subjectId)?.name ?? 'Unknown subject',
      }));

    const planStart =
      sessionRows.length > 0
        ? fromDateString(sessionRows[0].scheduledDate)
        : fromDateString(plan.generatedAt.toISOString().slice(0, 10));

    const weeksMap = new Map<number, typeof sessionRows>();
    for (const session of sessionRows) {
      const week = weekNumberFromStart(
        fromDateString(session.scheduledDate),
        planStart,
      );
      if (!weeksMap.has(week)) weeksMap.set(week, []);
      weeksMap.get(week)!.push(session);
    }

    const weeks = Array.from(weeksMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([weekNumber, sessions]) => {
        const dayMap = new Map<string, typeof sessions>();
        for (const s of sessions) {
          if (!dayMap.has(s.scheduledDate)) dayMap.set(s.scheduledDate, []);
          dayMap.get(s.scheduledDate)!.push(s);
        }
        const days = Array.from(dayMap.entries())
          .sort((a, b) => (a[0] < b[0] ? -1 : 1))
          .map(([date, daySessions]) => ({
            date,
            totalMinutes: daySessions.reduce(
              (sum, s) => sum + s.durationMinutes,
              0,
            ),
            sessions: daySessions.map((s) => ({
              ...s,
              topicName: s.topicId
                ? (topicById.get(s.topicId)?.name ?? null)
                : null,
              subjectName: s.subjectId
                ? (subjectById.get(s.subjectId)?.name ?? null)
                : null,
            })),
          }));
        return { weekNumber, days };
      });

    return NextResponse.json({
      plan,
      exam,
      student: { id: student.id, name: student.name },
      weeks,
      unscheduledTopics,
    });
  },
);
