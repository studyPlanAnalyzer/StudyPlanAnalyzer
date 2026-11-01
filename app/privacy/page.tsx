import type { Metadata } from 'next';
import { AppHeader, BackLink } from '@/components/ui/AppHeader';
import { cardClass } from '@/components/ui/Card';
import { PageMain, PageShell } from '@/components/ui/PageShell';
import { PageTitle } from '@/components/ui/PageTitle';

// Fill these two in before you publish.
const OPERATOR = 'StudyPlan Analyzer';
const CONTACT_EMAIL = 'studyplananalyzer@gmail.com';
const APP_NAME = 'StudyPlan Analyzer';
const LAST_UPDATED = '1 November 2026';

export const metadata: Metadata = {
  title: `Privacy Policy – ${APP_NAME}`,
  description: `How ${APP_NAME} collects, uses and protects information.`,
};

export default function PrivacyPage() {
  return (
    <PageShell className="pb-10">
      <AppHeader width="narrow" brandHref="/">
        <BackLink href="/login" label="Back to sign in" />
      </AppHeader>

      <PageMain width="narrow">
      <PageTitle size="text-3xl sm:text-4xl">Privacy Policy</PageTitle>
      <p className="mt-3 text-sm text-[#65615D]">Last updated: {LAST_UPDATED}</p>

      <article className={`${cardClass} mt-8 p-6 leading-7 sm:p-10`}>

      <p>
        {APP_NAME} (&ldquo;the app&rdquo;, &ldquo;we&rdquo;) is run by{' '}
        {OPERATOR}. It helps parents in Nepal build study plans for their
        children until the next exam. This policy explains what information the
        app handles and why. It is written for parents, who are the only people
        who create accounts.
      </p>

      <h2 className="mt-8 text-xl font-extrabold tracking-tight">1. Information we collect</h2>
      <h3 className="mt-4 font-semibold">From your Google account</h3>
      <p className="mt-1">
        You sign in with Google. Google gives us your name, your email address
        and a unique Google account ID, and we keep these three. We do not keep
        your profile picture. We do not receive your Google password, and we do
        not access your contacts, calendar, Drive, Gmail or any other Google
        data. We also record when you last signed in.
      </p>
      <h3 className="mt-4 font-semibold">What you enter about your child</h3>
      <ul className="mt-1 list-disc space-y-1 pl-6">
        <li>Your child&rsquo;s name, class or grade, and school name.</li>
        <li>
          The days your child studies and how many minutes they can study on
          school days and on holidays.
        </li>
        <li>
          Subjects and topics, how important each subject is, how hard each
          topic is, and how confident you think your child is in a subject.
        </li>
        <li>Exam names and dates.</li>
        <li>
          Tests: their names and dates, the marks, and how confident your child
          felt.
        </li>
        <li>
          The study plan and what happens with it: which sessions were done or
          skipped, and how each one felt (Again, Hard, Good or Easy).
        </li>
        <li>Daily challenge answers and scores.</li>
        <li>The daily to-dos you type in.</li>
        <li>
          Weekly reports and badges, which the app makes from the information
          above.
        </li>
      </ul>
      <h3 className="mt-4 font-semibold">Payment details</h3>
      <p className="mt-1">
        If you pay for access, we keep the payment details so we can check the
        payment by hand: the plan, the amount, the payment remark code (which
        includes the first letters of your child&rsquo;s name), the transaction
        ID, and the names you type in the payment form (your name, your
        child&rsquo;s name and the school&rsquo;s name). We also keep the
        payment&rsquo;s status and dates, and, if a payment can&rsquo;t be
        verified, a short note from the person who checked it. You do not upload
        any screenshots or files. We do not receive or store your bank, wallet
        or card login details.
      </p>
      <p className="mt-2">
        If your child&rsquo;s school pays for the app and gives you a school
        code, using the code links your child to that school in the app. Schools
        do not have accounts in the app and cannot see your child&rsquo;s
        information.
      </p>
      <h3 className="mt-4 font-semibold">Technical information</h3>
      <p className="mt-1">
        The app uses cookies that keep you signed in (see section 4). To stop
        someone from trying to sign in over and over, the app briefly holds the
        IP address of each sign-in attempt in memory; it is not saved in our
        database. Our database does not store your IP address, device or browser
        details. Our hosting provider may keep standard server logs, such as IP
        address and request time, for security and troubleshooting.
      </p>

      <h2 className="mt-8 text-xl font-extrabold tracking-tight">2. How we use it</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>To sign you in and keep your account secure.</li>
        <li>
          To build and adjust your child&rsquo;s study plan and
          spaced-repetition schedule.
        </li>
        <li>To show progress, analysis and weekly reports inside the app.</li>
        <li>To check payments and give access to the paid features.</li>
        <li>To fix problems and keep the app working.</li>
      </ul>
      <p className="mt-3">
        We do not sell your information, and we do not use it for advertising.
        The app has no analytics, advertising or tracking tools. The app does not
        send you email.
      </p>

      <h2 className="mt-8 text-xl font-extrabold tracking-tight">3. Who can see it</h2>
      <p className="mt-1">
        Inside the app, only you can see your children&rsquo;s information.
        People who run the app can see account and payment details, and can open
        any child&rsquo;s weekly report, to verify payments, help with a problem
        and check that reports are correct.
      </p>
      <p className="mt-2">
        We use these service providers to run the app. They process data on our
        behalf:
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-6">
        <li>
          Google, for sign-in. The &ldquo;Continue with Google&rdquo; button on
          the sign-in page is loaded from Google, and when you use it Google
          tells us your name, email address and Google account ID.
        </li>
        <li>Vercel, which hosts the app. The app runs in Singapore.</li>
        <li>
          Neon, which runs our database. The database is stored in Singapore.
        </li>
      </ul>
      <p className="mt-2">
        This means your information is stored and processed outside Nepal. We
        may also share information if the law requires it.
      </p>

      <h2 className="mt-8 text-xl font-extrabold tracking-tight">4. Cookies</h2>
      <p className="mt-1">
        The app sets three cookies, all to keep you signed in: a short sign-in
        pass that lasts 15 minutes and is renewed automatically, a longer one
        that lasts 7 days and is only used to renew your sign-in, and a small
        marker that only says you are signed in. They hold sign-in codes, not
        your name, email or anything about your child. Page scripts cannot read
        them, and they are not used for advertising or tracking across other
        sites. Logging out clears
        them. If you block them, you will not be able to stay signed in.
      </p>
      <p className="mt-2">
        When you use the &ldquo;Continue with Google&rdquo; button, Google may
        use its own cookies; Google&rsquo;s privacy policy covers those.
      </p>

      <h2 className="mt-8 text-xl font-extrabold tracking-tight">
        5. Children&rsquo;s information
      </h2>
      <p className="mt-1">
        The app is for parents. Children do not create accounts or sign in on
        their own. Any information about a child is entered by the parent, and a
        parent can delete a child at any time (see sections 6 and 7).
      </p>

      <h2 className="mt-8 text-xl font-extrabold tracking-tight">6. How long we keep it</h2>
      <p className="mt-1">
        We keep your information while your account exists. Nothing is deleted
        automatically.
      </p>
      <p className="mt-2">
        When you delete a child (the &ldquo;Delete child&rdquo; button on the
        dashboard), we permanently delete that child&rsquo;s profile and all of
        their study information: subjects and topics, exams, the study plan and
        sessions, tests and marks, challenge answers, to-dos, weekly reports and
        badges. Payment records for that child are kept, because we need them to
        check payments and resolve disputes. They are no longer linked to the
        child, but they still contain the details listed under &ldquo;Payment
        details&rdquo; in section 1, including the names typed in the payment
        form.
      </p>
      <p className="mt-2">
        When we delete your account at your request, everything linked to it is
        deleted: your profile, all your children and their study information,
        all payment records and all sign-in records.
      </p>
      <p className="mt-2">
        Sign-in records are deleted when you log out. Expired ones are removed
        the next time you sign in.
      </p>

      <h2 className="mt-8 text-xl font-extrabold tracking-tight">7. Your choices</h2>
      <ul className="mt-2 list-disc space-y-1 pl-6">
        <li>
          In the app you can change your child&rsquo;s details, edit or delete
          tests, marks, subjects, topics and to-dos, and delete a child.
        </li>
        <li>
          To see your information, or to delete your whole account, write to us
          at the address below. There is no button for deleting an account.
        </li>
        <li>
          You can also remove the app&rsquo;s access from your Google account
          settings. That stops new sign-ins with Google but does not delete what
          is already stored; ask us to delete your account for that.
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-extrabold tracking-tight">8. Security</h2>
      <p className="mt-1">
        Connections to the app and to our database are encrypted, sessions use
        secure cookies, and access to administration tools is limited. No online
        service is perfectly secure, but we take reasonable steps to protect your
        information.
      </p>

      <h2 className="mt-8 text-xl font-extrabold tracking-tight">9. Changes to this policy</h2>
      <p className="mt-1">
        If we change this policy we will update the date at the top of this
        page.
      </p>

      <h2 className="mt-8 text-xl font-extrabold tracking-tight">10. Contact</h2>
      <p className="mt-1">Questions or requests: {CONTACT_EMAIL}</p>

      </article>
      </PageMain>
    </PageShell>
  );
}
