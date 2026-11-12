import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { pickExam } from '@/lib/exam-pick';
import { isExamOver } from '@/lib/plan-expiry';
import { loadSubjectInputs } from '@/lib/plan-inputs';
import { leafTopics } from '@/lib/topic-leaves';
import { rebuildPlan } from '@/lib/plan-rebuild';
import { scheduleEndFor } from '@/lib/plan-schedule';
import { leafPriority } from '@/lib/utils/plan-generator';
import {
  defaultSpacedState,
  intervalCapForExam,
  updateTopicSpacedState,
  type SpacedState,
} from '@/lib/utils/spaced-repetition';
import { addDays, appToday, diffInDays, fromDateString } from '@/lib/utils/date-utils';
import { isRevisionDay } from '@/lib/utils/revision-days';
import { BUFFER_WEEK_DAYS } from '@/lib/utils/study-limits';
import {
  isEarlierTopic,
  inFinalLook,
  planLastDayKey,
  revisionHeadings,
  revisionStanding,
  revisionWeakness,
  type EarlierTopic,
  type SelfRating,
  type RevisionRating,
} from '@/lib/utils/revision';

type Student = typeof schema.students.$inferSelect;

export type RevisionState =
  /** No exam to prepare for (none yet, or the last one is over). */
  | { state: 'noExam' }
  /** Nothing from earlier exams yet (the first term of the year). */
  | { state: 'noEarlierTopics'; examName: string }
  /** The buffer week: everything stops before the exam. */
  | { state: 'stopped'; examName: string; examDate: string }
  | {
      state: 'active';
      examName: string;
      examDate: string;
      /** Today is a revision day (no SM-2 sessions today). */
      revisionDayToday: boolean;
      finalLook: boolean;
      headings: ReturnType<typeof revisionHeadings>;
    };

/**
 * The revision list for a child today: every topic from an earlier exam,
 * under its heading (lib/utils/revision.ts), for the exam being prepared for.
 */
