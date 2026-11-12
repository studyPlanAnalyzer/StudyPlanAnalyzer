import { addDays, diffInDays, fromDateString, toDateString } from '@/lib/utils/date-utils';
import { FINAL_LOOK_DAYS } from '@/lib/utils/plan-generator';

/**
 * Revising topics from earlier exams.
 *
 * Topics taught for the exam being prepared for follow SM-2 on school days.
 * Every topic from an earlier exam is listed here instead, for revision days
 * (Saturday, and Sunday unless the school is open). It isn't SM-2: the child
 * chooses what to study, and the list is grouped and ordered so the topics
 * that most need it are on top. Each revision is rated, and the rating
 * decides where the topic is listed next:
 *   Again -> back on the daily SM-2 list for this exam, from the next day
 *   Hard  -> "Rated hard": first in line next time
 *   Good  -> "Revised for this exam", with the date
 *   Easy  -> "What you found easy", with the date
 * Good and Easy topics come back under "Time for another look" after
 * ANOTHER_LOOK_AFTER_DAYS. A topic not yet revised for this exam is listed by
 * how it has gone so far (revisionStanding): "Needs it most", "Not yet
 * revised", or "Known well, not revised yet". In the last FINAL_LOOK_DAYS before the plan stops,
 * every topic is listed together, the one studied longest ago first, so each
 * gets a final look. Each new exam starts the round again.
 */

export type RevisionRating = 1 | 2 | 3 | 4;

/**
 * Whether a topic is from an earlier exam than `currentExamId`. A topic with
 * no exam tag at all (neither an exam nor an exam name) counts as the current
 * exam's, so a topic is never dropped from the daily list just for missing
 * its tag. Earlier topics always name their exam.
 */
export function isEarlierTopic(
  topic: { examId: string | null; examName: string | null },
  currentExamId: string,
): boolean {
  if (topic.examId === null && topic.examName === null) return false;
  return topic.examId !== currentExamId;
}

/** A Good or Easy topic is suggested again after this many days. */
export const ANOTHER_LOOK_AFTER_DAYS = 28;

export type RevisionHeading =
  | 'final'
  | 'hard'
  | 'needs'
  | 'anotherLook'
  | 'notYet'
  | 'known'
  | 'revised'
  | 'easy'
  | 'back';

/** The order the headings are shown in. */
export const HEADING_ORDER: RevisionHeading[] = [
  'final',
  'hard',
  'needs',
  'anotherLook',
  'notYet',
  'known',
  'revised',
  'easy',
  'back',
];

export type SelfRating = 'not_sure' | 'ok' | 'know_well';

/**
 * How a topic not yet revised for this exam has gone so far, to list it
 * under "Needs it most" or "Known well, not revised yet" (null: neither), with
 * the reason shown beside it.
 *
 * Needs it most, the first that applies: its latest rating was Hard or Again;
 * the parent marked it Not sure; its test marks are low; it is difficulty 4
 * or 5 (unless the parent marked it Know it well).
 * Known well: the parent marked it Know it well, or every rating so far was
 * Easy.
 * The parent's mark (from adding an earlier topic) counts only until the
 * child has rated the topic: after that, its ratings speak for it.
 */
export function revisionStanding(args: {
  difficulty: number;
  selfRating: SelfRating | null;
  /** Every rating so far, sessions and revisions, oldest first (1 Again .. 4 Easy). */
  ratings: number[];
  /** Its test marks put it in the plan's weak tier (below 50%). */
  lowMarks: boolean;
}): { standing: 'needs' | 'known' | null; reason: string | null } {
  const { difficulty, ratings, lowMarks } = args;
  const self = ratings.length ? null : args.selfRating;
  const latest = ratings[ratings.length - 1];
  if (latest !== undefined && latest <= 2) return { standing: 'needs', reason: 'Rated hard last time' };
  if (self === 'not_sure') return { standing: 'needs', reason: 'Marked not sure' };
  if (lowMarks) return { standing: 'needs', reason: 'Low test marks' };
  if (difficulty >= 4 && self !== 'know_well') return { standing: 'needs', reason: `Difficulty ${difficulty}` };
  if (self === 'know_well') return { standing: 'known', reason: 'Marked know it well' };
  if (ratings.length && ratings.every((r) => r === 4)) return { standing: 'known', reason: 'Always easy so far' };
  return { standing: null, reason: null };
}

