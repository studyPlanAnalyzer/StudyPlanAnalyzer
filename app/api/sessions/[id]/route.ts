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
  todayUTC,
} from '@/lib/utils/date-utils';
import { rebuildPlan } from '@/lib/plan-rebuild';
import { withErrorHandling } from '@/lib/api/handler';

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

const updateSessionSchema = z.object({
  status: z.enum(['planned', 'completed', 'partly_completed', 'skipped']),
  rating: z.number().int().min(1).max(4).optional(),
});

export const PUT = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const owned = await loadOwnedSession(params.id, userId);
    if (!owned)
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const { session: existing, plan, student } = owned;

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

    // What the spaced-repetition update needs is read together, before any
    // write: the topic's current state and the exam date. Only when the session
    // is tied to a topic and the parent actually rated it.
    const reviewTopicId =
      isCompletion && existing.topicId && rating !== undefined
        ? existing.topicId
        : null;
    const [stateRows, examRows] = reviewTopicId
      ? await Promise.all([
          db
            .select()
            .from(schema.topicSpacedState)
            .where(eq(schema.topicSpacedState.topicId, reviewTopicId))
            .limit(1),
          db
            .select({ examDate: schema.exams.examDate })
            .from(schema.exams)
            .where(eq(schema.exams.id, plan.examId))
            .limit(1),
        ])
      : [[], []];

    // Work out the new SM-2 state (if any) before the transaction opens.
    let nextState: ReturnType<typeof updateTopicSpacedState> | null = null;
    if (reviewTopicId && rating !== undefined) {
      const state = stateRows[0];
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

      // Only advance the real SM-2 ladder when this session was actually due
      // — i.e. it's the topic's first-ever review (no nextReviewDate yet), or
      // its scheduled date is on/after the stored due date. A leveling-pass
      // "practice" session on a topic that isn't due yet still gets rated and
      // logged below, but must NOT count as a genuine spaced repetition —
      // otherwise a topic can rack up 5 "repetitions" within days (from a
      // tightly-packed forecast sequence, not real spacing).
      const isDue =
        !currentState.nextReviewDate ||
        existing.scheduledDate >= currentState.nextReviewDate;

      if (isDue) {
        // Keep review gaps proportional to the time left before the exam.
        const exam = examRows[0];
        const cap = exam
          ? intervalCapForExam(
              diffInDays(fromDateString(exam.examDate), todayUTC()),
            )
          : undefined;
        nextState = updateTopicSpacedState(currentState, rating as Rating, cap);
      }
    }

    // The session, its review state and the review log are saved together, or
    // not at all, so a half-recorded session can't be left behind.
    const updatedSession = await db.transaction(async (tx) => {
      const [saved] = await tx
        .update(schema.studySessions)
        .set({
          status,
          rating: rating ?? existing.rating,
          completedAt: isCompletion ? new Date() : existing.completedAt,
        })
        .where(eq(schema.studySessions.id, params.id))
        .returning();

      if (reviewTopicId && rating !== undefined) {
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
          scheduledDate: existing.scheduledDate,
          completedDate: toDateString(todayUTC()),
          rating,
          durationMinutes: existing.durationMinutes,
        });
      }
      return saved;
    });

    // When the last required session of a day is dealt with (done or skipped),
    // rebuild the days ahead so they reflect the SM-2 state just updated. Doing
    // it once per day, not per session, keeps the plan from shifting mid-day.
    // Optional "free choice" sessions never hold a day open.
    let planUpdated = false;
    const today = toDateString(todayUTC());
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
            fromDate: addDays(todayUTC(), 1),
          });
          planUpdated = rebuilt.ok;
        } catch (err) {
          console.error('Plan rebuild after day completion failed', err);
        }
      }
    }

    return NextResponse.json({ session: updatedSession, planUpdated });
  },
);
