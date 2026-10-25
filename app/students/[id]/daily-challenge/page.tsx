'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { api, ApiError } from '@/lib/api-client';
import {
  CATEGORY_LABELS,
  Question,
  QuizAttemptResult,
  StudentQuizQuestion,
} from '@/lib/types/daily-challenge';

interface DailyChallengeResponse {
  eligible: boolean;
  quiz: { id: string; date: string } | null;
  questions: (StudentQuizQuestion | Question)[];
  attempt: QuizAttemptResult | null;
}

const ENCOURAGEMENT = [
  'Nice work today! 🎉',
  'Great effort! 🌟',
  'Keep the streak going! 🔥',
  'Well played! 🎈',
];

function isFullQuestion(q: StudentQuizQuestion | Question): q is Question {
  return 'correctAnswer' in q;
}

export default function DailyChallengePage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [data, setData] = useState<DailyChallengeResponse | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // Page-load errors stay inline; submit-related messages use the popup.
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState<{
    questions: Question[];
    result: QuizAttemptResult;
  } | null>(null);

  useEffect(() => {
    api
      .get<DailyChallengeResponse>(`/api/students/${params.id}/daily-challenge`)
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError("Couldn't load today's challenge. Please try refreshing.");
      });
  }, [params.id, router]);

  // Auto-dismiss the popup after 4 seconds.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleSubmit() {
    if (!data?.quiz) return;
    const questionIds = data.questions.map((q) => q.id);
    const unanswered = questionIds.filter((id) => !answers[id]);

    if (unanswered.length > 0) {
      setToast(
        unanswered.length === questionIds.length
          ? `Please answer all ${questionIds.length} questions before submitting.`
          : `${unanswered.length} of ${questionIds.length} questions still need an answer.`,
      );
      document
        .getElementById(`question-${unanswered[0]}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setToast(null);
    setIsSubmitting(true);
    try {
      const result = await api.post<{
        attempt: QuizAttemptResult;
        questions: Question[];
      }>(`/api/students/${params.id}/daily-challenge`, {
        dailyQuizId: data.quiz.id,
        answers: questionIds.map((questionId) => ({
          questionId,
          selectedAnswer: answers[questionId],
        })),
      });
      setJustSubmitted({ questions: result.questions, result: result.attempt });
    } catch (err) {
      setToast(
        err instanceof ApiError
          ? err.message
          : "Couldn't submit. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const resultToShow =
    justSubmitted ??
    (data?.attempt
      ? { questions: data.questions as Question[], result: data.attempt }
      : null);

  const totalQuestions = data?.questions.length ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold text-indigo-700"
          >
            StudyPlan Analyzer
          </Link>
          <Link
            href={`/students/${params.id}/plan`}
            className="text-sm text-slate-500 hover:text-slate-800"
          >
            Back to plan
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">
          Daily Brain Challenge —{' '}
          {new Date().toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
          })}
        </h1>
        <p className="mb-6 text-sm text-slate-500">
          Quick, fun questions — just for practice and curiosity, not a test of
          how smart you are!
        </p>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        {!data && !error && <p className="text-sm text-slate-400">Loading…</p>}

        {data && !data.eligible && (
          <EmptyState
            title="Not available for this grade yet"
            description="The Daily Brain Challenge currently covers Grades 4–10."
          />
        )}

        {data && data.eligible && !data.quiz && (
          <EmptyState
            title="No challenge today"
            description="Nothing has been published yet for today — check back a bit later!"
          />
        )}

        {data && data.quiz && !resultToShow && (
          <div className="flex flex-col gap-4">
            {(data.questions as StudentQuizQuestion[]).map((q, i) => (
              <div key={q.id} id={`question-${q.id}`}>
                <Card>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone="brand">{CATEGORY_LABELS[q.category]}</Badge>
                    <span className="text-xs text-slate-400">
                      Question {i + 1} of {totalQuestions}
                    </span>
                  </div>
                  <p className="mb-3 text-sm font-medium text-slate-800">
                    {q.questionText}
                  </p>
                  <div className="flex flex-col gap-2">
                    {q.options.map((opt) => (
                      <label
                        key={opt}
                        className={clsx(
                          'cursor-pointer rounded-lg border px-3 py-2 text-sm transition-colors',
                          answers[q.id] === opt
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800'
                            : 'border-slate-200 hover:bg-slate-50',
                        )}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          className="mr-2"
                          checked={answers[q.id] === opt}
                          onChange={() =>
                            setAnswers((prev) => ({ ...prev, [q.id]: opt }))
                          }
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </Card>
              </div>
            ))}
            <Button
              onClick={handleSubmit}
              isLoading={isSubmitting}
              className="self-start"
            >
              Submit answers
            </Button>
          </div>
        )}

        {resultToShow && (
          <div className="flex flex-col gap-4">
            <Card className="bg-indigo-50 text-center">
              <p className="text-sm text-indigo-700">
                {
                  ENCOURAGEMENT[
                    resultToShow.result.score % ENCOURAGEMENT.length
                  ]
                }
              </p>
              <p className="mt-1 text-3xl font-semibold text-indigo-900">
                {resultToShow.result.score}/{resultToShow.result.totalQuestions}
              </p>
              <p className="mt-1 text-xs text-indigo-500">
                Come back tomorrow for a fresh set of questions!
              </p>
            </Card>

            {resultToShow.questions.filter(isFullQuestion).map((q) => {
              const given = resultToShow.result.answers.find(
                (a) => a.questionId === q.id,
              );
              return (
                <Card key={q.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <Badge tone="brand">{CATEGORY_LABELS[q.category]}</Badge>
                    {given?.correct ? (
                      <Badge tone="strong">Correct</Badge>
                    ) : (
                      <Badge tone="weak">Not quite</Badge>
                    )}
                  </div>
                  <p className="mb-2 text-sm font-medium text-slate-800">
                    {q.questionText}
                  </p>
                  <p className="text-sm text-slate-600">
                    Your answer:{' '}
                    <span className="font-medium">{given?.selectedAnswer}</span>
                  </p>
                  {!given?.correct && (
                    <p className="text-sm text-green-700">
                      Correct answer:{' '}
                      <span className="font-medium">{q.correctAnswer}</span>
                    </p>
                  )}
                  {q.explanation && (
                    <p className="mt-2 text-xs text-slate-500">
                      {q.explanation}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>

      {toast && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 z-50 flex w-[calc(100%-3rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg"
        >
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="text-slate-300 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
