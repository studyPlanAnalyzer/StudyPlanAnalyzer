'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Field, Select, fieldClass } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Notice';
import { buttonClass } from '@/components/ui/Button';
import { formatDay } from '@/lib/utils/date-utils';
import {
  academicYearLabel,
  academicYearOf,
  earlierExamChoices,
  earlierTopicsOfYear,
} from '@/lib/utils/academic-year';

// The new-exam-cycle page's "Earlier topics": everything listed for this
// academic year's earlier exams (all already on the revision list), and a way
// to add topics that were missed, with the exam they were studied for.

type SelfRating = 'not_sure' | 'ok' | 'know_well';

export interface MissedTopic {
  subjectId: string;
  name: string;
  /** An earlierExamChoices key. */
  examKey: string;
  selfRating: SelfRating;
}

interface Props {
  studentId: string;
  subjects: { id: string; name: string }[];
  topics: { id: string; name: string; subjectId: string; parentTopicId: string | null; examId: string | null; examName: string | null }[];
  exams: { id: string; name: string; examDate: string }[];
  /** The new exam's date, as typed so far. */
  examDate: string;
  today: string;
  missed: MissedTopic[];
  onMissedChange: (missed: MissedTopic[]) => void;
}

const SELF_RATING_TEXT: Record<SelfRating, string> = {
  not_sure: 'Not sure',
  ok: 'OK',
  know_well: 'Know it well',
};

/** The academic year of the new exam (from its date, or the last exam's until one is typed). */
export function cycleYear(exams: Props['exams'], examDate: string, today: string) {
  const last = [...exams].sort((a, b) => b.examDate.localeCompare(a.examDate))[0] ?? null;
  const typed = /^\d{4}-\d{2}-\d{2}$/.test(examDate) ? examDate : null;
  const year = academicYearOf(typed ?? last?.examDate ?? today);
  const lastYear = last ? academicYearOf(last.examDate) : null;
  return { year, last, lastYear, newYear: lastYear !== null && year !== lastYear };
}

/** The request body for the missed topics, or an error to show. */
export function missedPayload(props: Pick<Props, 'exams' | 'examDate' | 'today' | 'missed'>) {
  const { year } = cycleYear(props.exams, props.examDate, props.today);
  const choices = earlierExamChoices(year, props.exams);
  const rows = props.missed.map((m) => ({ m, choice: choices.find((c) => c.key === m.examKey) }));
  if (rows.some((r) => !r.choice))
    return {
      error: `The exam date is now in another academic year (${academicYearLabel(year)}), so the missed earlier topics don't belong to it. Remove them or change the date.`,
    };
  return {
    earlierTopics: rows.map(({ m, choice }) => ({
      subjectId: m.subjectId,
      name: m.name,
      examId: choice!.examId,
      examName: choice!.examName,
      selfRating: m.selfRating,
    })),
  };
}

/**
 * Shown under the new exam's date when it falls in the next academic year:
 * the first exam of a new year should start a new academic session. The
 * parent can still carry on with a new exam cycle.
 */
export function NewYearWarning({ studentId, exams, examDate, today }: Pick<Props, 'studentId' | 'exams' | 'examDate' | 'today'>) {
  const { year, last, lastYear, newYear } = cycleYear(exams, examDate, today);
  if (!newYear || !last || lastYear === null) return null;
  return (
    <Notice tone="warning" className="mt-5">
      <span className="block">
        {formatDay(examDate)} is in the {academicYearLabel(year)} academic year, but {last.name} was in{' '}
        {academicYearLabel(lastYear)}. If this is the first exam of a new year, start a new academic session
        instead: it starts fresh, with the new grade and subjects. You can still continue here, and last
        year&apos;s topics then stay on the revision list.
      </span>
      <Link href={`/students/${studentId}/new-session`} className={buttonClass('white', 'md', 'mt-3')}>
        Start a new academic session
      </Link>
    </Notice>
  );
}

