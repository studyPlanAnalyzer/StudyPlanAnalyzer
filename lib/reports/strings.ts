import type {
  ActionKind,
  HeadlineKind,
  MilestoneKey,
  ReadinessStatus,
  TopicRef,
} from './types';

// ---------------------------------------------------------------------------
// Every word the weekly report shows, in one place. A stored report holds
// only facts and rule outcomes (lib/reports/types.ts); these turn them into
// sentences. To add Nepali, add an `ne` object of the same shape and return
// it from reportStrings('ne').
//
// Tone: warm and factual. Nothing here shames a parent or child, and nothing
// praises what the numbers don't show.
// ---------------------------------------------------------------------------

export type ReportLanguage = 'en' | 'ne';

const en = {
  headline: (kind: HeadlineKind, name: string): string =>
    ({
      exam_finished: `${name}'s exam has finished. The next step is setting up what comes after it.`,
      no_plan: `${name} doesn't have a study plan yet. Setting one up takes a few minutes.`,
      quiet_week: `A quiet week for ${name}. A fresh week starts now.`,
      first_week: `${name}'s first week with StudyPlan. Here's where things start.`,
      all_sessions_done: `${name} finished every topic on the list this week.`,
      consistent_week: `A consistent week: ${name} studied on most planned days.`,
      strong_challenge_week: `A strong daily challenge week for ${name}.`,
      lighter_week: `A lighter week for ${name}. Next week is a fresh start.`,
      steady_week: `A steady week of study for ${name}.`,
    })[kind],

  readiness: (s: ReadinessStatus): string =>
    ({
      on_track: 'On track so far',
      slightly_behind: 'A little behind so far',
      behind: 'Some catching up to do so far',
      too_early: 'Too early to tell',
    })[s],

  action: (
    kind: ActionKind,
    name: string,
    a: { topic?: TopicRef; subjectName?: string },
  ): string => {
    switch (kind) {
      case 'pay_to_keep_access':
        return `Renew ${name}'s access so the plan keeps going.`;
      case 'start_new_exam_cycle':
        return `Start ${name}'s next exam cycle or a new academic session.`;
      case 'create_plan':
        return `Set up ${name}'s study plan together.`;
      case 'start_together':
        return `Sit with ${name} for 10 minutes to start today's session together.`;
      case 'explain_topic_back':
        return `Ask ${name} to explain ${a.topic?.topicName ?? 'a recent topic'} back to you for 2 minutes.`;
      case 'log_test':
        return a.subjectName
          ? `Log ${name}'s latest ${a.subjectName} test result.`
          : `Log ${name}'s latest test result.`;
      case 'fix_study_time':
        return `Agree a fixed study time with ${name} for the coming week.`;
      case 'ask_what_learned':
        return a.topic
          ? `Ask ${name} what they learned about ${a.topic.topicName}.`
          : `Ask ${name} what they learned this week.`;
    }
  },

  milestone: (k: MilestoneKey): string =>
    ({
      first_report: 'First weekly report',
      study_day_streak_7: '7 study days in a row',
      first_challenge: 'First daily challenge',
      all_required_sessions_week: 'Every topic on the list in a week',
      reviews_on_time_10: '10 revisions on time',
    })[k],

  spacedRevisionExplainer:
    'Spaced revision brings each topic back just before it would be forgotten, and the gap grows as it sticks.',
  studyTimeNote:
    'The planned length of finished sessions, not a stopwatch.',
  listNote: 'Each school day lists every topic due. Topics not done come back the next day, in their place.',
  paymentDue: (name: string) => `Payment for ${name} is due soon.`,
  addedThisWeek: (name: string) =>
    `${name} joined this week, so this covers part of the week.`,
  noTestLogged: 'No test was logged this week.',

  label: {
    study: 'Study',
    studyTime: 'Study time',
    topicsDone: 'Topics done',
    topicsDue: 'Topics due',
    listed: 'Topics on the list',
    revisedEarlier: 'Earlier topics revised',
    studyDays: 'Study days',
    studyDayStreak: 'Study-day streak',
    sessions: 'Planned sessions',
    notDone: 'Not done (skipped or missed)',
    revisions: 'Revisions',
    newTopics: 'New topics learned',
    gettingStronger: 'Getting stronger',
    needsAttention: 'Needs a little more attention',
    challenge: 'Daily challenge',
    habits: 'Daily habits',
    tests: 'Tests and marks',
    exam: 'Exam',
    nextWeek: 'Next week',
    oneThing: 'One thing to do this week',
    milestones: 'New milestones',
  },

  // The full in-app report (components/reports/WeeklyReportView.tsx).
  view: {
    title: (name: string) => `${name}'s weekly report`,
    builtLaterShort: 'Built later',
    builtLaterNote:
      "This report was made after the week, when the app was next opened. It shows what happened that week; sections about how the child is doing now are left out.",
    firstReport:
      'This is the first weekly report, so these numbers are a starting point to compare against.',
    payNow: 'Pay now',
    minutesValue: (now: string, last: string | null) =>
      last === null ? now : `${now} (last week: ${last})`,
    listedValue: (done: number, listed: number) => `${done} of ${listed} done`,
    revisedValue: (count: number, hard: number) =>
      count === 0
        ? 'None this week'
        : `${count} revised` + (hard > 0 ? `, ${hard} still felt hard` : ''),
    daysValue: (studied: number, planned: number, extra: number) =>
      `${studied} of ${planned} planned days` + (extra > 0 ? `, plus ${extra} extra day${extra === 1 ? '' : 's'}` : ''),
    noPlannedDays: 'No study days were planned this week.',
    streakValue: (n: number) =>
      n === 0 ? 'Starts again with the next planned day' : `${n} planned day${n === 1 ? '' : 's'} in a row`,
    streakNote: 'Rest days are skipped, not counted.',
    sessionsValue: (finished: number, required: number) => `${finished} of ${required} finished`,
    noSessions: 'No planned sessions this week.',
    optionalNote: 'Optional (free-choice) sessions are not counted here.',
    reviewsValue: (done: number, onTime: number) =>
      done === 0 ? 'No revision sessions this week' : `${done} done, ${onTime} on time`,
    ratingsTitle: 'How sessions felt',
    ratingsNote: 'As rated after each session.',
    ratingNames: { again: 'Again', hard: 'Hard', good: 'Good', easy: 'Easy' },
    goodEasyShare: (pct: number) => `${pct}% rated Good or Easy`,
    strongerItem: (topic: string, every: number, was: number) =>
      `${topic}: now reviewed every ${every} day${every === 1 ? '' : 's'} (was every ${was})`,
    strongerFirstWeek: 'This will show next week, once there is a week to compare with.',
    attentionReason: {
      needs_practice: 'needs practice: rated Hard or Again on 2 of its last 3 sessions',
      hard_ratings: 'rated Again or Hard more than once recently',
      weak: 'test results show it still needs work',
    },
    challengeValue: (n: number, avg: number | null) =>
      n === 0 || avg === null ? 'None this week' : `${n} done, average ${avg}%`,
    bestDay: (day: string, pct: number) => `Best day: ${day} (${pct}%)`,
    lastWeekChallenge: (n: number, avg: number | null) =>
      n === 0 || avg === null ? 'Last week: none' : `Last week: ${n} done, average ${avg}%`,
    habitsValue: (done: number, total: number) =>
      total === 0 ? 'No to-dos this week' : `${done} of ${total} to-dos done`,
    habitStreak: (n: number) => `Habit streak: ${n} day${n === 1 ? '' : 's'}`,
    logTest: 'Log a test',
    testChange: (pct: number, prev: number | null) =>
      prev === null ? `${pct}% (first test logged)` : `${pct}% (previous test: ${prev}%)`,
    confidence: { low: 'felt unsure', medium: 'felt fairly sure', high: 'felt confident' },
    examUpcoming: (name: string, days: number) => `${name}: ${days} day${days === 1 ? '' : 's'} to go`,
    topicsLabel: 'Topics',
    soFarLabel: 'So far',
    topicsStudied: (n: number, total: number) => `${n} of ${total} topics studied at least once`,
    readinessRule: (finished: number, required: number) =>
      `Based on ${finished} of ${required} topics on the list done so far.`,
    examOver: (name: string) =>
      `${name} is over, so there's no plan for it any more. Start the next exam cycle, or a new academic session if the school year has changed.`,
    newExamCycle: 'Start next exam cycle',
    newSession: 'Start new academic session',
    noPlan: 'There is no study plan yet.',
    createPlan: 'Create the study plan',
    noExam: 'No exam has been added yet.',
    addExam: 'Add an exam',
    nextWeekValue: (minutes: string) => `${minutes} planned`,
    nextWeekTopics: (n: number) =>
      n === 0 ? 'Nothing due' : `${n} topic${n === 1 ? '' : 's'} coming up`,
    focusTitle: 'Focus topics',
    doIt: 'Go',
    allReports: 'All weekly reports',
    noReports: 'No weekly reports yet',
    noReportsBody:
      'The first report arrives after the first full week, on Sunday evening.',
    newBadge: 'New',
    notice: (name: string) => `New weekly report for ${name}`,
    readIt: 'Read it',
  },
};

export type ReportStrings = typeof en;

export function reportStrings(_lang: string | null | undefined): ReportStrings {
  // Only English so far; Nepali goes here.
  return en;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** 200 → "3 h 20 min", 45 → "45 min", 0 → "0 min". */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-11".."2026-10-17" → "11–17 Oct"; across months "27 Sep – 3 Oct". */
export function formatWeekRange(start: string, end: string): string {
  const [, sm, sd] = start.split('-').map(Number);
  const [, em, ed] = end.split('-').map(Number);
  return sm === em
    ? `${sd}–${ed} ${MONTHS[em - 1]}`
    : `${sd} ${MONTHS[sm - 1]} – ${ed} ${MONTHS[em - 1]}`;
}

/** "2026-10-14" → "Wed 14 Oct" (a UTC day). */
export function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return `${wd} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
