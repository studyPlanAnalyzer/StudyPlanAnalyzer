import { and, asc, count, desc, eq, gte, lt, lte, min } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { pickExam } from '@/lib/exam-pick';
import { loadSubjectInputs } from '@/lib/plan-inputs';
import { leafTopics } from '@/lib/topic-leaves';
import { addDays, fromDateString, toDateString } from '@/lib/utils/date-utils';
import { nextWeek, previousWeek, type ReportWeek } from './week';
import { ATTENTION_RATING_WINDOW_DAYS, STREAK_HISTORY_DAYS } from './thresholds';
import type {
  BillingForReport,
  MarkRow,
  MilestoneKey,
  ReportInput,
  SessionRow,
  WeeklyReportSnapshot,
} from './types';

// Matches no exam: loadSubjectInputs then reads only marks not tied to one.
const NO_EXAM = '00000000-0000-0000-0000-000000000000';

const day = (d: Date) => toDateString(d);

/**
 * Loads everything one child's report needs, with a FIXED number of queries
 * however many sessions, topics or marks there are, all started together.
 * The longest chain is three round trips: the exams and plans, then
 * loadSubjectInputs (the plan generator's own inputs, two rounds).
 */
export async function loadReportInput(a: {
  student: typeof schema.students.$inferSelect;
  week: ReportWeek;
  billing: BillingForReport;
  /** See ReportInput.builtLater. */
  builtLater?: boolean;
}): Promise<ReportInput> {
  const { student, week } = a;
  const id = student.id;
  const prev = previousWeek(week);
  const after = nextWeek(week);
  const weekEnd = fromDateString(week.end);
  const ratingsFrom = day(addDays(weekEnd, -(ATTENTION_RATING_WINDOW_DAYS - 1)));
  const todosFrom = day(addDays(weekEnd, -(STREAK_HISTORY_DAYS - 1)));

  const examPlanInputs = (async () => {
    const [exams, plans] = await Promise.all([
      db.select().from(schema.exams).where(eq(schema.exams.studentId, id)),
      db
        .select()
        .from(schema.studyPlans)
        .where(eq(schema.studyPlans.studentId, id))
        .orderBy(desc(schema.studyPlans.generatedAt)),
    ]);
    // The newest week works on the exam the plan screens use now. An older
    // week works on the plan that was running then: the one with the most
    // required sessions scheduled in that week (a newer exam cycle may have
    // started since).
    let plan: (typeof plans)[number] | null = null;
    let exam: (typeof exams)[number] | null = null;
    if (a.builtLater) {
      const [busiest] = await db
        .select({ planId: schema.studySessions.planId })
        .from(schema.studySessions)
        .innerJoin(schema.studyPlans, eq(schema.studyPlans.id, schema.studySessions.planId))
        .where(
          and(
            eq(schema.studyPlans.studentId, id),
            eq(schema.studySessions.isFiller, false),
            gte(schema.studySessions.scheduledDate, week.start),
            lte(schema.studySessions.scheduledDate, week.end),
          ),
        )
        .groupBy(schema.studySessions.planId)
        .orderBy(desc(count()))
        .limit(1);
      plan = busiest ? (plans.find((p) => p.id === busiest.planId) ?? null) : null;
      exam = plan ? (exams.find((e) => e.id === plan!.examId) ?? null) : null;
    }
    if (!plan) {
      exam = pickExam(exams) ?? null;
      plan = exam ? (plans.find((p) => p.examId === exam!.id) ?? null) : null;
    }
    const subjectInputs = await loadSubjectInputs(id, exam?.id ?? NO_EXAM);
    return { exam, plan, subjectInputs };
  })();

  const [
    { exam, plan, subjectInputs },
    sessionRows,
    reviewRows,
    quizRows,
    [firstQuiz],
    todoRows,
    markRows,
    topicRows,
    [earlier],
    milestoneRows,
  ] = await Promise.all([
    examPlanInputs,
    // Every session of every plan the child has, with names.
    db
      .select({
        s: schema.studySessions,
        topicName: schema.topics.name,
        subjectName: schema.subjects.name,
      })
      .from(schema.studySessions)
      .innerJoin(schema.studyPlans, eq(schema.studyPlans.id, schema.studySessions.planId))
      .leftJoin(schema.topics, eq(schema.topics.id, schema.studySessions.topicId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.studySessions.subjectId))
      .where(eq(schema.studyPlans.studentId, id)),
    // Ratings in the attention window.
    db
      .select({
        r: schema.topicReviews,
        topicName: schema.topics.name,
        subjectName: schema.subjects.name,
      })
      .from(schema.topicReviews)
      .innerJoin(schema.topics, eq(schema.topics.id, schema.topicReviews.topicId))
      .innerJoin(schema.subjects, eq(schema.subjects.id, schema.topics.subjectId))
      .where(
        and(
          eq(schema.subjects.studentId, id),
          gte(schema.topicReviews.completedDate, ratingsFrom),
          lte(schema.topicReviews.completedDate, week.end),
        ),
      ),
    // Daily challenge attempts in this week and the one before.
    db
      .select({
        completedAt: schema.quizAttempts.completedAt,
        score: schema.quizAttempts.score,
        totalQuestions: schema.quizAttempts.totalQuestions,
      })
      .from(schema.quizAttempts)
      .where(
        and(
          eq(schema.quizAttempts.studentId, id),
          gte(schema.quizAttempts.completedAt, fromDateString(prev.start)),
          lt(schema.quizAttempts.completedAt, fromDateString(after.start)),
        ),
      ),
    db
      .select({ at: min(schema.quizAttempts.completedAt) })
      .from(schema.quizAttempts)
      .where(eq(schema.quizAttempts.studentId, id)),
    db
      .select({ todoDate: schema.todos.todoDate, isCompleted: schema.todos.isCompleted })
      .from(schema.todos)
      .where(
        and(
          eq(schema.todos.studentId, id),
          gte(schema.todos.todoDate, todosFrom),
          lte(schema.todos.todoDate, week.end),
        ),
      ),
    // Every mark, with its test and the topics it is scoped to.
    db
      .select({
        m: schema.marks,
        assessmentName: schema.assessments.assessmentName,
        assessmentDate: schema.assessments.assessmentDate,
        subjectName: schema.subjects.name,
        topicId: schema.markTopics.topicId,
      })
      .from(schema.marks)
      .innerJoin(schema.assessments, eq(schema.assessments.id, schema.marks.assessmentId))
      .innerJoin(schema.subjects, eq(schema.subjects.id, schema.marks.subjectId))
      .leftJoin(schema.markTopics, eq(schema.markTopics.markId, schema.marks.id))
      .where(eq(schema.assessments.studentId, id)),
    // Topics of active subjects, with names and revision gaps.
    db
      .select({
        id: schema.topics.id,
        parentTopicId: schema.topics.parentTopicId,
        name: schema.topics.name,
        subjectName: schema.subjects.name,
        intervalDays: schema.topicSpacedState.intervalDays,
      })
      .from(schema.topics)
      .innerJoin(schema.subjects, eq(schema.subjects.id, schema.topics.subjectId))
      .leftJoin(schema.topicSpacedState, eq(schema.topicSpacedState.topicId, schema.topics.id))
      .where(and(eq(schema.subjects.studentId, id), eq(schema.subjects.isActive, true))),
    // The child's most recent earlier report.
    db
      .select({ weekStart: schema.weeklyReports.weekStart, snapshot: schema.weeklyReports.snapshot })
      .from(schema.weeklyReports)
      .where(and(eq(schema.weeklyReports.studentId, id), lt(schema.weeklyReports.weekStart, week.start)))
      .orderBy(desc(schema.weeklyReports.weekStart))
      .limit(1),
    db
      .select({ key: schema.studentMilestones.key })
      .from(schema.studentMilestones)
      .where(eq(schema.studentMilestones.studentId, id))
      .orderBy(asc(schema.studentMilestones.awardedAt)),
  ]);

  const sessions: SessionRow[] = sessionRows.map(({ s, topicName, subjectName }) => ({
    id: s.id,
    planId: s.planId,
    topicId: s.topicId,
    topicName,
    subjectName,
    scheduledDate: s.scheduledDate,
    durationMinutes: s.durationMinutes,
    sessionType: s.sessionType,
    isFiller: s.isFiller,
    status: s.status as SessionRow['status'],
    completedAt: s.completedAt ? s.completedAt.toISOString() : null,
  }));

  const marks = new Map<string, MarkRow>();
  for (const r of markRows) {
    const cur =
      marks.get(r.m.id) ??
      ({
        markId: r.m.id,
        assessmentId: r.m.assessmentId,
        assessmentName: r.assessmentName,
        assessmentDate: r.assessmentDate,
        createdAt: r.m.createdAt.toISOString(),
        subjectId: r.m.subjectId,
        subjectName: r.subjectName,
        obtainedMarks: r.m.obtainedMarks,
        fullMarks: r.m.fullMarks,
        confidenceLevel: (['low', 'medium', 'high'] as const).find((l) => l === r.m.confidenceLevel) ?? null,
        topicIds: [],
      } satisfies MarkRow);
    if (r.topicId) cur.topicIds.push(r.topicId);
    marks.set(r.m.id, cur);
  }

  const leaves = leafTopics(topicRows);
  const topicNames = Object.fromEntries(
    leaves.map((t) => [t.id, { name: t.name, subjectName: t.subjectName }]),
  );
  const intervalDays = Object.fromEntries(
    leaves.filter((t) => t.intervalDays !== null).map((t) => [t.id, t.intervalDays!]),
  );

  const isFinished = (s: SessionRow) => s.status === 'completed' || s.status === 'partly_completed';
  const onTimeReviewsAllTime = sessions.filter(
    (s) =>
      s.sessionType === 'review' &&
      isFinished(s) &&
      s.completedAt &&
      s.completedAt.slice(0, 10) <= s.scheduledDate &&
      s.completedAt.slice(0, 10) <= week.end,
  ).length;

  const previousReport: WeeklyReportSnapshot | null =
    earlier && earlier.weekStart === prev.start ? earlier.snapshot : null;

  return {
    student: { id, name: student.name, createdAt: student.createdAt.toISOString() },
    weekStart: week.start,
    billing: a.billing,
    exam: exam ? { id: exam.id, name: exam.name, examDate: exam.examDate } : null,
    plan: plan ? { id: plan.id, generatedAt: plan.generatedAt.toISOString() } : null,
    sessions,
    topicReviews: reviewRows.map(({ r, topicName, subjectName }) => ({
      topicId: r.topicId,
      topicName,
      subjectName,
      scheduledDate: r.scheduledDate,
      completedDate: r.completedDate,
      rating: r.rating,
    })),
    quizAttempts: quizRows.map((q) => ({
      completedAt: q.completedAt.toISOString(),
      score: q.score,
      totalQuestions: q.totalQuestions,
    })),
    firstQuizAttemptAt: firstQuiz?.at ? new Date(firstQuiz.at).toISOString() : null,
    todos: todoRows,
    marks: Array.from(marks.values()),
    subjectInputs,
    topicNames,
    intervalDays,
    onTimeReviewsAllTime,
    previousReport,
    hasEarlierReport: !!earlier,
    awardedMilestones: milestoneRows.map((m) => m.key as MilestoneKey),
    builtLater: a.builtLater ?? false,
  };
}