export function EarlierTopicsSection({ studentId, subjects, topics, exams, examDate, today, missed, onMissedChange }: Props) {
  const { year, newYear } = cycleYear(exams, examDate, today);
  const choices = earlierExamChoices(year, exams);
  const subjectIds = new Set(subjects.map((s) => s.id));
  const groups = earlierTopicsOfYear(
    year,
    topics.filter((t) => subjectIds.has(t.subjectId)),
    exams,
  );
  const nameOf = new Map(topics.map((t) => [t.id, t.name]));
  const subjectName = new Map(subjects.map((s) => [s.id, s.name]));
  const total = groups.reduce((n, g) => n + g.topics.length, 0);

  const [subjectId, setSubjectId] = useState('');
  const [name, setName] = useState('');
  const [examKey, setExamKey] = useState('');
  const [selfRating, setSelfRating] = useState<SelfRating>('not_sure');
  const [error, setError] = useState<string | null>(null);
  const chosenSubject = subjectId || subjects[0]?.id || '';
  const chosenExam = examKey && choices.some((c) => c.key === examKey) ? examKey : (choices[choices.length - 1]?.key ?? '');

  function add() {
    const topicName = name.trim();
    if (!topicName) return setError('Enter the topic.');
    if (!chosenSubject || !chosenExam) return setError('Choose the subject and the exam.');
    const taken = (n: string) => n.trim().toLowerCase() === topicName.toLowerCase();
    if (
      topics.some((t) => t.subjectId === chosenSubject && taken(t.name)) ||
      missed.some((m) => m.subjectId === chosenSubject && taken(m.name))
    )
      return setError(`${topicName} is already listed for ${subjectName.get(chosenSubject)}.`);
    onMissedChange([...missed, { subjectId: chosenSubject, name: topicName, examKey: chosenExam, selfRating }]);
    setName('');
    setError(null);
  }

  // A date in the next academic year: the warning sits under the date
  // (NewYearWarning); a new year has no earlier exams of its own yet.
  if (newYear)
    return (
      <p className="text-sm text-[#65615D]">
        Nothing from earlier exams in {academicYearLabel(year)} yet. If you continue here anyway, last year&apos;s
        topics stay on the revision list.
      </p>
    );

  return (
    <div className="flex flex-col gap-4">
      {groups.length === 0 ? (
        <p className="text-sm text-[#65615D]">Nothing listed for this year&apos;s earlier exams yet.</p>
      ) : (
        <>
          <p className="text-sm font-semibold text-[#65615D]">
            {total} topic{total === 1 ? '' : 's'} listed for {academicYearLabel(year)}, all on the revision list already.
          </p>
          {groups.map((g) => {
            const bySubject = subjects
              .map((s) => ({ s, topics: g.topics.filter((t) => t.subjectId === s.id) }))
              .filter((x) => x.topics.length > 0);
            return (
              <details key={g.key} className="rounded-[22px] bg-[#F0EFED] p-4">
                <summary className="cursor-pointer text-base font-extrabold tracking-tight">
                  {g.examName}
                  <span className="font-semibold text-[#65615D]">
                    {g.examDate ? ` · ${formatDay(g.examDate)}` : ' · before joining'} · {g.topics.length} topic
                    {g.topics.length === 1 ? '' : 's'}
                  </span>
                </summary>
                <div className="mt-3 flex flex-col gap-3">
                  {bySubject.map(({ s, topics: list }) => (
                    <div key={s.id}>
                      <p className="text-sm font-bold">{s.name}</p>
                      <p className="mt-0.5 text-sm leading-6 text-[#65615D]">
                        {list
                          .map((t) => (t.parentTopicId ? `${nameOf.get(t.parentTopicId) ?? ''} › ${t.name}` : t.name))
                          .join(', ')}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </>
      )}

      {subjects.length > 0 && choices.length > 0 && (
        <div className="rounded-[22px] bg-[#F0EFED] p-4">
          <p className="text-sm font-bold">Add a topic that was missed</p>
          <p className="mt-0.5 text-sm text-[#65615D]">
            It goes straight onto the revision list, for the exam it was studied for.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Subject">
              <Select onColour value={chosenSubject} onChange={(e) => setSubjectId(e.target.value)}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Topic">
              <input
                className={fieldClass}
                value={name}
                placeholder="e.g. Quadratic equations"
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    add();
                  }
                }}
              />
            </Field>
            <Field label="Studied for">
              <Select onColour value={chosenExam} onChange={(e) => setExamKey(e.target.value)}>
                {choices.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.examName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="How well is it known?">
              <Select onColour value={selfRating} onChange={(e) => setSelfRating(e.target.value as SelfRating)}>
                {(Object.keys(SELF_RATING_TEXT) as SelfRating[]).map((r) => (
                  <option key={r} value={r}>
                    {SELF_RATING_TEXT[r]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
          <button type="button" onClick={add} className={buttonClass('white', 'md', 'mt-3')}>
            + Add topic
          </button>

          {missed.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2">
              {missed.map((m, i) => (
                <li key={`${m.subjectId}:${m.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-white px-4 py-2">
                  <span className="min-w-0 text-sm">
                    <span className="font-semibold">{m.name}</span>
                    <span className="text-[#65615D]">
                      {' '}
                      · {subjectName.get(m.subjectId)} · {choices.find((c) => c.key === m.examKey)?.examName ?? 'another year'} ·{' '}
                      {SELF_RATING_TEXT[m.selfRating]}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onMissedChange(missed.filter((_, j) => j !== i))}
                    className={buttonClass('whiteDanger', 'sm')}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
