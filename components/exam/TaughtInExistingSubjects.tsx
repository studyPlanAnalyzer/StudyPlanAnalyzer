'use client';

import { useState } from 'react';
import { AddTopicInput } from '@/components/ui/AddTopicInput';
import { Field, Select } from '@/components/ui/Field';
import { SubTopicsEditor, type SubTopicDraft } from '@/components/topics/SubTopicsEditor';

// New exam cycle: topics already taught for the new exam in subjects the
// child already has (Physics > Light), or new sub-topics under one of their
// topics (Physics > Force > Friction). New subjects have their own section.

export interface TaughtEntry {
  subjectId: string;
  /** Set for a new sub-topic under an existing topic. */
  parentTopicId: string | null;
  name: string;
  difficultyRating: number;
  /** A new topic's own sub-topics. */
  subTopics: SubTopicDraft[];
}

interface Topic {
  id: string;
  name: string;
  subjectId: string;
  parentTopicId: string | null;
}

function Difficulty({ value, onChange, label }: { value: number; onChange: (d: number) => void; label: string }) {
  return (
    <Select onColour aria-label={label} className="w-[140px]" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {[1, 2, 3, 4, 5].map((d) => (
        <option key={d} value={d}>
          Difficulty {d}
        </option>
      ))}
    </Select>
  );
}

function SubjectBlock({
  subject,
  topics,
  entries,
  onChange,
}: {
  subject: { id: string; name: string };
  topics: Topic[];
  entries: TaughtEntry[];
  onChange: (next: TaughtEntry[]) => void;
}) {
  const [mode, setMode] = useState<'topic' | 'sub' | null>(null);
  const topLevel = topics.filter((t) => !t.parentTopicId);
  const [parentId, setParentId] = useState('');
  const chosenParent = topLevel.find((t) => t.id === (parentId || topLevel[0]?.id));
  const newTopics = entries.filter((e) => !e.parentTopicId);
  const newSubs = entries.filter((e) => e.parentTopicId);
  const nameOf = (id: string) => topics.find((t) => t.id === id)?.name ?? '';
  const update = (target: TaughtEntry, patch: Partial<TaughtEntry>) =>
    onChange(entries.map((e) => (e === target ? { ...e, ...patch } : e)));
  const remove = (target: TaughtEntry) => onChange(entries.filter((e) => e !== target));
  const parentHasSubs = chosenParent && topics.some((t) => t.parentTopicId === chosenParent.id);

  return (
    <div className="rounded-[26px] bg-[#F0EFED] p-5">
      <p className="text-base font-extrabold tracking-tight sm:text-lg">{subject.name}</p>
      <p className="text-sm text-[#65615D]">
        {topLevel.length} topic{topLevel.length === 1 ? '' : 's'} so far
      </p>

      {entries.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {newTopics.map((e) => (
            <div key={`t-${e.name}`} className="rounded-2xl bg-white px-4 py-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="min-w-[6rem] flex-1 text-sm font-semibold sm:text-base">
                  {e.name} <span className="font-normal text-[#65615D]">· new topic</span>
                </span>
                {!e.subTopics.length && (
                  <Difficulty label={`Difficulty of ${e.name}`} value={e.difficultyRating} onChange={(d) => update(e, { difficultyRating: d })} />
                )}
                <button type="button" aria-label={`Remove ${e.name}`} className="flex h-11 w-11 items-center justify-center rounded-full text-lg hover:text-red-600" onClick={() => remove(e)}>
                  ×
                </button>
              </div>
              <SubTopicsEditor parentName={e.name} subTopics={e.subTopics} onChange={(subTopics) => update(e, { subTopics })} />
            </div>
          ))}
          {newSubs.map((e) => (
            <div key={`s-${e.parentTopicId}-${e.name}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl bg-white px-4 py-2">
              <span className="min-w-[6rem] flex-1 text-sm sm:text-base">
                {nameOf(e.parentTopicId!)} › <span className="font-semibold">{e.name}</span>{' '}
                <span className="text-[#65615D]">· new sub-topic</span>
              </span>
              <Difficulty label={`Difficulty of ${e.name}`} value={e.difficultyRating} onChange={(d) => update(e, { difficultyRating: d })} />
              <button type="button" aria-label={`Remove ${e.name}`} className="flex h-11 w-11 items-center justify-center rounded-full text-lg hover:text-red-600" onClick={() => remove(e)}>
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {mode === 'topic' && (
        <div className="mt-3">
          <AddTopicInput
            placeholder={`New topic in ${subject.name}`}
            existing={[...topLevel.map((t) => t.name), ...newTopics.map((e) => e.name)]}
            onAdd={(name) =>
              onChange([...entries, { subjectId: subject.id, parentTopicId: null, name, difficultyRating: 2, subTopics: [] }])
            }
          />
        </div>
      )}
      {mode === 'sub' && chosenParent && (
        <div className="mt-3 flex flex-col gap-2">
          <Field label="Under which topic?">
            <Select onColour value={chosenParent.id} onChange={(e) => setParentId(e.target.value)}>
              {topLevel.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <AddTopicInput
            placeholder={`New sub-topic under ${chosenParent.name}`}
            existing={[
              ...topics.filter((t) => t.parentTopicId === chosenParent.id).map((t) => t.name),
              ...newSubs.filter((e) => e.parentTopicId === chosenParent.id).map((e) => e.name),
            ]}
            onAdd={(name) =>
              onChange([...entries, { subjectId: subject.id, parentTopicId: chosenParent.id, name, difficultyRating: 2, subTopics: [] }])
            }
          />
          {!parentHasSubs && (
            <p className="text-sm text-[#65615D]">
              {chosenParent.name} has no sub-topics yet. It becomes their heading, and its sub-topics are what get
              studied and revised from now on.
            </p>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-4">
        <button
          type="button"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-black/75 underline-offset-4 hover:underline"
          onClick={() => setMode(mode === 'topic' ? null : 'topic')}
        >
          {mode === 'topic' ? 'Done adding topics' : '+ Add a topic'}
        </button>
        {topLevel.length > 0 && (
          <button
            type="button"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-black/75 underline-offset-4 hover:underline"
            onClick={() => setMode(mode === 'sub' ? null : 'sub')}
          >
            {mode === 'sub' ? 'Done adding sub-topics' : '+ Add a sub-topic under an existing topic'}
          </button>
        )}
      </div>
    </div>
  );
}

export function TaughtInExistingSubjects({
  subjects,
  topics,
  value,
  onChange,
}: {
  subjects: { id: string; name: string }[];
  topics: Topic[];
  value: TaughtEntry[];
  onChange: (next: TaughtEntry[]) => void;
}) {
  if (subjects.length === 0)
    return <p className="text-sm text-[#65615D]">No subjects yet. Add them below.</p>;
  return (
    <div className="flex flex-col gap-4">
      {subjects.map((s) => (
        <SubjectBlock
          key={s.id}
          subject={s}
          topics={topics.filter((t) => t.subjectId === s.id)}
          entries={value.filter((e) => e.subjectId === s.id)}
          onChange={(next) => onChange([...value.filter((e) => e.subjectId !== s.id), ...next])}
        />
      ))}
    </div>
  );
}
