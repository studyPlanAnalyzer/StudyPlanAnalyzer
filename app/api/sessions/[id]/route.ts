import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import {
  updateTopicSpacedState,
  intervalCapForExam,
  SpacedState,
  Rating,
} from '@/lib/utils/spaced-repetition';
import {
  addDays,
  diffInDays,
  fromDateString,
  toDateString,
  appToday,
} from '@/lib/utils/date-utils';
import { rebuildPlan } from '@/lib/plan-rebuild';
import { withErrorHandling, logError } from '@/lib/api/handler';
import { paymentRequiredResponse } from '@/lib/billing/guard';

// The session, its plan and its student (checked to be this parent's) in ONE
// query; it used to be three in a row.
async function loadOwnedSession(sessionId: string, parentId: string) {
  const [row] = await db
    .select({
      session: schema.studySessions,
      plan: schema.studyPlans,
      student: schema.students,
    })
    .from(schema.studySessions)
    .innerJoin(
      schema.studyPlans,
      eq(schema.studyPlans.id, schema.studySessions.planId),
    )
    .innerJoin(
      schema.students,
      eq(schema.students.id, schema.studyPlans.studentId),
    )
    .where(
      and(
        eq(schema.studySessions.id, sessionId),
        eq(schema.students.parentId, parentId),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * The topic's next SM-2 state after a rated session, or null when the session
 * wasn't due. Only a due session advances the real ladder: the topic's
 * first-ever review (no nextReviewDate yet), or one scheduled on/after the
 * stored due date. A leveling-pass "practice" session on a topic that isn't
 * due yet is still rated and logged, but must NOT count as a genuine spaced
 * repetition, otherwise a topic can rack up 5 "repetitions" within days.
 */
function nextSpacedState(
  state: typeof schema.topicSpacedState.$inferSelect | undefined,
  scheduledDate: string,
  rating: Rating,
  examDate: string | undefined,
) {
  const currentState: SpacedState = state
    ? {
        intervalDays: state.intervalDays,
        easeFactor: Number(state.easeFactor),
        repetitionCount: state.repetitionCount,
        lastReviewDate: state.lastReviewDate,
        nextReviewDate: state.nextReviewDate,
        status: state.status as SpacedState['status'],
      }
    : {
        intervalDays: 0,
        easeFactor: 2.5,
        repetitionCount: 0,
        lastReviewDate: null,
        nextReviewDate: null,
        status: 'new',
      };
  const isDue =
    !currentState.nextReviewDate || scheduledDate >= currentState.nextReviewDate;
  if (!isDue) return null;
  // Keep review gaps proportional to the time left before the exam.
  const cap = examDate
    ? intervalCapForExam(diffInDays(fromDateString(examDate), appToday()))
    : undefined;
  return updateTopicSpacedState(currentState, rating, cap);
}

const updateSessionSchema = z.object({
  status: z.enum(['planned', 'completed', 'partly_completed', 'skipped']),
  rating: z.number().int().min(1).max(4).optional(),
});

export const PUT = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const owned = await loadOwnedSession(params.id, userId);
    if (!owned)
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const { session: existing, plan, student } = owned;
    const denied = paymentRequiredResponse(student);
    if (denied) return denied;

    const body = await req.json();
    const parsed = updateSessionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { status, rating } = parsed.data;

    const isCompletion =
      status === 'completed' || status === 'partly_completed';
    if (isCompletion && rating === undefined) {
      return NextResponse.json(
        { error: 'rating is required when completing a session' },
        { status: 400 },
      );
    }

    // A session can be done on its day or later, never ahead of it, so the
    // spaced-repetition ladder can't be advanced early.
    const today = toDateString(appToday());
    if (isCompletion && existing.scheduledDate > today) {
      return NextResponse.json(
        {
          error: `This session is planned for ${existing.scheduledDate}. It can be marked done on that day.`,
        },
        { status: 400 },
      );
    }

    // Only a rated session tied to a topic updates that topic's SM-2 state.
    const reviewTopicId =
      isCompletion && existing.topicId && rating !== undefined
        ? existing.topicId
        : null;
    const [exam] = reviewTopicId
      ? await db
          .select({ examDate: schema.exams.examDate })
          .from(schema.exams)
          .where(eq(schema.exams.id, plan.examId))
          .limit(1)
      : [];

    // The session, its review state and the review log are saved together, or
    // not at all, so a half-recorded session can't be left behind. The session
    // row and the topic's state are locked first, so a double click or a
    // second device waits for this one and then sees its result.
    const outcome = await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(schema.studySessions)
        .where(eq(schema.studySessions.id, params.id))
        .for('update');
      if (!current) return null;

      // Completing a session that is already done changes nothing: no second
      // review is logged and the ladder isn't advanced twice. And a done
      // session can't be put back to planned or skipped: its review already
      // moved the topic's schedule, which that wouldn't undo.
      const isFinished =
        current.status === 'completed' || current.status === 'partly_completed';
      if (isFinished && isCompletion)
        return { session: current, changed: false };
      if (isFinished) return { refused: true as const };

      const [saved] = await tx
        .update(schema.studySessions)
        .set({
          status,
          rating: rating ?? current.rating,
          completedAt: isCompletion ? new Date() : current.completedAt,
        })
        .where(eq(schema.studySessions.id, params.id))
        .returning();

      if (reviewTopicId && rating !== undefined) {
        const [state] = await tx
          .select()
          .from(schema.topicSpacedState)
          .where(eq(schema.topicSpacedState.topicId, reviewTopicId))
          .for('update');
        const nextState = nextSpacedState(
          state,
          current.scheduledDate,
          rating as Rating,
          exam?.examDate,
        );
        if (nextState) {
          await tx
            .insert(schema.topicSpacedState)
            .values({
              topicId: reviewTopicId,
              intervalDays: nextState.intervalDays,
              easeFactor: String(nextState.easeFactor),
              repetitionCount: nextState.repetitionCount,
              lastReviewDate: nextState.lastReviewDate,
              nextReviewDate: nextState.nextReviewDate,
              status: nextState.status,
              updatedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: schema.topicSpacedState.topicId,
              set: {
                intervalDays: nextState.intervalDays,
                easeFactor: String(nextState.easeFactor),
                repetitionCount: nextState.repetitionCount,
                lastReviewDate: nextState.lastReviewDate,
                nextReviewDate: nextState.nextReviewDate,
                status: nextState.status,
                updatedAt: new Date(),
              },
            });
        }

        await tx.insert(schema.topicReviews).values({
          topicId: reviewTopicId,
          scheduledDate: current.scheduledDate,
          completedDate: today,
          rating,
          durationMinutes: current.durationMinutes,
        });
      }
      return { session: saved, changed: true };
    });
    if (!outcome)
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    if ('refused' in outcome)
      return NextResponse.json(
        { error: "This session is already done, so it can't be changed back." },
        { status: 409 },
      );
    if (!outcome.changed)
      return NextResponse.json({ session: outcome.session, planUpdated: false });
    const updatedSession = outcome.session;

    // When the last required session of a day is dealt with (done or skipped),
    // rebuild the days ahead so they reflect the SM-2 state just updated. Doing
    // it once per day, not per session, keeps the plan from shifting mid-day.
    // Optional "free choice" sessions never hold a day open.
    let planUpdated = false;
    if (
      status !== 'planned' &&
      !existing.isFiller &&
      existing.scheduledDate <= today
    ) {
      const [stillOpen] = await db
        .select({ id: schema.studySessions.id })
        .from(schema.studySessions)
        .where(
          and(
            eq(schema.studySessions.planId, existing.planId),
            eq(schema.studySessions.scheduledDate, existing.scheduledDate),
            eq(schema.studySessions.status, 'planned'),
            eq(schema.studySessions.isFiller, false),
          ),
        )
        .limit(1);

      if (!stillOpen) {
        // The session itself is already saved, so a failed rebuild must not
        // turn this into an error for the user.
        try {
          const rebuilt = await rebuildPlan({
            plan,
            student,
            fromDate: addDays(appToday(), 1),
          });
          planUpdated = rebuilt.ok;
        } catch (err) {
          logError('Plan rebuild after day completion failed', err);
        }
      }
    }

    return NextResponse.json({ session: updatedSession, planUpdated });
  },
);
