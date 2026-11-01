'use client';

import { useCallback, useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/Input';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api-client';

interface Student {
  id: string;
  name: string;
  grade: string;
  schoolName: string | null;
}

const cardClass =
  'rounded-[32px] bg-white p-6 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-8 lg:p-10';

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

export default function ProfilePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const [saved, setSaved] = useState<Student | null>(null);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ student: Student }>(
        `/api/students/${params.id}`,
      );
      setSaved(data.student);
      setName(data.student.name);
      setGrade(data.student.grade);
      setSchoolName(data.student.schoolName ?? '');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }
      setError("Couldn't load the profile. Please try refreshing.");
    }
  }, [params.id, router]);

  useEffect(() => {
    load();
  }, [load]);

  const dirty =
    !!saved &&
    (name.trim() !== saved.name ||
      grade.trim() !== saved.grade ||
      schoolName.trim() !== (saved.schoolName ?? ''));

  // Warn before leaving with unsaved edits: closing the tab, any link
  // (including the navigation bar) and the browser's back button.
  useEffect(() => {
    if (!dirty) return;
    const message =
      'You have unsaved changes. If you leave now, they will not be saved. Leave anyway?';
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = message;
    }
    function onClick(e: MouseEvent) {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]');
      if (!a || (a as HTMLAnchorElement).target === '_blank') return;
      if (!window.confirm(message)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
    // Capture phase and stopImmediatePropagation, so Next.js's own back-button
    // handler doesn't navigate before the parent has answered.
    function onPopState(e: PopStateEvent) {
      e.stopImmediatePropagation();
      if (window.confirm(message)) {
        window.removeEventListener('popstate', onPopState, true);
        window.history.back();
      } else {
        window.history.pushState({ profileGuard: true }, '');
      }
    }
    if (!window.history.state?.profileGuard)
      window.history.pushState({ profileGuard: true }, '');
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('popstate', onPopState, true);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState, true);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty]);

  function validate(): string | null {
    if (!name.trim()) return 'Enter the child’s name.';
    if (
      !/^\d{1,2}$/.test(grade.trim()) ||
      Number(grade) < 4 ||
      Number(grade) > 10
    )
      return 'Grade must be a number from 4 to 10.';
    if (schoolName.trim().length < 3) return 'School name is required.';
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setJustSaved(false);
    setIsSaving(true);
    try {
      // Profile details only: this never touches the study plan.
      const res = await api.put<{ student: Student }>(
        `/api/students/${params.id}`,
        {
          name: name.trim(),
          grade: grade.trim(),
          schoolName: schoolName.trim(),
        },
      );
      setSaved(res.student);
      setName(res.student.name);
      setGrade(res.student.grade);
      setSchoolName(res.student.schoolName ?? '');
      setJustSaved(true);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't save the profile. Please try again.",
      );
    }
    setIsSaving(false);
  }

  function discard() {
    if (!saved) return;
    setName(saved.name);
    setGrade(saved.grade);
    setSchoolName(saved.schoolName ?? '');
    setError(null);
  }

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

          {/* HEADER ACTIONS */}
          <div className="flex items-center gap-2.5">
            <Link
              href={`/students/${params.id}/subjects`}
              className="hidden rounded-full px-4 py-3 text-sm font-semibold transition hover:bg-black/5 lg:block"
            >
              Subjects
            </Link>

            <Link
              href={`/students/${params.id}/tests`}
              className="hidden rounded-full px-4 py-3 text-sm font-semibold transition hover:bg-black/5 lg:block"
            >
              Test history
            </Link>

            <Link
              href={`/students/${params.id}/settings`}
              className="hidden rounded-full px-4 py-3 text-sm font-semibold transition hover:bg-black/5 lg:block"
            >
              Settings
            </Link>

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
        </div>
      </header>

      {/* MAIN CONTENT */}
      <main className="mx-auto w-full max-w-[1400px] px-5 pt-5 sm:px-7 sm:pt-8 lg:px-0">
        {/* LOADING STATE */}
        {!saved && !error && (
          <div className="space-y-7">
            <SkeletonCard />
          </div>
        )}

        {/* ERROR MESSAGE */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {saved && (
          <>
            {/* HERO SECTION */}
            <section className="mb-8 sm:mb-10">
              <h1 className="dashboard-headline relative inline-block max-w-full text-[clamp(1.15rem,5.1vw,4rem)] font-extrabold leading-tight tracking-[-0.045em]">
                Student profile.
              </h1>
            </section>

            {/* SUCCESS MESSAGE */}
            {justSaved && !dirty && (
              <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                Profile saved.
              </div>
            )}

            {/* PROFILE FORM */}
            <section className={cardClass}>
              <div className="mb-7 flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[22px] bg-[#F7CC46] text-2xl">
                  🎓
                </div>

                <div className="min-w-0">
                  <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                    Student details
                  </h2>

                  <p className="mt-1 text-sm leading-6 text-[#65615D] sm:text-base">
                    Name, grade and school.
                  </p>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <Input
                  label="Name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    setJustSaved(false);
                  }}
                />

                <Input
                  label="Grade"
                  type="number"
                  min={4}
                  max={10}
                  value={grade}
                  onChange={(e) => {
                    setGrade(e.target.value);
                    setJustSaved(false);
                  }}
                />

                <div className="sm:col-span-2">
                  <Input
                    label="School name"
                    value={schoolName}
                    onChange={(e) => {
                      setSchoolName(e.target.value);
                      setJustSaved(false);
                    }}
                  />
                </div>
              </div>
            </section>

            {/* SAVE BAR */}
            <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-semibold text-black/65 sm:text-base">
                {dirty ? 'You have unsaved changes.' : ''}
              </p>

              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                <button
                  type="button"
                  onClick={discard}
                  disabled={!dirty || isSaving}
                  className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#F0EFED] px-6 py-3.5 text-sm font-semibold text-black transition-all duration-200 hover:bg-[#E7E5E2] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:px-7 sm:py-4 sm:text-base"
                >
                  Discard changes
                </button>

                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty || isSaving}
                  className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#F7CC46] px-6 py-3.5 text-sm font-semibold text-black shadow-[0_5px_12px_rgba(0,0,0,0.07)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#F0C33A] hover:shadow-[0_7px_16px_rgba(0,0,0,0.10)] active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 sm:px-7 sm:py-4 sm:text-base"
                >
                  {isSaving ? 'Saving…' : 'Save profile'}
                </button>
              </div>
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
            className="flex flex-col items-center gap-1 py-3 text-black/35"
          >
            <span className="text-xl">◧</span>
            <span className="text-[10px] font-medium">Quiz</span>
          </Link>

          <Link
            href={`/students/${params.id}/settings`}
            className="flex flex-col items-center gap-1 py-3 text-black"
          >
            <span className="text-xl">●</span>
            <span className="text-[10px] font-bold">You</span>
          </Link>
        </div>
      </nav>

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
