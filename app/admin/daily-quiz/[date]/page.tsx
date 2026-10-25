'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { api, ApiError } from '@/lib/api-client';
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  Question,
  QuestionCategory,
} from '@/lib/types/daily-challenge';
import { GRADE_GROUP_LABELS, GradeGroup } from '@/lib/utils/grade-group';

const GRADE_GROUPS: GradeGroup[] = ['GROUP_4_7', 'GROUP_8_10'];

interface QuizState {
  gradeGroup: GradeGroup;
  quiz: { id: string; isPublished: boolean } | null;
  questions: { order: number; question: Question | null }[];
}

interface DailyQuizResponse {
  date: string;
  groups: QuizState[];
}

export default function DailyQuizPreparePage({
  params,
}: {
  params: { date: string };
}) {
  const [state, setState] = useState<DailyQuizResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.get<DailyQuizResponse>(
        `/api/admin/daily-quiz/${params.date}`,
      );
      setState(data);
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Couldn't load this date.",
      );
    }
  }, [params.date]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">
        Prepare quiz for {params.date}
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        One 3-question quiz publishes per grade group: 1 IQ &amp; Logic, 1
        Science, 1 General Knowledge.
      </p>

      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

      {!state && <p className="text-sm text-slate-400">Loading…</p>}

      {state && (
        <div className="grid gap-6 lg:grid-cols-2">
          {GRADE_GROUPS.map((gradeGroup) => {
            const group = state.groups.find((g) => g.gradeGroup === gradeGroup);
            return (
              <GradeGroupPanel
                key={gradeGroup}
                date={params.date}
                gradeGroup={gradeGroup}
                initialState={
                  group ?? { gradeGroup, quiz: null, questions: [] }
                }
                onChanged={load}
              />
            );
          })}
        </div>
      )}
    </main>
  );
}

function GradeGroupPanel({
  date,
  gradeGroup,
  initialState,
  onChanged,
}: {
  date: string;
  gradeGroup: GradeGroup;
  initialState: QuizState;
  onChanged: () => void;
}) {
  const isPublished = !!initialState.quiz?.isPublished;
  const [shortlists, setShortlists] = useState<Record<
    QuestionCategory,
    Question[]
  > | null>(null);
  const [selection, setSelection] = useState<Record<QuestionCategory, string>>({
    IQ_LOGIC: '',
    SCIENCE: '',
    GENERAL_KNOWLEDGE: '',
    TECH_AI: '',
    MATHEMATICS: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isPublished) return;
    Promise.all(
      CATEGORY_ORDER.map((category) =>
        api.get<{ questions: Question[] }>(
          `/api/admin/daily-quiz/eligible?gradeGroup=${gradeGroup}&category=${category}`,
        ),
      ),
    )
      .then(([iq, sci, gk, ai, mt]) => {
        setShortlists({
          IQ_LOGIC: iq.questions,
          SCIENCE: sci.questions,
          GENERAL_KNOWLEDGE: gk.questions,
          TECH_AI: ai.questions,
          MATHEMATICS: mt.questions,
        });
      })
      .catch((err) =>
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load eligible questions.",
        ),
      );
  }, [gradeGroup, isPublished]);

  async function handlePublish() {
    const missing = CATEGORY_ORDER.filter((c) => !selection[c]);
    if (missing.length > 0) {
      setError(
        `Select a question for: ${missing.map((c) => CATEGORY_LABELS[c]).join(', ')}`,
      );
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post(`/api/admin/daily-quiz/${date}/publish`, {
        gradeGroup,
        questionIds: selection,
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't publish.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUnpublish() {
    setError(null);
    setIsSubmitting(true);
    try {
      await api.post(`/api/admin/daily-quiz/${date}/unpublish`, { gradeGroup });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't unpublish.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">
          {GRADE_GROUP_LABELS[gradeGroup]}
        </h2>
        {isPublished ? (
          <Badge tone="strong">Published</Badge>
        ) : (
          <Badge tone="medium">Draft</Badge>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {isPublished ? (
        <div className="flex flex-col gap-3">
          {initialState.questions
            .sort((a, b) => a.order - b.order)
            .map(({ order, question }) => (
              <div
                key={order}
                className="rounded-lg border border-slate-200 p-3"
              >
                <Badge tone="brand">
                  {question ? CATEGORY_LABELS[question.category] : '?'}
                </Badge>
                <p className="mt-1 text-sm font-medium text-slate-800">
                  {question?.questionText}
                </p>
              </div>
            ))}
          <Button
            variant="secondary"
            onClick={handleUnpublish}
            isLoading={isSubmitting}
            className="self-start"
          >
            Unpublish to edit
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {CATEGORY_ORDER.map((category) => (
            <div key={category}>
              <p className="mb-2 text-sm font-medium text-slate-700">
                {CATEGORY_LABELS[category]}
              </p>
              {!shortlists && (
                <p className="text-xs text-slate-400">Loading options…</p>
              )}
              {shortlists && shortlists[category].length === 0 && (
                <p className="text-xs text-amber-600">
                  No eligible approved questions (either none approved yet, or
                  all were used within the last 7 days). Approve more in the
                  question bank.
                </p>
              )}
              {shortlists && shortlists[category].length > 0 && (
                <div className="flex flex-col gap-2">
                  {shortlists[category].map((q) => (
                    <label
                      key={q.id}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 p-2 text-sm hover:bg-slate-50"
                    >
                      <input
                        type="radio"
                        name={`${gradeGroup}-${category}`}
                        checked={selection[category] === q.id}
                        onChange={() =>
                          setSelection((prev) => ({
                            ...prev,
                            [category]: q.id,
                          }))
                        }
                        className="mt-1"
                      />
                      <span>
                        {q.questionText}
                        <span className="ml-1 text-xs text-slate-400">
                          ({q.timesUsed}x used
                          {q.lastUsedAt
                            ? `, last ${q.lastUsedAt}`
                            : ', never used'}
                          )
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
          <Button onClick={handlePublish} isLoading={isSubmitting}>
            Publish for {date}
          </Button>
        </div>
      )}
    </Card>
  );
}
