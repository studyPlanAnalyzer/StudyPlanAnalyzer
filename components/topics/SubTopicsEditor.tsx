'use client';

import { useState } from 'react';
import { AddTopicInput } from '@/components/ui/AddTopicInput';
import { Select } from '@/components/ui/Field';

export interface SubTopicDraft {
  name: string;
  difficultyRating: number;
}

/**
 * Sub-topics of a topic taught for this exam, while setting a child up (or
 * starting a session or a new subject): each with its difficulty, plus an
 * "Add a sub-topic" field. With sub-topics, those are what gets studied, as
 * on the Subjects page.
 */
export function SubTopicsEditor({
  parentName,
  subTopics,
  onChange,
  onColour = false,
}: {
  parentName: string;
  subTopics: SubTopicDraft[];
  onChange: (next: SubTopicDraft[]) => void;
  onColour?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <div className="mt-1 flex flex-col gap-2 border-l-[1.5px] border-black/20 pl-3.5">
      {subTopics.map((s, k) => (
        <div key={s.name} className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-[6rem] flex-1 text-sm text-black">↳ {s.name}</span>
          <Select
            onColour={onColour}
            aria-label={`Difficulty of ${s.name}`}
            className="w-[140px]"
            value={s.difficultyRating}
            onChange={(e) =>
              onChange(subTopics.map((x, j) => (j === k ? { ...x, difficultyRating: Number(e.target.value) } : x)))
            }
          >
            {[1, 2, 3, 4, 5].map((d) => (
              <option key={d} value={d}>
                Difficulty {d}
              </option>
            ))}
          </Select>
          <button
            type="button"
            aria-label={`Remove ${s.name}`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-lg text-black hover:text-red-600"
            onClick={() => onChange(subTopics.filter((_, j) => j !== k))}
          >
            ×
          </button>
        </div>
      ))}
      {adding ? (
        <div>
          <AddTopicInput
            placeholder={`Sub-topic of ${parentName}`}
            existing={subTopics.map((s) => s.name)}
            onAdd={(name) => onChange([...subTopics, { name, difficultyRating: 2 }])}
          />
          <button
            type="button"
            className="mt-1 min-h-11 text-sm font-semibold text-black/70 underline-offset-4 hover:underline"
            onClick={() => setAdding(false)}
          >
            Done adding sub-topics
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="inline-flex min-h-11 w-fit items-center text-sm font-semibold text-black/75 underline-offset-4 hover:underline"
          onClick={() => setAdding(true)}
        >
          + Add a sub-topic
        </button>
      )}
    </div>
  );
}