export interface EarlierTopic {
  id: string;
  name: string;
  subjectName: string;
  /** The exam it was taught for. */
  examName: string | null;
  /** Higher = needs it more (ratings, test marks, difficulty, the joiner's own sense). */
  weakness: number;
  /** The last day it was studied at all (a session or a revision), or null. */
  lastStudied: string | null;
  /** Its latest revision for the exam being prepared for, if any. */
  latest: { rating: RevisionRating; on: string } | null;
  /** Rated Again on a revision for this exam: it is on the daily SM-2 list now. */
  backOnDailyList: boolean;
  /** How it has gone so far (revisionStanding), for when it isn't revised for this exam yet. */
  standing: 'needs' | 'known' | null;
  /** Why it is under "Needs it most" or "Known well", shown beside it. */
  standingReason: string | null;
}

/**
 * Whether today is in the final look: the last FINAL_LOOK_DAYS before the
 * plan stops (the day before the exam, or the start of the buffer week).
 */
export function inFinalLook(todayKey: string, planEndKey: string): boolean {
  const daysLeft = diffInDays(fromDateString(planEndKey), fromDateString(todayKey));
  return daysLeft >= 0 && daysLeft < FINAL_LOOK_DAYS;
}

/** The plan's last day: the day before `planStop` (the exam or the buffer week's start). */
export function planLastDayKey(planStop: Date): string {
  return toDateString(addDays(planStop, -1));
}

const byWeakness = (a: EarlierTopic, b: EarlierTopic) =>
  b.weakness - a.weakness || a.name.localeCompare(b.name);
const byLatestOldest = (a: EarlierTopic, b: EarlierTopic) =>
  (a.latest?.on ?? '').localeCompare(b.latest?.on ?? '') || byWeakness(a, b);
const byStudiedOldest = (a: EarlierTopic, b: EarlierTopic) =>
  (a.lastStudied ?? '').localeCompare(b.lastStudied ?? '') || byWeakness(a, b);

/** Every earlier topic under its heading, in order. Empty headings are left out. */
export function revisionHeadings(
  topics: EarlierTopic[],
  todayKey: string,
  finalLook: boolean,
): { heading: RevisionHeading; topics: EarlierTopic[] }[] {
  const groups = new Map<RevisionHeading, EarlierTopic[]>(HEADING_ORDER.map((h) => [h, []]));
  const ageOf = (t: EarlierTopic) =>
    t.latest ? diffInDays(fromDateString(todayKey), fromDateString(t.latest.on)) : Infinity;
  for (const t of topics) {
    let heading: RevisionHeading;
    if (t.backOnDailyList) heading = 'back';
    else if (finalLook) heading = 'final';
    else if (!t.latest) heading = t.standing ?? 'notYet';
    else if (t.latest.rating <= 2) heading = 'hard';
    else if (ageOf(t) >= ANOTHER_LOOK_AFTER_DAYS) heading = 'anotherLook';
    else heading = t.latest.rating === 4 ? 'easy' : 'revised';
    groups.get(heading)!.push(t);
  }
  const sorters: Record<RevisionHeading, (a: EarlierTopic, b: EarlierTopic) => number> = {
    final: byStudiedOldest,
    hard: byWeakness,
    needs: byWeakness,
    anotherLook: byLatestOldest,
    notYet: byWeakness,
    known: byWeakness,
    revised: byLatestOldest,
    easy: byLatestOldest,
    back: (a, b) => a.name.localeCompare(b.name),
  };
  return HEADING_ORDER.flatMap((heading) => {
    const list = groups.get(heading)!;
    return list.length ? [{ heading, topics: [...list].sort(sorters[heading]) }] : [];
  });
}

/**
 * How much an earlier topic needs revising, for ordering only: its weakness
 * from test marks and difficulty (the plan's own leafPriority), more for each
 * Hard or Again it got in its sessions, and the joiner's own sense of it.
 */
export function revisionWeakness(args: {
  priority: number;
  /** Its session ratings, any order (1 Again .. 4 Easy). */
  ratings: number[];
  selfRating: SelfRating | null;
}): number {
  const hardShare = args.ratings.length
    ? args.ratings.filter((r) => r <= 2).length / args.ratings.length
    : 0;
  const self = args.selfRating === 'not_sure' ? 15 : args.selfRating === 'know_well' ? -15 : 0;
  return args.priority + 30 * hardShare + self;
}

/** "3 days ago", "2 weeks ago": how long ago `dayKey` was. */
export function agoText(dayKey: string, todayKey: string): string {
  const days = diffInDays(fromDateString(todayKey), fromDateString(dayKey));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 14) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks} weeks ago`;
}
