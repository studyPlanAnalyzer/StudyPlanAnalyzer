import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import {
  addDays,
  appDay,
  fromDateString,
  toDateString,
  todayKey,
  weekNumberFromStart,
} from '@/lib/utils/date-utils';
import { withErrorHandling } from '@/lib/api/handler';
import { isExamOver } from '@/lib/plan-expiry';
import { paymentRequiredResponse } from '@/lib/billing/guard';
import { loadStrugglingTopicIds } from '@/lib/topic-struggling';
import { loadStudyDays } from '@/lib/study-history';
import { loadPlanStatus } from '@/lib/plan-status';
import { hasEarlierTopics } from '@/lib/plan-schedule';
import { isRevisionDay } from '@/lib/utils/revision-days';
import { BUFFER_WEEK_DAYS } from '@/lib/utils/study-limits';
import { daysOf, weekContaining } from '@/lib/reports/week';

/** "Coming up" on the plan page: the days after today it covers. */
const COMING_UP_DAYS = 7;

export const GET = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ planId: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
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
        // Each day in the plan's own order: the goal is the top of the list.
        .orderBy(asc(schema.studySessions.scheduledDate), asc(schema.studySessions.position)),
      db
        .select()
        .from(schema.subjects)
        .where(inArray(schema.subjects.studentId, owner)),
      db
        .select({
          topic: schema.topics,
          spacedStatus: schema.topicSpacedState.status,
        })
        .from(schema.topics)
        .innerJoin(
          schema.subjects,
          eq(schema.subjects.id, schema.topics.subjectId),
        )
        .leftJoin(
          schema.topicSpacedState,
          eq(schema.topicSpacedState.topicId, schema.topics.id),
        )
        .where(inArray(schema.subjects.studentId, owner)),
    ]);
    const found = planRows[0];
    if (!found)
      return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
    const { plan, student, exam } = found;
    const denied = paymentRequiredResponse(student);
    if (denied) return denied;

    // The exam is over: the plan is reported as gone. (A GET never changes
    // anything; the row is simply never shown again.)
    if (exam && isExamOver(exam.examDate)) {
      return NextResponse.json(
        { error: 'This plan has ended with its exam' },
        { status: 404 },
      );
    }

    // Optional (filler) sessions are no longer made; any left from older
    // plans aren't part of the list.
    const rows = sessionRows.filter((s) => !s.isFiller);
    const topicById = new Map(topicRows.map((r) => [r.topic.id, r.topic]));
    // The topic's mastery as it is now (not when a past session was done).
    const masteredTopicIds = new Set(
      topicRows.filter((r) => r.spacedStatus === 'mastered').map((r) => r.topic.id),
    );
    const today = todayKey();
    const week = weekContaining(today);
    const [strugglingTopicIds, pastDays, status, earlier, revisedRows] = await Promise.all([
      loadStrugglingTopicIds(
        Array.from(new Set(rows.flatMap((s) => (s.topicId ? [s.topicId] : [])))),
      ),
      // This week's days so far.
      loadStudyDays(student.id, today, 7),
      exam
        ? loadPlanStatus({
            studentId: student.id,
            sundayRevision: student.sundayRevision,
            plan,
            examDate: exam.examDate,
            todayKey: today,
          })
        : null,
      hasEarlierTopics(student.id, plan.examId),
      // Earlier-exam topics revised on each day of this week.
      db
        .select({ day: schema.topicRevisions.revisedOn, n: sql<number>`count(*)` })
        .from(schema.topicRevisions)
        .where(
          and(
            eq(schema.topicRevisions.examId, plan.examId),
            gte(schema.topicRevisions.revisedOn, week.start),
            lte(schema.topicRevisions.revisedOn, week.end),
          ),
        )
        .groupBy(schema.topicRevisions.revisedOn),
    ]);
    // Today: everything on the list, and how much of it is done.
    const todays = rows.filter((s) => s.scheduledDate === today);
    const doneToday = todays.filter(
      (s) => s.status === 'completed' || s.status === 'partly_completed',
    ).length;
    const subjectById = new Map(subjectRows.map((s) => [s.id, s]));
    const topicName = (id: string | null) => (id ? (topicById.get(id)?.name ?? null) : null);
    const subjectName = (id: string | null) => (id ? (subjectById.get(id)?.name ?? null) : null);

    // "This week", Sunday to Saturday: each day's list and how much of it was
    // done. Revision days (once there are earlier topics) count the earlier
    // topics revised instead; days ahead are just study or revision days.
    const pastByDate = new Map(pastDays.map((d) => [d.date, d]));
    const revisedOn = new Map(revisedRows.map((r) => [r.day, Number(r.n)]));
    const thisWeek = daysOf(week).map((date) => {
      const revisionDay = earlier && isRevisionDay(date, student.sundayRevision);
      const revised = revisedOn.get(date) ?? 0;
      if (date === today)
        return { date, revisionDay, when: 'today' as const, listed: todays.length, done: doneToday, revised };
      if (date > today) return { date, revisionDay, when: 'ahead' as const, listed: 0, done: 0, revised: 0 };
      const past = pastByDate.get(date);
      return { date, revisionDay, when: 'past' as const, listed: past?.listed ?? 0, done: past?.done ?? 0, revised };
    });

    // "Coming up": the topics the plan expects over the next 7 days, once
    // each, in the order they come. A forecast: ratings move them.
    const comingUpEnd = toDateString(addDays(fromDateString(today), COMING_UP_DAYS));
    const seen = new Set<string>();
    const comingUp = rows
      .filter((s) => s.scheduledDate > today && s.scheduledDate <= comingUpEnd && s.status === 'planned' && s.topicId)
      .filter((s) => !seen.has(s.topicId!) && !!seen.add(s.topicId!))
      .map((s) => ({
        topicId: s.topicId!,
        topicName: topicName(s.topicId),
        subjectName: subjectName(s.subjectId),
        sessionType: s.sessionType,
        topicMastered: masteredTopicIds.has(s.topicId!),
        topicStruggling: strugglingTopicIds.has(s.topicId!),
      }));

    const planStart =
      rows.length > 0
        ? fromDateString(rows[0].scheduledDate)
        : appDay(plan.generatedAt);

    const weeksMap = new Map<number, typeof rows>();
    for (const session of rows) {
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
              topicName: topicName(s.topicId),
              topicMastered: !!s.topicId && masteredTopicIds.has(s.topicId),
              topicStruggling: !!s.topicId && strugglingTopicIds.has(s.topicId),
              subjectName: subjectName(s.subjectId),
            })),
          }));
        return { weekNumber, days };
      });

    return NextResponse.json({
      plan,
      exam,
      student: { id: student.id, name: student.name },
      weeks,
      // Every topic is now listed, so nothing is left out. Kept, empty, for
      // pages loaded before this change.
      unscheduledTopics: [],
      today: {
        listed: todays.length,
        done: doneToday,
        revisionDay: earlier && isRevisionDay(today, student.sundayRevision),
        // The buffer week: the week before the exam is free (no list, no revision).
        bufferWeek:
          !!exam && plan.useBufferWeek &&
          today >= toDateString(addDays(fromDateString(exam.examDate), -BUFFER_WEEK_DAYS)),
      },
      thisWeek,
      comingUp,
      status,
    });
  },
);
