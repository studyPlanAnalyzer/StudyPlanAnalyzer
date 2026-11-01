'use client';

import { useState } from 'react';

interface TopicOption {
  id: string;
  name: string;
  parentTopicId?: string | null;
}

// Only the lowest level is offered: a sub-topic, or a topic that has none
// (a topic with sub-topics is just a heading). Selection is stored as those ids.
export function TopicScopeSelector({
  topics,
  selectedTopicIds,
  onChange,
}: {
  topics: TopicOption[];
  selectedTopicIds: string[];
  onChange: (topicIds: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(selectedTopicIds.length > 0);

  if (topics.length === 0) return null;

  const topLevel = topics.filter((t) => !t.parentTopicId);
  const subTopicsOf = (id: string) =>
    topics.filter((t) => t.parentTopicId === id);

  function toggle(id: string) {
    onChange(
      selectedTopicIds.includes(id)
        ? selectedTopicIds.filter((x) => x !== id)
        : [...selectedTopicIds, id],
    );
  }

  const parentIds = new Set(topics.map((t) => t.parentTopicId));
  const chip = (t: TopicOption) => (
    <label
      key={t.id}
      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-white px-4 text-sm font-semibold"
    >
      <input
        type="checkbox"
        checked={selectedTopicIds.includes(t.id)}
        onChange={() => toggle(t.id)}
        className="h-4 w-4 shrink-0 cursor-pointer accent-black"
      />
      {t.name}
    </label>
  );

  return (
    <div className="mt-1 w-full">
      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="min-h-11 text-left text-sm font-semibold text-black underline underline-offset-4 hover:text-black/70"
        >
          Whole subject — scope to specific topic(s) instead?
        </button>
      ) : (
        <div className="rounded-[22px] bg-[#F0EFED] p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3">
            <p className="text-sm font-semibold text-black/70">
              Scope this mark to specific topic(s) — leave unchecked for
              &quot;whole subject&quot;
            </p>
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                onChange([]);
              }}
              className="min-h-11 text-sm font-semibold text-[#65615D] underline underline-offset-4 hover:text-black"
            >
              Reset to whole subject
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {topLevel.map((t) =>
              parentIds.has(t.id) ? (
                <div key={t.id}>
                  <p className="mb-1 text-sm font-semibold text-[#65615D]">
                    {t.name}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {subTopicsOf(t.id).map(chip)}
                  </div>
                </div>
              ) : (
                <div key={t.id} className="flex flex-wrap gap-2">
                  {chip(t)}
                </div>
              ),
            )}
          </div>
          {selectedTopicIds.length > 1 && (
            <p className="mt-2 text-sm font-medium text-[#805500]">
              This one score will count for every selected topic. To record a
              different score for each topic, save them as separate marks.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
