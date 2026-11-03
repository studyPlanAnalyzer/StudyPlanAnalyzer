import { and, eq, gte, inArray, sql } from 'drizzle-orm';
import { schema } from '@/lib/db';
import { addDays, toDateString, appToday } from '@/lib/utils/date-utils';
import { adjustForTestTrend } from '@/lib/utils/spaced-repetition';
import { blendedPercent } from '@/lib/utils/scoring';
import type { Executor } from '@/lib/utils/topic-mastery';

/**
 * After topic-scoped test marks are saved, compares each with the blend of that
 * topic's earlier topic tests (the same blend that drives topic mastery) and
 * feeds the change, not an absolute score, into the topic's SM-2 state: ease
 * factor up or down, and a ladder restart on a big drop. A topic's first test
 * has nothing to compare with, and only the newest test counts. A good result
 * never moves a review date.
 *
 * Everything is done in a fixed number of queries however many marks and topics
 * there are: one read of the history, one of the SM-2 states, one update, one
 * insert. What was done is recorded in topic_test_effects so revertTestEffects
 * can undo it when a mark is edited or deleted.
 */
export async function applyTestTrends(
  ex: Executor,
  items: { markId: string; topicIds: string[] }[],
  /** Judge each mark against the tests before it only, as if it were the
   * newest (used to replay a topic's tests in date order). */
  opts: { asOfMark?: boolean } = {},
) {
  const topicIds = Array.from(new Set(items.flatMap((i) => i.topicIds)));
  if (topicIds.length === 0) return;

  const [rows, states, parents] = await Promise.all([
    ex
      .select({
        topicId: schema.markTopics.topicId,
        markId: schema.marks.id,
        obtainedMarks: schema.marks.obtainedMarks,
        fullMarks: schema.marks.fullMarks,
        assessmentDate: schema.assessments.assessmentDate,
        createdAt: schema.marks.createdAt,
      })
      .from(schema.markTopics)
      .innerJoin(schema.marks, eq(schema.marks.id, schema.markTopics.markId))
      .innerJoin(
        schema.assessments,
        eq(schema.assessments.id, schema.marks.assessmentId),
      )
      .where(inArray(schema.markTopics.topicId, topicIds)),
    ex
      .select()
      .from(schema.topicSpacedState)
      .where(inArray(schema.topicSpacedState.topicId, topicIds)),
    // Topics with sub-topics aren't judged themselves (their sub-topics are),
    // so they never take a trend adjustment.
    ex
      .select({ id: schema.topics.parentTopicId })
      .from(schema.topics)
      .where(inArray(schema.topics.parentTopicId, topicIds)),
  ]);
  const hasSubTopics = new Set(parents.map((p) => p.id));

  const historyOf = new Map<string, typeof rows>();
  for (const r of rows) {
    const list = historyOf.get(r.topicId);
    if (list) list.push(r);
    else historyOf.set(r.topicId, [r]);
  }
  for (const list of Array.from(historyOf.values()))
    list.sort(
      (a, b) =>
        a.assessmentDate.localeCompare(b.assessmentDate) ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );
  const stateOf = new Map(states.map((st) => [st.topicId, { ...st }]));

  const restartDate = toDateString(addDays(appToday(), 1));
  const updates = new Map<string, { ease: number; reset: boolean }>();
  const effects: (typeof schema.topicTestEffects.$inferInsert)[] = [];

  for (const { markId, topicIds: ids } of items) {
    for (const topicId of ids) {
      if (hasSubTopics.has(topicId)) continue;
      const full = historyOf.get(topicId) ?? [];
      const history = opts.asOfMark
        ? full.slice(0, full.findIndex((r) => r.markId === markId) + 1)
        : full;
      const last = history[history.length - 1];
      // Only a newest test, with an earlier one to compare against, counts.
      if (history.length < 2 || last.markId !== markId) continue;
      const state = stateOf.get(topicId);
      if (!state) continue;

      const pct = (r: typeof last) => (r.obtainedMarks / r.fullMarks) * 100;
      const baseline = blendedPercent(
        history.slice(0, -1).map((r) => ({
          percent: Math.round(pct(r)),
          fullMarks: r.fullMarks,
        })),
      );
      const { easeFactor, resetLadder } = adjustForTestTrend(
        Number(state.easeFactor),
        Math.round(pct(last) - baseline),
      );
      const newEase = Math.round(easeFactor * 100) / 100;
      const easeDelta =
        Math.round((newEase - Number(state.easeFactor)) * 100) / 100;
      if (easeDelta === 0 && !resetLadder) continue;

      effects.push({
        markId,
        topicId,
        easeDelta: String(easeDelta),
        restart: resetLadder
          ? {
              before: {
                repetitionCount: state.repetitionCount,
                intervalDays: state.intervalDays,
                status: state.status,
                nextReviewDate: state.nextReviewDate,
              },
              nextReviewDate: restartDate,
            }
          : null,
      });
      state.easeFactor = String(newEase);
      const prev = updates.get(topicId);
      updates.set(topicId, {
        ease: newEase,
        reset: resetLadder || !!prev?.reset,
      });
    }
  }
  if (updates.size === 0) return;

  const values = sql.join(
    Array.from(updates.entries()).map(
      ([id, u]) =>
        sql`(${id}::uuid, ${String(u.ease)}::numeric, ${u.reset}::boolean)`,
    ),
    sql`, `,
  );
  await ex.execute(sql`
    UPDATE topic_spaced_state AS s SET
      ease_factor = v.ease,
      updated_at = now(),
      repetition_count = CASE WHEN v.reset THEN 0 ELSE s.repetition_count END,
      interval_days = CASE WHEN v.reset THEN 1 ELSE s.interval_days END,
      status = CASE WHEN v.reset THEN 'learning' ELSE s.status END,
      next_review_date = CASE WHEN v.reset THEN ${restartDate}::date ELSE s.next_review_date END
    FROM (VALUES ${values}) AS v(id, ease, reset)
    WHERE s.topic_id = v.id
  `);
  await ex.insert(schema.topicTestEffects).values(effects);
}

