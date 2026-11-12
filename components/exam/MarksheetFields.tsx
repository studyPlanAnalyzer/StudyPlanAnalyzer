import { Input } from '@/components/ui/Input';
import { Field, Select } from '@/components/ui/Field';
import { MAX_FULL_MARKS } from '@/lib/validation';

// The marksheet: one row per lowest-level item, used by "Start new exam
// cycle" and by "Add exam marks" for results that came out later.

interface Subject {
  id: string;
  name: string;
}

interface Topic {
  id: string;
  name: string;
  subjectId: string;
  parentTopicId: string | null;
}

// One row of the marksheet: the LOWEST level of the hierarchy, which is what
// analysis and plans work on. That is a sub-topic, a topic that has no
// sub-topics, or (for a subject with no topics yet) the subject itself.
export interface MarkEntry {
  key: string; // topic id, or the subject id for a subject with no topics
  subjectId: string;
  subjectName: string;
  topicId: string | null;
  groupName: string | null; // the parent topic of a sub-topic
  label: string;
  fullMarks: string; // 0 = not in this exam, nothing is saved for it
  obtainedMarks: string;
  confidenceLevel: 'low' | 'medium' | 'high';
}

export function buildMarkEntries(subjects: Subject[], topics: Topic[]): MarkEntry[] {
  const entries: MarkEntry[] = [];
  for (const s of subjects) {
    const own = topics.filter((t) => t.subjectId === s.id);
    const parentIds = new Set(own.map((t) => t.parentTopicId).filter(Boolean));
    const base = {
      subjectId: s.id,
      subjectName: s.name,
      fullMarks: '',
      obtainedMarks: '',
      confidenceLevel: 'medium' as const,
    };
    if (own.length === 0) {
      entries.push({
        ...base,
        key: s.id,
        topicId: null,
        groupName: null,
        label: s.name,
      });
      continue;
    }
    for (const top of own.filter((t) => !t.parentTopicId)) {
      if (parentIds.has(top.id)) {
        for (const sub of own.filter((t) => t.parentTopicId === top.id)) {
          entries.push({
            ...base,
            key: sub.id,
            topicId: sub.id,
            groupName: top.name,
            label: sub.name,
          });
        }
      } else {
        entries.push({
          ...base,
          key: top.id,
          topicId: top.id,
          groupName: null,
          label: top.name,
        });
      }
    }
  }
  return entries;
}

export function entryPath(m: MarkEntry): string {
  if (!m.topicId) return m.label;
  return m.groupName
    ? `${m.subjectName} › ${m.groupName} › ${m.label}`
    : `${m.subjectName} › ${m.label}`;
}

/**
 * What's wrong with the marksheet, or null. Every lowest-level item needs an
 * entry. "Out of" 0 means it isn't in this exam, so nothing is recorded for it.
 */
export function marksheetError(marks: MarkEntry[]): string | null {
  for (const m of marks) {
    const full = Number(m.fullMarks);
    if (m.fullMarks.trim() === '' || !Number.isInteger(full) || full < 0)
      return `Enter the full marks for ${entryPath(m)} (enter 0 if it isn't in this exam).`;
    if (full === 0) continue;
    if (full > MAX_FULL_MARKS)
      return `Full marks for ${entryPath(m)} can be at most ${MAX_FULL_MARKS}.`;
    const val = Number(m.obtainedMarks);
    if (
      m.obtainedMarks.trim() === '' ||
      !Number.isInteger(val) ||
      val < 0 ||
      val > full
    )
      return `Enter valid marks for ${entryPath(m)} (0–${full}).`;
  }
  return null;
}

/** One mark per lowest-level item that is in this exam, as the API takes them. */
export function marksheetPayload(marks: MarkEntry[]) {
  return marks
    .filter((m) => Number(m.fullMarks) > 0)
    .map((m) => ({
      subjectId: m.subjectId,
      obtainedMarks: Number(m.obtainedMarks),
      fullMarks: Number(m.fullMarks),
      confidenceLevel: m.confidenceLevel,
      topicIds: m.topicId ? [m.topicId] : [],
    }));
}

export function MarksheetFields({
  subjects,
  marks,
  onChange,
  emptyText,
}: {
  subjects: Subject[];
  marks: MarkEntry[];
  onChange: (key: string, patch: Partial<MarkEntry>) => void;
  emptyText: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {subjects.map((subject) => {
        const rows = marks.filter(
          (m) => m.subjectId === subject.id,
        );
        let lastGroup: string | null = null;
        return (
          <div
            key={subject.id}
            className="rounded-[26px] bg-[#F0EFED] p-5"
          >
            <p className="mb-4 text-base font-extrabold tracking-tight sm:text-lg">
              {subject.name}
            </p>

            <div className="flex flex-col gap-3">
              {rows.map((m) => {
                const showGroup =
                  m.groupName !== null &&
                  m.groupName !== lastGroup;
                lastGroup = m.groupName;
                const notInExam = m.fullMarks.trim() === '0';
                return (
                  <div key={m.key}>
                    {showGroup && (
                      <p className="mb-2 mt-1 text-sm font-bold uppercase tracking-wide text-black/50">
                        {m.groupName}
                      </p>
                    )}

                    <div className="rounded-2xl bg-white p-4">
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[8rem] flex-1 self-center text-sm font-semibold sm:text-base">
                          {m.topicId
                            ? m.label
                            : 'Whole subject'}
                          {!m.topicId && (
                            <span className="mt-0.5 block text-sm font-normal text-[#65615D]">
                              No topics yet. Add some on the
                              Subjects page for a finer plan.
                            </span>
                          )}
                        </div>

                        <Input
                          label="Out of"
                          type="number"
                          min={0}
                          max={MAX_FULL_MARKS}
                          className="w-24"
                          value={m.fullMarks}
                          onChange={(e) =>
                            onChange(m.key, {
                              fullMarks: e.target.value,
                            })
                          }
                        />
                        <Input
                          label="Obtained"
                          type="number"
                          min={0}
                          className="w-24"
                          disabled={notInExam}
                          value={
                            notInExam ? '' : m.obtainedMarks
                          }
                          onChange={(e) =>
                            onChange(m.key, {
                              obtainedMarks: e.target.value,
                            })
                          }
                        />
                        <Field label="Confidence">
                          <Select
                            disabled={notInExam}
                            value={m.confidenceLevel}
                            onChange={(e) =>
                              onChange(m.key, {
                                confidenceLevel: e.target
                                  .value as MarkEntry['confidenceLevel'],
                              })
                            }
                          >
                            <option value="low">Low</option>
                            <option value="medium">
                              Medium
                            </option>
                            <option value="high">High</option>
                          </Select>
                        </Field>
                      </div>

                      {notInExam && (
                        <p className="mt-3 text-sm font-semibold text-[#65615D]">
                          Not in this exam. Nothing will be
                          recorded for it.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {subjects.length === 0 && (
        <p className="text-sm text-[#65615D]">{emptyText}</p>
      )}
    </div>
  );
}