export async function loadRevision(student: Student, todayKey: string): Promise<RevisionState> {
  const [exams, plans] = await Promise.all([
    db.select().from(schema.exams).where(eq(schema.exams.studentId, student.id)),
    db
      .select()
      .from(schema.studyPlans)
      .where(eq(schema.studyPlans.studentId, student.id))
      .orderBy(desc(schema.studyPlans.generatedAt)),
  ]);
  const exam = pickExam(exams);
  if (!exam || isExamOver(exam.examDate)) return { state: 'noExam' };
  const plan = plans.find((p) => p.examId === exam.id);

  // The buffer week: the week before the exam is free, revision included.
  const bufferStart = addDays(fromDateString(exam.examDate), -BUFFER_WEEK_DAYS);
  if (plan?.useBufferWeek && diffInDays(bufferStart, fromDateString(todayKey)) <= 0)
    return { state: 'stopped', examName: exam.name, examDate: exam.examDate };

  const [topicRows, subjects, revisions] = await Promise.all([
    db
      .select({ topic: schema.topics, subjectName: schema.subjects.name, lastSeen: schema.topicSpacedState.lastSeenDate })
      .from(schema.topics)
      .innerJoin(schema.subjects, eq(schema.subjects.id, schema.topics.subjectId))
      .leftJoin(schema.topicSpacedState, eq(schema.topicSpacedState.topicId, schema.topics.id))
      .where(and(eq(schema.subjects.studentId, student.id), eq(schema.subjects.isActive, true))),
    loadSubjectInputs(student.id, exam.id),
    db
      .select()
      .from(schema.topicRevisions)
      .innerJoin(schema.topics, eq(schema.topics.id, schema.topicRevisions.topicId))
      .innerJoin(schema.subjects, eq(schema.subjects.id, schema.topics.subjectId))
      .where(eq(schema.subjects.studentId, student.id))
      .orderBy(schema.topicRevisions.revisedOn, schema.topicRevisions.createdAt),
  ]);

  const leaves = new Set(leafTopics(topicRows.map((r) => r.topic)).map((t) => t.id));
  const earlier = topicRows.filter((r) => leaves.has(r.topic.id) && isEarlierTopic(r.topic, exam.id));
  if (earlier.length === 0) return { state: 'noEarlierTopics', examName: exam.name };

  const ids = earlier.map((r) => r.topic.id);
  const sessionRatings = await db
    .select({
      topicId: schema.topicReviews.topicId,
      rating: schema.topicReviews.rating,
      on: schema.topicReviews.completedDate,
      scheduled: schema.topicReviews.scheduledDate,
      at: schema.topicReviews.createdAt,
    })
    .from(schema.topicReviews)
    .where(inArray(schema.topicReviews.topicId, ids));
  const ratingsOf = new Map<string, number[]>();
  for (const r of sessionRatings) ratingsOf.set(r.topicId, [...(ratingsOf.get(r.topicId) ?? []), r.rating]);
  // Every rating it has had, sessions and revisions, oldest first.
  const history = new Map<string, { on: string; at: number; rating: number }[]>();
  const addRating = (topicId: string, entry: { on: string; at: number; rating: number }) =>
    history.set(topicId, [...(history.get(topicId) ?? []), entry]);
  for (const r of sessionRatings) addRating(r.topicId, { on: r.on ?? r.scheduled, at: r.at.getTime(), rating: r.rating });
  for (const { topic_revisions: r } of revisions)
    addRating(r.topicId, { on: r.revisedOn, at: r.createdAt.getTime(), rating: r.rating });
  const ratingHistory = (topicId: string) =>
    (history.get(topicId) ?? [])
      .sort((a, b) => a.on.localeCompare(b.on) || a.at - b.at)
      .map((r) => r.rating);

  // Its revisions: the latest for this exam, any Again for this exam, and the
  // last time it was revised at all (oldest first, so later rows win).
  const latestThisExam = new Map<string, { rating: RevisionRating; on: string }>();
  const againThisExam = new Set<string>();
  const lastRevised = new Map<string, string>();
  for (const { topic_revisions: r } of revisions) {
    lastRevised.set(r.topicId, r.revisedOn);
    if (r.examId !== exam.id) continue;
    latestThisExam.set(r.topicId, { rating: r.rating as RevisionRating, on: r.revisedOn });
    if (r.rating === 1) againThisExam.add(r.topicId);
  }
  const inputs = new Map(subjects.flatMap((s) => s.topics.map((t) => [t.id, { s, t }] as const)));

  const topics: EarlierTopic[] = earlier.map(({ topic, subjectName, lastSeen }) => {
    const input = inputs.get(topic.id);
    const scored = input ? leafPriority(input.s, input.t) : null;
    const priority = scored?.priority ?? 0;
    const revised = lastRevised.get(topic.id) ?? null;
    const studied = [lastSeen, revised].filter((d): d is string => !!d).sort().pop() ?? null;
    const selfRating = (topic.selfRating as SelfRating | null) ?? null;
    // Low marks: real test marks (its own, or its subject's) in the plan's weak tier.
    const hasMarks = !!input && (input.t.estimatedMastery != null || input.s.marksHistory.records.length > 0);
    const { standing, reason } = revisionStanding({
      difficulty: topic.difficultyRating,
      selfRating,
      ratings: ratingHistory(topic.id),
      lowMarks: hasMarks && (scored?.weaknessPercent ?? 0) > 50,
    });
    return {
      id: topic.id,
      name: topic.name,
      subjectName,
      examName: topic.examName,
      weakness: revisionWeakness({
        priority,
        ratings: ratingsOf.get(topic.id) ?? [],
        selfRating,
      }),
      lastStudied: studied,
      latest: latestThisExam.get(topic.id) ?? null,
      backOnDailyList: againThisExam.has(topic.id),
      standing,
      standingReason: reason,
    };
  });

  const planEnd = planLastDayKey(scheduleEndFor(exam.examDate, plan?.useBufferWeek ?? false));
  const finalLook = inFinalLook(todayKey, planEnd);
  return {
    state: 'active',
    examName: exam.name,
    examDate: exam.examDate,
    revisionDayToday: isRevisionDay(todayKey, student.sundayRevision),
    finalLook,
    headings: revisionHeadings(topics, todayKey, finalLook),
  };
}

