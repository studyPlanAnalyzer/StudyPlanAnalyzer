import { leafPriority } from '@/lib/utils/plan-generator';
import { computeStreaks } from '@/lib/utils/streak';
import {
  addDays,
  diffInDays,
  fromDateString,
  toDateString,
} from '@/lib/utils/date-utils';
import {
  daysOf,
  isInWeek,
  nextWeek,
  previousWeek,
  weekStartingOn,
  type ReportWeek,
} from './week';
import * as T from './thresholds';
import {
  SNAPSHOT_VERSION,
  type ActionKind,
  type HeadlineKind,
  type MarkRow,
  type MilestoneKey,
  type ReadinessStatus,
  type ReportInput,
  type SessionRow,
  type TestChange,
  type TopicRef,
  type WeeklyReportSnapshot,
} from './types';

// ---------------------------------------------------------------------------
// The weekly progress report for one child, computed from rows that are
// already loaded. Pure: no database, no clock (every date comes from the
// input), so it can be tested with small hand-made fixtures.
//
// Rules of thumb kept throughout: a figure that can't be computed honestly is
// left out (null) rather than shown as 0 or guessed, nothing is divided by
// zero, and comparisons only appear when there was a whole previous week.
// ---------------------------------------------------------------------------

/** The UTC day of an ISO timestamp. */
const dayOf = (iso: string) => iso.slice(0, 10);

const isFinished = (s: SessionRow) =>
  s.status === 'completed' || s.status === 'partly_completed';

/** Sessions marked completed or partly completed, finished in `week`. */
function finishedIn(sessions: SessionRow[], week: ReportWeek) {
  return sessions.filter(
    (s) => isFinished(s) && s.completedAt && isInWeek(dayOf(s.completedAt), week),
  );
}

const percent = (part: number, whole: number) =>
  whole > 0 ? (part / whole) * 100 : null;

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------------------
// Study time: the PLANNED length (durationMinutes) of every session marked
// completed or partly completed whose completedAt falls in the week, optional
// sessions included. It is not a stopwatch: a partly completed session counts
// at its planned length.
// ---------------------------------------------------------------------------
function studyMinutes(sessions: SessionRow[], week: ReportWeek) {
  return sum(finishedIn(sessions, week).map((s) => s.durationMinutes));
}

// ---------------------------------------------------------------------------
// Consistency. A planned study day is a day with at least one required
// (non-optional) session scheduled. A day counts as studied when a session
// (any) was finished that day, by completedAt.
//
// The study-day streak counts consecutive PLANNED study days, ending at the
// week's last planned day, each studied. Rest days (nothing planned) are
// skipped: they neither break nor extend it. computeStreaks is reused as it
// is, by giving it only the planned days, renumbered onto consecutive dates.
// ---------------------------------------------------------------------------
function plannedStudyDays(sessions: SessionRow[]) {
  return new Set(sessions.filter((s) => !s.isFiller).map((s) => s.scheduledDate));
}

function studiedDays(sessions: SessionRow[]) {
  return new Set(
    sessions
      .filter((s) => isFinished(s) && s.completedAt)
      .map((s) => dayOf(s.completedAt!)),
  );
}

function studyDayStreak(sessions: SessionRow[], week: ReportWeek) {
  const from = toDateString(
    addDays(fromDateString(week.end), -(T.STREAK_HISTORY_DAYS - 1)),
  );
  const planned = Array.from(plannedStudyDays(sessions))
    .filter((d) => d >= from && d <= week.end)
    .sort();
  const studied = studiedDays(sessions);
  // Day i of the planned days becomes the i-th consecutive date after an
  // arbitrary base, so a rest day between two planned days isn't a gap.
  const base = fromDateString('2000-01-01');
  const fake = (i: number) => toDateString(addDays(base, i));
  const days = planned.map((d, i) => ({
    date: fake(i),
    total: 1,
    completed: studied.has(d) ? 1 : 0,
  }));
  // "Today" is one past the last planned day, so the week's last planned day
  // counts as over (computeStreaks forgives an unfinished today).
  return computeStreaks(days, fake(planned.length)).currentStreak;
}