/**
 * Redoes the trend effects on `topicIds` of every topic-scoped mark dated
 * `fromDate` or later: they are undone, then applied again in date order,
 * each compared only with the tests before it, exactly as if the tests had
 * been logged in that order. Used when a test's date changes, which changes
 * which test came after which; without it an earlier "newest" test keeps an
 * effect it no longer deserves.
 */
export async function replayTestTrends(
  ex: Executor,
  topicIds: string[],
  fromDate: string,
) {
  const unique = Array.from(new Set(topicIds));
  if (unique.length === 0) return;

  const rows = await ex
    .select({
      markId: schema.marks.id,
      assessmentDate: schema.assessments.assessmentDate,
      createdAt: schema.marks.createdAt,
    })
    .from(schema.markTopics)
    .innerJoin(schema.marks, eq(schema.marks.id, schema.markTopics.markId))
    .innerJoin(
      schema.assessments,
      eq(schema.assessments.id, schema.marks.assessmentId),
    )
    .where(
      and(
        inArray(schema.markTopics.topicId, unique),
        gte(schema.assessments.assessmentDate, fromDate),
      ),
    );
  const marks = Array.from(new Map(rows.map((r) => [r.markId, r])).values()).sort(
    (a, b) =>
      a.assessmentDate.localeCompare(b.assessmentDate) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
  if (marks.length === 0) return;

  // Every topic each of those marks covers: undoing a mark undoes all of it.
  const links = await ex
    .select({
      markId: schema.markTopics.markId,
      topicId: schema.markTopics.topicId,
    })
    .from(schema.markTopics)
    .where(
      inArray(
        schema.markTopics.markId,
        marks.map((m) => m.markId),
      ),
    );

  await revertTestEffects(
    ex,
    marks.map((m) => m.markId),
  );
  for (const m of marks)
    await applyTestTrends(
      ex,
      [
        {
          markId: m.markId,
          topicIds: links.filter((l) => l.markId === m.markId).map((l) => l.topicId),
        },
      ],
      { asOfMark: true },
    );
}

/** One mark's trend adjustment; see applyTestTrends. */
export async function applyTestTrend(
  ex: Executor,
  topicIds: string[],
  markId: string,
) {
  await applyTestTrends(ex, [{ markId, topicIds }]);
}

/**
 * Undoes what marks did to their topics' SM-2 state. The ease change is taken
 * back; a ladder restart is only undone if the topic hasn't been reviewed
 * since (otherwise its newer progress is kept). Call before editing a mark's
 * score or topics, or before deleting it. Takes one mark id or several, and
 * uses a fixed number of queries either way.
 */
export async function revertTestEffects(
  ex: Executor,
  markIds: string | string[],
  /** Only undo what the marks did to these topics (default: every topic). */
  onlyTopicIds?: string[],
) {
  const ids = Array.isArray(markIds) ? markIds : [markIds];
  if (ids.length === 0 || onlyTopicIds?.length === 0) return;
  const which = and(
    inArray(schema.topicTestEffects.markId, ids),
    onlyTopicIds ? inArray(schema.topicTestEffects.topicId, onlyTopicIds) : undefined,
  );

  const effects = await ex
    .select()
    .from(schema.topicTestEffects)
    .where(which);
  if (effects.length === 0) return;

  const topicIds = Array.from(new Set(effects.map((e) => e.topicId)));
  const states = await ex
    .select()
    .from(schema.topicSpacedState)
    .where(inArray(schema.topicSpacedState.topicId, topicIds));
  const stateOf = new Map(states.map((st) => [st.topicId, { ...st }]));

  for (const e of effects) {
    const state = stateOf.get(e.topicId);
    if (!state) continue;
    const ease = Math.min(
      3,
      Math.max(1.3, Number(state.easeFactor) - Number(e.easeDelta)),
    );
    const untouched =
      e.restart &&
      state.repetitionCount === 0 &&
      state.intervalDays === 1 &&
      state.status === 'learning' &&
      state.nextReviewDate === e.restart.nextReviewDate;
    state.easeFactor = String(Math.round(ease * 100) / 100);
    if (untouched && e.restart) {
      state.repetitionCount = e.restart.before.repetitionCount;
      state.intervalDays = e.restart.before.intervalDays;
      state.status = e.restart.before.status;
      state.nextReviewDate = e.restart.before.nextReviewDate;
    }
  }

  const values = sql.join(
    Array.from(stateOf.values()).map(
      (st) =>
        sql`(${st.topicId}::uuid, ${st.easeFactor}::numeric, ${st.repetitionCount}::integer, ${st.intervalDays}::integer, ${st.status}::text, ${st.nextReviewDate}::date)`,
    ),
    sql`, `,
  );
  await ex.execute(sql`
    UPDATE topic_spaced_state AS s SET
      ease_factor = v.ease,
      repetition_count = v.reps,
      interval_days = v.ival,
      status = v.status,
      next_review_date = v.next,
      updated_at = now()
    FROM (VALUES ${values}) AS v(id, ease, reps, ival, status, next)
    WHERE s.topic_id = v.id
  `);

  await ex.delete(schema.topicTestEffects).where(which);
}

/**
 * Takes back every trend adjustment on these topics, whichever marks made
 * them. Used when a topic gets its first sub-topic and stops being judged
 * itself: its marks stay linked to it as history, but nothing they did to it
 * is left behind. (The same marks' effects on other topics are kept.)
 */
export async function revertTopicTrends(ex: Executor, topicIds: string[]) {
  if (topicIds.length === 0) return;
  const effects = await ex
    .select({ markId: schema.topicTestEffects.markId })
    .from(schema.topicTestEffects)
    .where(inArray(schema.topicTestEffects.topicId, topicIds));
  await revertTestEffects(
    ex,
    Array.from(new Set(effects.map((e) => e.markId))),
    topicIds,
  );
}
