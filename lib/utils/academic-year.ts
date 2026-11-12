import { EXAM_NAMES } from '@/lib/exam-names';

/**
 * The academic year in Nepal runs with the Nepali (Bikram Sambat) year, from
 * Baisakh to Chaitra: about mid-April to mid-April. Every exam belongs to the
 * year its date falls in, worked out from the date alone, labelled like
 * "2082/83". Baisakh 1 falls on April 13 or 14; April 14 is taken as the start
 * (no exam is held over the new year).
 */
export const ACADEMIC_YEAR_STARTS = { month: 4, day: 14 } as const;

/** The Nepali year an academic year is named after (2082 for 2082/83). */
export function academicYearOf(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  const afterNewYear =
    month > ACADEMIC_YEAR_STARTS.month ||
    (month === ACADEMIC_YEAR_STARTS.month && day >= ACADEMIC_YEAR_STARTS.day);
  return year + (afterNewYear ? 57 : 56);
}

/** "2082/83". */
export function academicYearLabel(year: number): string {
  return `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
}

/** "Academic year 2082/83" for a date, or null without one. */
export function academicYearText(dateKey: string | null | undefined): string | null {
  return dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)
    ? `Academic year ${academicYearLabel(academicYearOf(dateKey))}`
    : null;
}

type ExamRow = { id: string; name: string; examDate: string };
type TaggedTopic = { examId: string | null; examName: string | null };

/**
 * The academic year a topic was taught in: its exam's. A topic studied before
 * the child joined (named after an exam but not one in the app) belongs to
 * the year the child joined in: the year of their first exam in the app.
 * Untagged topics have none.
 */
export function topicAcademicYear(topic: TaggedTopic, exams: ExamRow[]): number | null {
  if (topic.examId) {
    const exam = exams.find((e) => e.id === topic.examId);
    return exam ? academicYearOf(exam.examDate) : null;
  }
  if (!topic.examName) return null;
  const first = [...exams].sort((a, b) => a.examDate.localeCompare(b.examDate))[0];
  return first ? academicYearOf(first.examDate) : null;
}

/** One of the year's earlier exams, from the app or from before joining. */
export type EarlierExamChoice = { key: string; examId?: string; examName: string };

/**
 * The exams of an academic year a topic can be "studied for", earliest first:
 * the year's default exams from before the child joined, then the child's own
 * exams in the app that year (all of them over by the time this is asked).
 */
export function earlierExamChoices(year: number, exams: ExamRow[]): EarlierExamChoice[] {
  const inYear = exams
    .filter((e) => academicYearOf(e.examDate) === year)
    .sort((a, b) => a.examDate.localeCompare(b.examDate));
  if (inYear.length === 0) return [];
  // Joined at the first exam in the app: the year's exams before it.
  const firstAt = EXAM_NAMES.findIndex((n) => n.toLowerCase() === inYear[0].name.trim().toLowerCase());
  const used = new Set(inYear.map((e) => e.name.trim().toLowerCase()));
  const beforeJoining = (firstAt > 0 ? EXAM_NAMES.slice(0, firstAt) : []).filter((n) => !used.has(n.toLowerCase()));
  return [
    ...beforeJoining.map((n) => ({ key: `name:${n}`, examName: n })),
    ...inYear.map((e) => ({ key: `id:${e.id}`, examId: e.id, examName: e.name })),
  ];
}

export type EarlierGroup<T> = { key: string; examName: string; examDate: string | null; topics: T[] };

/**
 * Every topic listed for an academic year's exams, grouped by the exam it was
 * studied for, earliest first (before-joining exams by their place in the
 * year, then the app's exams by date). Only the topics that are studied
 * (leaves: sub-topics, or topics without any), as revision works on those.
 */
export function earlierTopicsOfYear<T extends TaggedTopic & { id: string; parentTopicId: string | null }>(
  year: number,
  topics: T[],
  exams: ExamRow[],
): EarlierGroup<T>[] {
  const parents = new Set(topics.map((t) => t.parentTopicId));
  const groups = new Map<string, EarlierGroup<T>>();
  for (const t of topics) {
    if (parents.has(t.id) || topicAcademicYear(t, exams) !== year) continue;
    const exam = t.examId ? exams.find((e) => e.id === t.examId) : undefined;
    const key = exam ? `id:${exam.id}` : `name:${t.examName}`;
    const group = groups.get(key) ?? {
      key,
      examName: exam?.name ?? t.examName ?? '',
      examDate: exam?.examDate ?? null,
      topics: [],
    };
    group.topics.push(t);
    groups.set(key, group);
  }
  const place = (g: EarlierGroup<T>) => {
    const i = EXAM_NAMES.findIndex((n) => n.toLowerCase() === g.examName.trim().toLowerCase());
    return i >= 0 ? i : EXAM_NAMES.length;
  };
  return [...groups.values()].sort((a, b) => {
    if (!a.examDate || !b.examDate) return (a.examDate ? 1 : 0) - (b.examDate ? 1 : 0) || place(a) - place(b);
    return a.examDate.localeCompare(b.examDate);
  });
}
