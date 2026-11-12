'use client';

import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api-client';
import { formatDay } from '@/lib/utils/date-utils';
import { cardClass } from '@/components/ui/Card';
import { buttonClass } from '@/components/ui/Button';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { Notice } from '@/components/ui/Notice';
import { PageTitle } from '@/components/ui/PageTitle';
import { EmptyState, emptyStateActionClass } from '@/components/ui/EmptyState';
import {
  buildMarkEntries,
  MarksheetFields,
  marksheetError,
  marksheetPayload,
  type MarkEntry,
} from '@/components/exam/MarksheetFields';

interface StudentDetail {
  student: { id: string; name: string };
  subjects: { id: string; name: string }[];
  topics: { id: string; name: string; subjectId: string; parentTopicId: string | null }[];
  resultsPending: { examId: string; name: string; examDate: string } | null;
}

/**
 * "Add exam marks": the last exam's results, for a cycle that was started
 * before they were out ("Results not out yet"). Saved as that exam's
 * marksheet; the plan is rebuilt with them straight away.
 */
export default function AddExamMarksPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [detail, setDetail] = useState<StudentDetail | null>(null);
  const [marks, setMarks] = useState<MarkEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    api
      .get<StudentDetail>(`/api/students/${params.id}`)
      .then((data) => {
        setDetail(data);
        setMarks(buildMarkEntries(data.subjects, data.topics));
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          router.push('/login');
          return;
        }
        setError(
          err instanceof ApiError && err.retryable
            ? err.message
            : "Couldn't load this student. Please try refreshing.",
        );
      });
  }, [params.id, router]);

  function updateMark(key: string, patch: Partial<MarkEntry>) {
    setMarks((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }

  async function handleSubmit() {
    const problem =
      marksheetError(marks) ??
      (marksheetPayload(marks).length === 0
        ? 'Enter the marks for at least one subject or topic.'
        : null);
    if (problem) {
      setError(problem);
      setCanRetry(false);
      return;
    }
    setError(null);
    setCanRetry(false);
    setIsSubmitting(true);
    try {
      // One request: the marksheet is saved and the plan rebuilt together,
      // and a second save is refused, so retrying is always safe.
      await api.post(`/api/students/${params.id}/exam-marks`, {
        marks: marksheetPayload(marks),
      });
      router.push(`/students/${params.id}/analysis`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setCanRetry(err.retryable);
      } else {
        setError("Couldn't save the marks. Please try again.");
        setCanRetry(true);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const pending = detail?.resultsPending ?? null;

  return (
    <PageShell className="pb-10">
      <AppHeader>
        <BackLink href={`/students/${params.id}/analysis`} label="Back to analysis" short="Back" />
      </AppHeader>

      <PageMain>
        {!detail && !error && (
          <div className="space-y-7">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {error && (
          <Notice className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            {detail && canRetry && (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className={buttonClass('white', 'md', 'text-red-700')}
              >
                {isSubmitting ? 'Retrying…' : 'Try again'}
              </button>
            )}
          </Notice>
        )}

        {detail && !pending && (
          <EmptyState
            titleAs="h2"
            icon="📝"
            title="No exam results are waiting"
            description="Results are added here only when a new exam cycle was started before they were out. To record a class test, use Log a test."
            action={
              <Link
                href={`/students/${params.id}/add-test-marks`}
                className={emptyStateActionClass}
              >
                Log a test
              </Link>
            }
          />
        )}

        {detail && pending && (
          <>
            <section className="mb-8 sm:mb-10">
              <PageTitle>Add exam marks.</PageTitle>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-[#000000] sm:text-base lg:text-lg">
                {pending.name}, on {formatDay(pending.examDate)}. They&apos;re saved as
                that exam&apos;s results, and {detail.student.name}&apos;s plan updates
                with them straight away.
              </p>
            </section>

            <section className={`${cardClass} p-6 sm:p-8`}>
              <p className="mb-5 max-w-3xl text-sm leading-6 text-[#65615D] sm:text-base">
                Enter the result for every topic and sub-topic. If something
                wasn&apos;t in this exam, set its &ldquo;Out of&rdquo; to 0 and
                nothing is recorded for it.
              </p>
              <MarksheetFields
                subjects={detail.subjects}
                marks={marks}
                onChange={updateMark}
                emptyText="No subjects yet. Add them on the Subjects page first."
              />
            </section>

            <div className="mt-8 flex justify-end sm:mt-10">
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className={buttonClass('yellow', 'lg')}
              >
                {isSubmitting ? 'Saving…' : 'Save marks'}
              </button>
            </div>
          </>
        )}
      </PageMain>
    </PageShell>
  );
}
