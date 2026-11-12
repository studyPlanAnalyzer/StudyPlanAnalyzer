'use client';

import { use } from 'react';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { PageTitle } from '@/components/ui/PageTitle';
import { StudentBottomNav } from '@/components/ui/StudentBottomNav';
import { RevisionPanel } from '@/components/revision/RevisionPanel';

/** "Revise earlier topics": the revision list, reachable any day. */
export default function RevisePage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  return (
    <PageShell withBottomNav>
      <AppHeader>
        <BackLink href={`/students/${params.id}/today`} label="Back to today" short="Back" />
      </AppHeader>
      <PageMain>
        <section className="mb-8 sm:mb-10">
          <PageTitle>Revise earlier topics.</PageTitle>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-black sm:text-base lg:text-lg">
            Topics from earlier exams. Saturdays and Sundays are set aside for these, but you can revise
            any day.
          </p>
        </section>
        <RevisionPanel studentId={params.id} />
      </PageMain>
      <StudentBottomNav studentId={params.id} active="today" />
    </PageShell>
  );
}
