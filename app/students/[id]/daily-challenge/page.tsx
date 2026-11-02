'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api-client';
import { fromDateString, todayKey } from '@/lib/utils/date-utils';
import {
  CATEGORY_LABELS,
  Question,
  QuizAttemptResult,
  StudentQuizQuestion,
} from '@/lib/types/daily-challenge';
import { cardClass } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { Notice } from '@/components/ui/Notice';
import { PageTitle } from '@/components/ui/PageTitle';
import { Tag } from '@/components/ui/Tag';
import { buttonClass } from '@/components/ui/Button';
import { StudentBottomNav } from '@/components/ui/StudentBottomNav';

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

const numberColors = [
  'bg-[#F7CC46]',
  'bg-[#a4e5c7]',
  'bg-[#a8acf0]',
  'bg-[#EDB1AA]',
];

const questionCard = `${cardClass} p-6 sm:p-8`;

function isFullQuestion(q: StudentQuizQuestion | Question): q is Question {
  return 'correctAnswer' in q;
}

export default function DailyChallengePage(
  props: {
    params: Promise<{ id: string }>;
  }
) {
  const params = use(props.params);
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
  const answeredCount = data
    ? data.questions.filter((q) => !!answers[q.id]).length
    : 0;

  const todayLabel = fromDateString(todayKey()).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <PageShell withBottomNav>
      <AppHeader>
        <BackLink href={`/students/${params.id}/plan`} label="Back to plan" short="Back" />
      </AppHeader>

      <PageMain>
        {/* HERO SECTION */}
        <section className="mb-8 sm:mb-10">
          <PageTitle>
            Daily Brain Challenge.
          </PageTitle>

          <div className="mt-5">
            <Tag className="px-5 py-2">{todayLabel}</Tag>
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
            Quick, fun questions — just for practice and curiosity, not a test
            of how smart you are!
          </p>
        </section>

        {/* ERROR MESSAGE */}
        {error && (
          <Notice className="mb-6">
            {error}
          </Notice>
        )}

        {/* LOADING STATE */}
        {!data && !error && (
          <div className="space-y-7">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {/* NOT ELIGIBLE */}
        {data && !data.eligible && (
          <EmptyState
            titleAs="h2"
            icon="🎒"
            title="Not available for this grade yet"
            description="The Daily Brain Challenge currently covers Grades 4–10."
          />
        )}

        {/* NO QUIZ TODAY */}
        {data && data.eligible && !data.quiz && (
          <EmptyState
            titleAs="h2"
            icon="⏳"
            title="No challenge today"
            description="Nothing has been published yet for today — check back a bit later!"
          />
        )}

        {/* QUESTIONS */}
        {data && data.quiz && !resultToShow && (
          <>
            <div className="grid items-start gap-6 lg:grid-cols-2">
              {(data.questions as StudentQuizQuestion[]).map((q, i) => (
                <div key={q.id} id={`question-${q.id}`} className={questionCard}>
                  <div className="mb-5 flex items-center gap-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                        numberColors[i % numberColors.length]
                      }`}
                    >
                      {i + 1}
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <Tag className="px-5 py-2">
                        {CATEGORY_LABELS[q.category]}
                      </Tag>

                      <span className="text-sm font-semibold text-[#65615D]">
                        Question {i + 1} of {totalQuestions}
                      </span>
                    </div>
                  </div>

                  <p className="mb-5 text-lg font-bold leading-snug tracking-tight sm:text-xl">
                    {q.questionText}
                  </p>

                  <div className="flex flex-col gap-3">
                    {q.options.map((opt) => (
                      <label
                        key={opt}
                        className={clsx(
                          'cursor-pointer rounded-2xl px-5 py-3.5 text-sm font-semibold transition-all duration-200 focus-within:ring-2 focus-within:ring-black/40 active:scale-[0.99] sm:text-base',
                          answers[q.id] === opt
                            ? 'bg-black text-white'
                            : 'bg-[#F0EFED] text-black hover:bg-[#E7E5E2]',
                        )}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          className="sr-only"
                          checked={answers[q.id] === opt}
                          onChange={() =>
                            setAnswers((prev) => ({ ...prev, [q.id]: opt }))
                          }
                        />
                        {opt}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* SUBMIT BAR */}
            <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-black/65 sm:text-base">
                {answeredCount} of {totalQuestions} answered
              </p>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className={buttonClass('yellow', 'lg', 'w-fit')}
              >
                {isSubmitting ? 'Submitting…' : 'Submit answers'}
              </button>
            </div>
          </>
        )}

        {/* RESULT */}
        {resultToShow && (
          <>
            <div className="mb-8 rounded-[32px] bg-[#F7CC46] p-8 text-center sm:mb-10 sm:p-10">
              <Tag className="px-5 py-2">Your score</Tag>

              <p className="mt-5 text-lg font-bold sm:text-xl">
                {
                  ENCOURAGEMENT[
                    resultToShow.result.score % ENCOURAGEMENT.length
                  ]
                }
              </p>

              <p className="mt-2 text-6xl font-extrabold tracking-tight sm:text-7xl">
                {resultToShow.result.score}/{resultToShow.result.totalQuestions}
              </p>

              <p className="mt-3 text-sm font-semibold text-black/70 sm:text-base">
                Come back tomorrow for a fresh set of questions!
              </p>
            </div>

            <div className="grid items-start gap-6 lg:grid-cols-2">
              {resultToShow.questions.filter(isFullQuestion).map((q, i) => {
                const given = resultToShow.result.answers.find(
                  (a) => a.questionId === q.id,
                );
                return (
                  <div key={q.id} className={questionCard}>
                    <div className="mb-5 flex items-center gap-4">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                          numberColors[i % numberColors.length]
                        }`}
                      >
                        {i + 1}
                      </div>

                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Tag className="px-5 py-2">
                          {CATEGORY_LABELS[q.category]}
                        </Tag>

                        {given?.correct ? (
                          <Tag tone="mint" className="px-5 py-2">Correct</Tag>
                        ) : (
                          <Tag tone="coral" className="px-5 py-2">Not quite</Tag>
                        )}
                      </div>
                    </div>

                    <p className="mb-4 text-lg font-bold leading-snug tracking-tight sm:text-xl">
                      {q.questionText}
                    </p>

                    <div className="rounded-[22px] bg-[#F0EFED] px-5 py-4">
                      <p className="text-sm text-[#65615D] sm:text-base">
                        Your answer:{' '}
                        <span className="font-bold text-black">
                          {given?.selectedAnswer}
                        </span>
                      </p>

                      {!given?.correct && (
                        <p className="mt-1 text-sm text-[#16865B] sm:text-base">
                          Correct answer:{' '}
                          <span className="font-bold">{q.correctAnswer}</span>
                        </p>
                      )}
                    </div>

                    {q.explanation && (
                      <p className="mt-4 text-sm leading-6 text-[#65615D]">
                        {q.explanation}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </PageMain>

      <StudentBottomNav studentId={params.id} active="quiz" />

      {/* TOAST */}
      {toast && (
        <div
          role="alert"
          className="fixed bottom-24 left-1/2 z-50 flex w-[calc(100%-2.5rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-2xl bg-black px-5 py-4 text-sm font-semibold text-white shadow-2xl sm:bottom-6"
        >
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            ✕
          </button>
        </div>
      )}
    </PageShell>
  );
}
