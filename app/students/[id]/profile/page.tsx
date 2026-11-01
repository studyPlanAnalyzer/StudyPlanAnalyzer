'use client';

import { useCallback, useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Input } from '@/components/ui/Input';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api-client';
import { cardClass } from '@/components/ui/Card';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, BackLink, headerLinkClass } from '@/components/ui/AppHeader';
import { Notice } from '@/components/ui/Notice';
import { PageTitle } from '@/components/ui/PageTitle';
import { buttonClass } from '@/components/ui/Button';
import { StudentBottomNav } from '@/components/ui/StudentBottomNav';

interface Student {
  id: string;
  name: string;
  grade: string;
  schoolName: string | null;
}

const sectionCard = `${cardClass} p-6 sm:p-8 lg:p-10`;

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
    <PageShell withBottomNav>
      <AppHeader>
        <Link href={`/students/${params.id}/subjects`} className={`hidden lg:block ${headerLinkClass}`}>
          Subjects
        </Link>
        <Link href={`/students/${params.id}/tests`} className={`hidden lg:block ${headerLinkClass}`}>
          Test history
        </Link>
        <Link href={`/students/${params.id}/settings`} className={`hidden lg:block ${headerLinkClass}`}>
          Settings
        </Link>
        <BackLink href={`/students/${params.id}/plan`} label="Back to plan" short="Back" />
      </AppHeader>

      <PageMain>
        {/* LOADING STATE */}
        {!saved && !error && (
          <div className="space-y-7">
            <SkeletonCard />
          </div>
        )}

        {/* ERROR MESSAGE */}
        {error && (
          <Notice className="mb-6">
            {error}
          </Notice>
        )}

        {saved && (
          <>
            {/* HERO SECTION */}
            <section className="mb-8 sm:mb-10">
              <PageTitle>
                Student profile.
              </PageTitle>
            </section>

            {/* SUCCESS MESSAGE */}
            {justSaved && !dirty && (
              <Notice tone="success" className="mb-6">
                Profile saved.
              </Notice>
            )}

            {/* PROFILE FORM */}
            <section className={sectionCard}>
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
                  className={buttonClass('secondary', 'lg')}
                >
                  Discard changes
                </button>

                <button
                  type="button"
                  onClick={save}
                  disabled={!dirty || isSaving}
                  className={buttonClass('yellow', 'lg')}
                >
                  {isSaving ? 'Saving…' : 'Save profile'}
                </button>
              </div>
            </div>
          </>
        )}
      </PageMain>

      <StudentBottomNav studentId={params.id} active="you" />
    </PageShell>
  );
}