export type RecordResult = { ok: true; backOnDailyList: boolean } | { ok: false; status: number; error: string };

/**
 * Records that an earlier topic was revised today, and how it went. It is
 * marked as studied today. Again puts it back on SM-2 for the exam being
 * prepared for: it restarts (as any Again does) and its review comes the next
 * school day, so the plan is rebuilt from tomorrow.
 */
export async function recordRevision(student: Student, topicId: string, rating: RevisionRating, todayKey: string): Promise<RecordResult> {
  const [row] = await db
    .select({ topic: schema.topics, studentId: schema.subjects.studentId })
    .from(schema.topics)
    .innerJoin(schema.subjects, eq(schema.subjects.id, schema.topics.subjectId))
    .where(eq(schema.topics.id, topicId))
    .limit(1);
  if (!row || row.studentId !== student.id) return { ok: false, status: 404, error: 'Topic not found' };

  const [exams, plans] = await Promise.all([
    db.select().from(schema.exams).where(eq(schema.exams.studentId, student.id)),
    db.select().from(schema.studyPlans).where(eq(schema.studyPlans.studentId, student.id)),
  ]);
  const exam = pickExam(exams);
  if (!exam || isExamOver(exam.examDate))
    return { ok: false, status: 409, error: 'There is no exam to revise for right now.' };
  if (!isEarlierTopic(row.topic, exam.id))
    return { ok: false, status: 400, error: 'This topic is taught for this exam: it is on the daily list.' };
  const plan = plans.find((p) => p.examId === exam.id);

  return db.transaction(async (tx) => {
    await tx.insert(schema.topicRevisions).values({ topicId, examId: exam.id, rating, revisedOn: todayKey });
    const [state] = await tx
      .select()
      .from(schema.topicSpacedState)
      .where(eq(schema.topicSpacedState.topicId, topicId))
      .for('update');
    let values: Partial<typeof schema.topicSpacedState.$inferInsert> = { lastSeenDate: todayKey, updatedAt: new Date() };
    if (rating === 1) {
      const current: SpacedState = state
        ? {
            intervalDays: state.intervalDays,
            easeFactor: Number(state.easeFactor),
            repetitionCount: state.repetitionCount,
            lastReviewDate: state.lastReviewDate,
            nextReviewDate: state.nextReviewDate,
            status: state.status as SpacedState['status'],
            easyStreak: state.easyStreak,
          }
        : defaultSpacedState();
      const next = updateTopicSpacedState(current, 1, intervalCapForExam(diffInDays(fromDateString(exam.examDate), appToday())));
      values = {
        ...values,
        intervalDays: next.intervalDays,
        easeFactor: String(next.easeFactor),
        repetitionCount: next.repetitionCount,
        lastReviewDate: next.lastReviewDate,
        nextReviewDate: next.nextReviewDate,
        status: next.status,
        easyStreak: next.easyStreak,
      };
    }
    await tx
      .insert(schema.topicSpacedState)
      .values({ topicId, ...values })
      .onConflictDoUpdate({ target: schema.topicSpacedState.topicId, set: values });
    if (rating === 1 && plan) {
      const rebuilt = await rebuildPlan({ plan, student, fromDate: addDays(appToday(), 1), ex: tx });
      if (!rebuilt.ok && rebuilt.status !== 400) throw new Error(rebuilt.error);
    }
    return { ok: true as const, backOnDailyList: rating === 1 };
  });
}
