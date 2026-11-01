'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import clsx from 'clsx';
import { SkeletonCard } from '@/components/ui/Skeleton';
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

const numberColors = [
  'bg-[#F7CC46]',
  'bg-[#a4e5c7]',
  'bg-[#a8acf0]',
  'bg-[#EDB1AA]',
];

const cardClass =
  'rounded-[32px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-8';

const blackBadge =
  'inline-flex rounded-full bg-black px-5 py-2 text-xs font-bold uppercase tracking-wide text-white';

function isFullQuestion(q: StudentQuizQuestion | Question): q is Question {
  return 'correctAnswer' in q;
}

function ArrowLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function EmptyCard({
  emoji,
  title,
  description,
}: {
  emoji: string;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[32px] bg-white px-6 py-16 text-center shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:py-20">
      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-[28px] bg-[#F7CC46] text-4xl">
        {emoji}
      </div>

      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>

      <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-[#65615D] sm:text-base">
        {description}
      </p>
    </div>
  );
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

  const todayLabel = new Date().toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FAF9F6] pb-24 text-black sm:pb-8">
      {/* HEADER */}
      <header className="relative z-30 bg-[#FAF9F6]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-6 px-5 py-5 sm:px-7 lg:px-0">
          {/* BRAND */}
          <Link href="/dashboard" className="flex shrink-0 items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-xl font-bold text-white sm:h-14 sm:w-14 sm:text-2xl">
              S
            </div>

            <span className="text-xl font-bold tracking-tight sm:text-2xl">
              StudyPlan Analyzer
            </span>
          </Link>

          {/* BACK BUTTON */}
          <Link
            href={`/students/${params.id}/plan`}
            className="flex h-12 items-center justify-center gap-2 rounded-full bg-[#F0EFED] px-5 text-sm font-semibold transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:px-6 sm:text-base"
          >
            <ArrowLeftIcon />
            <span>
              Back<span className="hidden sm:inline"> to plan</span>
            </span>
          </Link>
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto w-full max-w-[1400px] px-5 pt-5 sm:px-7 sm:pt-8 lg:px-0">
        {/* HERO SECTION */}
        <section className="mb-8 sm:mb-10">
          <h1 className="dashboard-headline relative inline-block max-w-full text-[clamp(1.15rem,5.1vw,4rem)] font-extrabold leading-tight tracking-[-0.045em]">
            Daily Brain Challenge.
          </h1>

          <div className="mt-5">
            <span className={blackBadge}>{todayLabel}</span>
          </div>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
            Quick, fun questions — just for practice and curiosity, not a test
            of how smart you are!
          </p>
        </section>

        {/* ERROR MESSAGE */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
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
          <EmptyCard
            emoji="🎒"
            title="Not available for this grade yet"
            description="The Daily Brain Challenge currently covers Grades 4–10."
          />
        )}

        {/* NO QUIZ TODAY */}
        {data && data.eligible && !data.quiz && (
          <EmptyCard
            emoji="⏳"
            title="No challenge today"
            description="Nothing has been published yet for today — check back a bit later!"
          />
        )}

        {/* QUESTIONS */}
        {data && data.quiz && !resultToShow && (
          <>
            <div className="grid items-start gap-6 lg:grid-cols-2">
              {(data.questions as StudentQuizQuestion[]).map((q, i) => (
                <div key={q.id} id={`question-${q.id}`} className={cardClass}>
                  <div className="mb-5 flex items-center gap-4">
                    <div
                      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                        numberColors[i % numberColors.length]
                      }`}
                    >
                      {i + 1}
                    </div>

                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                      <span className={blackBadge}>
                        {CATEGORY_LABELS[q.category]}
                      </span>

                      <span className="text-xs font-semibold text-[#65615D]">
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
                className="inline-flex w-fit shrink-0 items-center justify-center gap-2 rounded-full bg-[#F7CC46] px-6 py-3.5 text-sm font-semibold text-black shadow-[0_5px_12px_rgba(0,0,0,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F0C33A] hover:shadow-[0_7px_16px_rgba(0,0,0,0.10)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:px-7 sm:py-4 sm:text-base"
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
              <span className={blackBadge}>Your score</span>

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
                  <div key={q.id} className={cardClass}>
                    <div className="mb-5 flex items-center gap-4">
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg font-extrabold ${
                          numberColors[i % numberColors.length]
                        }`}
                      >
                        {i + 1}
                      </div>

                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <span className={blackBadge}>
                          {CATEGORY_LABELS[q.category]}
                        </span>

                        {given?.correct ? (
                          <span className="inline-flex rounded-full bg-[#a4e5c7] px-5 py-2 text-xs font-bold uppercase tracking-wide text-black">
                            Correct
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-[#EDB1AA] px-5 py-2 text-xs font-bold uppercase tracking-wide text-black">
                            Not quite
                          </span>
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
      </main>

      {/* MOBILE BOTTOM NAVIGATION */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          <Link
            href="/dashboard"
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">▦</span>
            <span className="text-[10px] font-medium">Home</span>
          </Link>

          <Link
            href={`/students/${params.id}/plan`}
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">＋</span>
            <span className="text-[10px] font-medium">Plan</span>
          </Link>

          <Link
            href={`/students/${params.id}/today`}
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">ϟ</span>
            <span className="text-[10px] font-medium">Today</span>
          </Link>

          <Link
            href={`/students/${params.id}/daily-challenge`}
            className="flex flex-col items-center gap-1 py-3 text-black"
          >
            <span className="text-xl">◧</span>
            <span className="text-[10px] font-bold">Quiz</span>
          </Link>

          <Link
            href={`/students/${params.id}/settings`}
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">●</span>
            <span className="text-[10px] font-medium">You</span>
          </Link>
        </div>
      </nav>

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
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
          >
            ✕
          </button>
        </div>
      )}

      {/* HEADLINE ANIMATION */}
      <style jsx global>{`
        @keyframes headline-enter {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes underline-draw {
          from {
            transform: scaleX(0);
          }
          to {
            transform: scaleX(1);
          }
        }

        .dashboard-headline {
          animation: headline-enter 700ms ease-out both;
        }

        .dashboard-headline::after {
          content: '';
          position: absolute;
          left: 0;
          bottom: -5px;
          width: 100%;
          height: 3px;
          border-radius: 999px;
          background: #f7cc46;
          transform: scaleX(0);
          transform-origin: left;
          animation: underline-draw 900ms 400ms ease-out forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .dashboard-headline,
          .dashboard-headline::after {
            animation: none;
            opacity: 1;
            transform: none;
          }

          .dashboard-headline::after {
            transform: scaleX(1);
          }
        }
      `}</style>
    </div>
  );
}
