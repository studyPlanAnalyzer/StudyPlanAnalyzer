'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api-client';

interface Student {
  id: string;
  name: string;
  grade: string;
  schoolName: string | null;
}

export default function ProfilePage({ params }: { params: { id: string } }) {
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
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link
            href="/dashboard"
            className="text-lg font-semibold text-indigo-700"
          >
            StudyPlan Analyzer
          </Link>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <Link
              href={`/students/${params.id}/plan`}
              className="hover:text-slate-800"
            >
              Plan
            </Link>
            <Link
              href={`/students/${params.id}/subjects`}
              className="hover:text-slate-800"
            >
              Subjects
            </Link>
            <Link
              href={`/students/${params.id}/tests`}
              className="hover:text-slate-800"
            >
              Test history
            </Link>
            <Link
              href={`/students/${params.id}/settings`}
              className="hover:text-slate-800"
            >
              Settings
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-10">
        {!saved && !error && <SkeletonCard />}

        {saved && (
          <>
            <h1 className="mb-1 text-2xl font-semibold text-slate-900">
              Student profile
            </h1>
            <p className="mb-6 text-sm text-slate-500">
              Changing these details does not change the study plan. Exam date
              and study time are in Settings.
            </p>

            <Card>
              <div className="flex flex-col gap-4">
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
                  className="w-28"
                  value={grade}
                  onChange={(e) => {
                    setGrade(e.target.value);
                    setJustSaved(false);
                  }}
                />
                <Input
                  label="School name"
                  value={schoolName}
                  onChange={(e) => {
                    setSchoolName(e.target.value);
                    setJustSaved(false);
                  }}
                />
              </div>

              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
              {justSaved && !dirty && (
                <p className="mt-4 text-sm text-green-700">Profile saved.</p>
              )}

              <div className="mt-5 flex gap-2">
                <Button onClick={save} isLoading={isSaving} disabled={!dirty}>
                  Save profile
                </Button>
                <Button
                  variant="secondary"
                  disabled={!dirty || isSaving}
                  onClick={discard}
                >
                  Discard changes
                </Button>
              </div>
            </Card>
          </>
        )}

        {!saved && error && <p className="text-sm text-red-600">{error}</p>}
      </main>
    </div>
  );
}