// ---------------------------------------------------------------------------
// Ratings, from topic_reviews (every rated session writes one).
// ---------------------------------------------------------------------------
function ratingCounts(input: ReportInput, week: ReportWeek) {
  const counts = { again: 0, hard: 0, good: 0, easy: 0 };
  for (const r of input.topicReviews) {
    if (!r.completedDate || !isInWeek(r.completedDate, week)) continue;
    if (r.rating === 1) counts.again++;
    else if (r.rating === 2) counts.hard++;
    else if (r.rating === 3) counts.good++;
    else if (r.rating === 4) counts.easy++;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Topics needing attention: first, topics rated Again or Hard at least
// ATTENTION_MIN_HARD_RATINGS times in the ATTENTION_RATING_WINDOW_DAYS ending
// on the week's last day (most such ratings first); then topics the plan
// generator itself treats as weak (leafPriority weakness above
// WEAK_TOPIC_WEAKNESS_PERCENT, highest priority first). At most
// ATTENTION_MAX_TOPICS, each named once.
// ---------------------------------------------------------------------------
function needsAttention(input: ReportInput, week: ReportWeek) {
  const from = toDateString(
    addDays(fromDateString(week.end), -(T.ATTENTION_RATING_WINDOW_DAYS - 1)),
  );
  const hard = new Map<string, { ref: TopicRef; count: number }>();
  for (const r of input.topicReviews) {
    if (!r.completedDate || r.completedDate < from || r.completedDate > week.end)
      continue;
    if (r.rating > 2) continue;
    const cur = hard.get(r.topicId) ?? {
      ref: { topicName: r.topicName, subjectName: r.subjectName },
      count: 0,
    };
    cur.count++;
    hard.set(r.topicId, cur);
  }
  const out: (TopicRef & { reason: 'hard_ratings' | 'weak' })[] = [];
  const seen = new Set<string>();
  Array.from(hard.entries())
    .filter(([, v]) => v.count >= T.ATTENTION_MIN_HARD_RATINGS)
    .sort((a, b) => b[1].count - a[1].count || a[1].ref.topicName.localeCompare(b[1].ref.topicName))
    .forEach(([id, v]) => {
      seen.add(id);
      out.push({ ...v.ref, reason: 'hard_ratings' });
    });

  // Weakness is today's mastery: left out of a report built later.
  const weak = (input.builtLater ? [] : input.subjectInputs)
    .flatMap((subject) =>
      subject.topics.map((topic) => ({
        topic,
        ...leafPriority(subject, topic),
      })),
    )
    .filter(
      (w) =>
        w.weaknessPercent > T.WEAK_TOPIC_WEAKNESS_PERCENT &&
        !seen.has(w.topic.id) &&
        input.topicNames[w.topic.id],
    )
    .sort((a, b) => b.priority - a.priority);
  for (const w of weak) {
    const n = input.topicNames[w.topic.id];
    out.push({ topicName: n.name, subjectName: n.subjectName, reason: 'weak' });
  }
  return out.slice(0, T.ATTENTION_MAX_TOPICS);
}

// ---------------------------------------------------------------------------
// Getting stronger: topics whose revision gap (SM-2 interval) is longer now
// than in LAST WEEK's report. Only shown when there is a report for the week
// just before; the first report leaves it out rather than guess.
// ---------------------------------------------------------------------------
function gettingStronger(input: ReportInput, week: ReportWeek) {
  if (input.builtLater) return null;
  const prev = input.previousReport;
  if (!prev || prev.week.start !== previousWeek(week).start) return null;
  return Object.entries(input.intervalDays)
    .filter(([id, now]) => {
      const before = prev.intervalDays[id];
      return input.topicNames[id] && before !== undefined && now > before;
    })
    .sort((a, b) => b[1] - a[1])
    .slice(0, T.STRONGER_MAX_TOPICS)
    .map(([id, now]) => ({
      topicName: input.topicNames[id].name,
      subjectName: input.topicNames[id].subjectName,
      everyDays: now,
      lastWeekEveryDays: prev.intervalDays[id],
    }));
}

// ---------------------------------------------------------------------------
// Daily challenge: attempts completed in the week. A score is score /
// totalQuestions; the average is the mean of those, as a whole percent. The
// best day is the day with the highest mean score (the earliest on a tie).
// ---------------------------------------------------------------------------
function challengeFor(input: ReportInput, week: ReportWeek) {
  const attempts = input.quizAttempts.filter(
    (a) => a.totalQuestions > 0 && isInWeek(dayOf(a.completedAt), week),
  );
  const pct = (a: { score: number; totalQuestions: number }) =>
    (a.score / a.totalQuestions) * 100;
  const averagePercent =
    attempts.length > 0
      ? Math.round(sum(attempts.map(pct)) / attempts.length)
      : null;
  const byDay = new Map<string, number[]>();
  for (const a of attempts) {
    const d = dayOf(a.completedAt);
    byDay.set(d, [...(byDay.get(d) ?? []), pct(a)]);
  }
  let bestDay: { date: string; percent: number } | null = null;
  for (const [date, ps] of Array.from(byDay.entries()).sort()) {
    const p = Math.round(sum(ps) / ps.length);
    if (!bestDay || p > bestDay.percent) bestDay = { date, percent: p };
  }
  return { attempts: attempts.length, averagePercent, bestDay };
}

// ---------------------------------------------------------------------------
// Daily habits: to-dos dated in the week, and the same habit streak the
// dashboard shows (computeStreaks over to-do days), as of the week's end.
// ---------------------------------------------------------------------------
function habitsFor(input: ReportInput, week: ReportWeek, reportDate: string) {
  const inWeek = input.todos.filter((t) => isInWeek(t.todoDate, week));
  const byDate = new Map<string, { total: number; completed: number }>();
  for (const t of input.todos) {
    if (t.todoDate > week.end) continue;
    const e = byDate.get(t.todoDate) ?? { total: 0, completed: 0 };
    e.total++;
    if (t.isCompleted) e.completed++;
    byDate.set(t.todoDate, e);
  }
  const days = Array.from(byDate, ([date, v]) => ({ date, ...v }));
  return {
    completed: inWeek.filter((t) => t.isCompleted).length,
    total: inWeek.length,
    // "Today" is the day after the week, so the week's last day counts as
    // over, and nothing after the week is looked at.
    streak: computeStreaks(days, reportDate).currentStreak,
  };
}

// ---------------------------------------------------------------------------
// Tests and marks: only marks whose test date is in the week. Per subject,
// its latest whole-subject mark in the week, against that subject's
// whole-subject mark before it. Per lowest-level topic, the same for marks
// logged against the topic. Percent = obtained / full, rounded.
// ---------------------------------------------------------------------------
const markPercent = (m: MarkRow) => Math.round((m.obtainedMarks / m.fullMarks) * 100);
const markOrder = (a: MarkRow, b: MarkRow) =>
  a.assessmentDate.localeCompare(b.assessmentDate) ||
  a.createdAt.localeCompare(b.createdAt);

function latestPerKey(
  marks: MarkRow[],
  keysOf: (m: MarkRow) => string[],
  week: ReportWeek,
) {
  const sorted = marks.filter((m) => m.fullMarks > 0).sort(markOrder);
  const out = new Map<string, { mark: MarkRow; previous: MarkRow | null }>();
  const lastSeen = new Map<string, MarkRow>();
  for (const m of sorted) {
    for (const key of keysOf(m)) {
      if (isInWeek(m.assessmentDate, week))
        out.set(key, { mark: m, previous: lastSeen.get(key) ?? null });
      lastSeen.set(key, m);
    }
  }
  return out;
}

function testsFor(input: ReportInput, week: ReportWeek) {
  const toChange = (
    name: string,
    v: { mark: MarkRow; previous: MarkRow | null },
  ): TestChange => ({
    name,
    subjectName: v.mark.subjectName,
    assessmentName: v.mark.assessmentName,
    date: v.mark.assessmentDate,
    percent: markPercent(v.mark),
    previousPercent: v.previous ? markPercent(v.previous) : null,
    confidence: v.mark.confidenceLevel,
  });
  const subjects = Array.from(
    latestPerKey(
      input.marks,
      (m) => (m.topicIds.length === 0 ? [m.subjectId] : []),
      week,
    ).values(),
  ).map((v) => toChange(v.mark.subjectName, v));
  const topics = Array.from(
    latestPerKey(input.marks, (m) => m.topicIds, week).entries(),
  )
    .filter(([id]) => input.topicNames[id])
    .map(([id, v]) => toChange(input.topicNames[id].name, v));
  const byName = (a: TestChange, b: TestChange) =>
    a.subjectName.localeCompare(b.subjectName) || a.name.localeCompare(b.name);
  return {
    logged: input.marks.some((m) => isInWeek(m.assessmentDate, week)),
    subjects: subjects.sort(byName),
    topics: topics.sort(byName),
  };
}

// ---------------------------------------------------------------------------
// Exam readiness. Days left are counted from the report date (the day after
// the week). The exam is over from the start of its day (lib/plan-expiry.ts).
//
// Readiness rule: required sessions of the plan scheduled from its start to
// the week's end, and the share of them finished:
//   fewer than READINESS_MIN_SESSIONS scheduled → too early to tell
//   share ≥ READINESS_ON_TRACK_PERCENT          → on track so far
//   share ≥ READINESS_SLIGHTLY_BEHIND_PERCENT   → a little behind so far
//   otherwise                                   → some catching up to do so far
// ---------------------------------------------------------------------------
export function readinessFor(required: number, finished: number): ReadinessStatus {
  if (required < T.READINESS_MIN_SESSIONS) return 'too_early';
  const share = (finished / required) * 100;
  if (share >= T.READINESS_ON_TRACK_PERCENT) return 'on_track';
  if (share >= T.READINESS_SLIGHTLY_BEHIND_PERCENT) return 'slightly_behind';
  return 'behind';
}

function examFor(input: ReportInput, week: ReportWeek, reportDate: string) {
  const leafIds = input.subjectInputs.flatMap((s) => s.topics.map((t) => t.id));
  const everStudied = new Set(
    input.sessions
      .filter(
        (s) =>
          isFinished(s) && s.topicId && s.completedAt && dayOf(s.completedAt) <= week.end,
      )
      .map((s) => s.topicId!),
  );
  const planRequired = input.plan
    ? input.sessions.filter(
        (s) => s.planId === input.plan!.id && !s.isFiller && s.scheduledDate <= week.end,
      )
    : [];
  const toDate = {
    required: planRequired.length,
    finished: planRequired.filter(isFinished).length,
  };
  const base = {
    name: input.exam?.name ?? null,
    examDate: input.exam?.examDate ?? null,
    topicsStudied: leafIds.filter((id) => everStudied.has(id)).length,
    topicsTotal: leafIds.length,
    toDate,
  };
  if (!input.exam)
    return { ...base, state: 'none' as const, daysLeft: null, readiness: null };
  if (input.exam.examDate <= reportDate)
    return { ...base, state: 'over' as const, daysLeft: null, readiness: null };
  const daysLeft = diffInDays(
    fromDateString(input.exam.examDate),
    fromDateString(reportDate),
  );
  if (!input.plan)
    return { ...base, state: 'no_plan' as const, daysLeft, readiness: null };
  return {
    ...base,
    state: 'upcoming' as const,
    daysLeft,
    readiness: readinessFor(toDate.required, toDate.finished),
  };
}

// ---------------------------------------------------------------------------
// Next week: required sessions of the plan scheduled in the next week. Focus
// topics are only topics with such a session, ranked by the plan generator's
// own leafPriority (highest first), so the report never names a topic that
// isn't actually planned.
// ---------------------------------------------------------------------------
function nextWeekFor(input: ReportInput, week: ReportWeek) {
  if (!input.plan) return null;
  const nw = nextWeek(week);
  const planned = input.sessions.filter(
    (s) =>
      s.planId === input.plan!.id && !s.isFiller && isInWeek(s.scheduledDate, nw),
  );
  const plannedTopicIds = new Set(planned.map((s) => s.topicId).filter(Boolean));
  const focusTopics = input.subjectInputs
    .flatMap((subject) =>
      subject.topics
        .filter((t) => plannedTopicIds.has(t.id) && input.topicNames[t.id])
        .map((t) => ({ id: t.id, priority: leafPriority(subject, t).priority })),
    )
    .sort((a, b) => b.priority - a.priority)
    .slice(0, T.FOCUS_TOPICS)
    .map((t) => ({
      topicName: input.topicNames[t.id].name,
      subjectName: input.topicNames[t.id].subjectName,
    }));
  return {
    plannedMinutes: sum(planned.map((s) => s.durationMinutes)),
    focusTopics,
  };
}

// ---------------------------------------------------------------------------
// The whole report.
// ---------------------------------------------------------------------------
export function buildWeeklyReport(input: ReportInput): WeeklyReportSnapshot {
  const week = weekStartingOn(input.weekStart);
  const prev = previousWeek(week);
  const reportDate = toDateString(addDays(fromDateString(week.end), 1));
  const createdDay = dayOf(input.student.createdAt);

  const addedThisWeek = isInWeek(createdDay, week);
  // Comparisons need a whole previous week: the child existed from its start.
  const hasComparison = createdDay <= prev.start;

  // ---- study time, consistency, adherence -------------------------------
  const minutes = studyMinutes(input.sessions, week);
  const weekDays = new Set(daysOf(week));
  const planned = new Set(
    Array.from(plannedStudyDays(input.sessions)).filter((d) => weekDays.has(d)),
  );
  const studied = new Set(
    Array.from(studiedDays(input.sessions)).filter((d) => weekDays.has(d)),
  );
  const plannedDaysStudied = Array.from(planned).filter((d) => studied.has(d)).length;
  const consistency = {
    plannedDays: planned.size,
    plannedDaysStudied,
    extraDaysStudied: studied.size - plannedDaysStudied,
    studyDayStreak: studyDayStreak(input.sessions, week),
  };

  // Required sessions scheduled in the week. The week is over, so every one
  // not finished was either skipped or missed.
  const required = input.sessions.filter(
    (s) => !s.isFiller && isInWeek(s.scheduledDate, week),
  );
  const adherence = {
    required: required.length,
    finished: required.filter(isFinished).length,
    notDone: required.filter((s) => !isFinished(s)).length,
  };

  // ---- revision -----------------------------------------------------------
  // Revisions are review-type sessions only. Learn sessions are reported as
  // new topics learned. Ratings come from topic_reviews.
  const reviews = finishedIn(input.sessions, week).filter(
    (s) => s.sessionType === 'review',
  );
  const learned = new Map<string, TopicRef>();
  for (const s of finishedIn(input.sessions, week)) {
    if (s.sessionType !== 'learn' || !s.topicId || learned.has(s.topicId)) continue;
    const n = input.topicNames[s.topicId];
    const ref = n
      ? { topicName: n.name, subjectName: n.subjectName }
      : s.topicName && s.subjectName
        ? { topicName: s.topicName, subjectName: s.subjectName }
        : null;
    if (ref) learned.set(s.topicId, ref);
  }
  const attention = needsAttention(input, week);
  const revision = {
    reviewsDone: reviews.length,
    reviewsOnTime: reviews.filter((s) => dayOf(s.completedAt!) <= s.scheduledDate)
      .length,
    ratings: ratingCounts(input, week),
    newTopicsLearned: Array.from(learned.values()),
    gettingStronger: gettingStronger(input, week),
    needsAttention: attention,
  };

  // ---- challenge, habits, tests, exam, next week ----------------------------
  const thisChallenge = challengeFor(input, week);
  const lastChallenge = challengeFor(input, prev);
  const challenge = {
    ...thisChallenge,
    lastWeek: hasComparison
      ? {
          attempts: lastChallenge.attempts,
          averagePercent: lastChallenge.averagePercent,
        }
      : null,
  };
  const habits = habitsFor(input, week, reportDate);
  const tests = testsFor(input, week);
  const exam = examFor(input, week, reportDate);
  const next =
    exam.state === 'upcoming' && !input.builtLater ? nextWeekFor(input, week) : null;

  const hadActivity =
    finishedIn(input.sessions, week).length > 0 ||
    thisChallenge.attempts > 0 ||
    habits.completed > 0;

  // ---- headline: the first rule that matches ------------------------------
  const requiredPct = percent(adherence.finished, adherence.required);
  const daysPct = percent(consistency.plannedDaysStudied, consistency.plannedDays);
  const enoughSessions = adherence.required >= T.HEADLINE_MIN_REQUIRED_SESSIONS;
  const headline: HeadlineKind =
    exam.state === 'over'
      ? 'exam_finished'
      : exam.state === 'none' || exam.state === 'no_plan'
        ? 'no_plan'
        : !hadActivity
          ? 'quiet_week'
          : !hasComparison
            ? 'first_week'
            : enoughSessions && adherence.finished === adherence.required
              ? 'all_sessions_done'
              : daysPct !== null && daysPct >= T.HEADLINE_CONSISTENT_DAYS_PERCENT
                ? 'consistent_week'
                : thisChallenge.attempts >= T.HEADLINE_CHALLENGE_MIN_ATTEMPTS &&
                    (thisChallenge.averagePercent ?? 0) >=
                      T.HEADLINE_CHALLENGE_MIN_PERCENT
                  ? 'strong_challenge_week'
                  : enoughSessions &&
                      requiredPct !== null &&
                      requiredPct < T.HEADLINE_LIGHT_WEEK_PERCENT
                    ? 'lighter_week'
                    : 'steady_week';

  // ---- one thing to do: the first rule that matches -------------------------
  const action = actionFor({
    input,
    week,
    exam,
    hadActivity,
    attention,
    adherence,
    learned: revision.newTopicsLearned,
  });

  // ---- milestones: true now, and not awarded before -------------------------
  const earned: MilestoneKey[] = ['first_report'];
  if (consistency.studyDayStreak >= T.MILESTONE_STREAK_DAYS)
    earned.push('study_day_streak_7');
  if (input.firstQuizAttemptAt && isInWeek(dayOf(input.firstQuizAttemptAt), week))
    earned.push('first_challenge');
  // Needs at least HEADLINE_MIN_REQUIRED_SESSIONS so a one-session week
  // doesn't earn it.
  if (enoughSessions && adherence.finished === adherence.required)
    earned.push('all_required_sessions_week');
  if (input.onTimeReviewsAllTime >= T.MILESTONE_REVIEWS_ON_TIME)
    earned.push('reviews_on_time_10');
  const had = new Set(input.awardedMilestones);

  return {
    version: SNAPSHOT_VERSION,
    studentId: input.student.id,
    studentName: input.student.name,
    week: { start: week.start, end: week.end },
    reportDate,
    context: {
      isFirstReport: !input.hasEarlierReport,
      addedThisWeek,
      hasComparison,
      paymentDue: input.billing === 'grace',
      hadActivity,
      builtLater: input.builtLater,
    },
    headline,
    studyTime: {
      minutes,
      lastWeekMinutes: hasComparison ? studyMinutes(input.sessions, prev) : null,
    },
    consistency,
    adherence,
    revision,
    challenge,
    habits,
    tests,
    exam,
    nextWeek: next,
    action,
    milestonesUnlocked: earned.filter((k) => !had.has(k)),
    intervalDays: input.builtLater
      ? {}
      : Object.fromEntries(
          Object.entries(input.intervalDays).filter(([id]) => input.topicNames[id]),
        ),
  };
}

// ---------------------------------------------------------------------------
// One thing for the parent to do this week, by rules in this order:
//  1. billing in its grace days          → pay to keep access
//  2. the exam is over                   → start a new exam cycle
//  3. no exam or no plan                 → create a study plan
//  4. nothing happened this week         → sit down together to start
//  5. a topic rated Again/Hard repeatedly → ask the child to explain it back
//  6. no test logged for ACTION_TEST_STALE_DAYS → log the latest test (the
//     active subject whose last mark is oldest, or that has none)
//  7. fewer than READINESS_ON_TRACK_PERCENT of required sessions finished
//     (in a week with enough of them)     → agree a fixed study time
//  8. otherwise                          → ask what they learned (a topic
//     learned this week, if any)
// ---------------------------------------------------------------------------
function actionFor(a: {
  input: ReportInput;
  week: ReportWeek;
  exam: { state: string };
  hadActivity: boolean;
  attention: (TopicRef & { reason: string })[];
  adherence: { required: number; finished: number };
  learned: TopicRef[];
}): WeeklyReportSnapshot['action'] {
  const k = (kind: ActionKind, extra: Partial<WeeklyReportSnapshot['action']> = {}) => ({
    kind,
    ...extra,
  });
  if (a.input.billing === 'grace') return k('pay_to_keep_access');
  if (a.exam.state === 'over') return k('start_new_exam_cycle');
  if (a.exam.state === 'none' || a.exam.state === 'no_plan') return k('create_plan');
  if (!a.hadActivity) return k('start_together');

  const hard = a.attention.find((t) => t.reason === 'hard_ratings');
  if (hard)
    return k('explain_topic_back', {
      topic: { topicName: hard.topicName, subjectName: hard.subjectName },
    });

  const staleFrom = toDateString(
    addDays(fromDateString(a.week.end), -(T.ACTION_TEST_STALE_DAYS - 1)),
  );
  const lastTest = a.input.marks
    .map((m) => m.assessmentDate)
    .filter((d) => d <= a.week.end)
    .sort()
    .pop();
  if (!lastTest || lastTest < staleFrom) {
    const lastBySubject = new Map<string, string>();
    for (const m of a.input.marks)
      if (m.assessmentDate <= a.week.end && (lastBySubject.get(m.subjectId) ?? '') < m.assessmentDate)
        lastBySubject.set(m.subjectId, m.assessmentDate);
    const subject = [...a.input.subjectInputs].sort(
      (x, y) =>
        (lastBySubject.get(x.id) ?? '').localeCompare(lastBySubject.get(y.id) ?? ''),
    )[0];
    return k('log_test', subject ? { subjectName: subject.name } : {});
  }

  const pct = percent(a.adherence.finished, a.adherence.required);
  if (
    a.adherence.required >= T.HEADLINE_MIN_REQUIRED_SESSIONS &&
    pct !== null &&
    pct < T.READINESS_ON_TRACK_PERCENT
  )
    return k('fix_study_time');

  return k('ask_what_learned', a.learned[0] ? { topic: a.learned[0] } : {});
}
