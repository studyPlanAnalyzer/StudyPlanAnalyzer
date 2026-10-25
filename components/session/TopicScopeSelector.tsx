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
      className="flex cursor-pointer items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2 py-1 text-xs"
    >
      <input
        type="checkbox"
        checked={selectedTopicIds.includes(t.id)}
        onChange={() => toggle(t.id)}
        className="h-3 w-3"
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
          className="text-xs text-indigo-600 hover:text-indigo-700"
        >
          Whole subject — scope to specific topic(s) instead?
        </button>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-2">
          <div className="mb-1 flex items-center justify-between">
            <p className="text-xs font-medium text-slate-600">
              Scope this mark to specific topic(s) — leave unchecked for
              &quot;whole subject&quot;
            </p>
            <button
              type="button"
              onClick={() => {
                setExpanded(false);
                onChange([]);
              }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Reset to whole subject
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {topLevel.map((t) =>
              parentIds.has(t.id) ? (
                <div key={t.id}>
                  <p className="mb-1 text-xs font-medium text-slate-500">
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
            <p className="mt-1.5 text-xs text-amber-600">
              This one score will count for every selected topic. To record a
              different score for each topic, save them as separate marks.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
