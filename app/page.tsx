import type { Metadata } from 'next';
import Link from 'next/link';

import { ClimbIllustration } from '@/components/landing/ClimbIllustration';
import { ForgettingCurve } from '@/components/landing/ForgettingCurve';
import { LandingStyles } from '@/components/landing/LandingStyles';
import { RevisionCalendar } from '@/components/landing/RevisionCalendar';

export const metadata: Metadata = {
  title: 'StudyPlan Analyzer: help your child remember what they study',
  description:
    'A study plan for every day until the exam, for parents in Nepal. Each topic comes back just before it is forgotten.',
  openGraph: {
    title: 'StudyPlan Analyzer',
    description:
      'Help your child remember what they study. A plan for every day until the exam, with each topic brought back just before it is forgotten.',
    type: 'website',
  },
};

const SM2_SOURCE = 'https://super-memory.com/english/ol/sm2.htm';
const CONTACT_EMAIL = 'studyplananalyzer@gmail.com';

const container = 'mx-auto w-full max-w-[1200px] px-5 sm:px-7 lg:px-10';

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black';

const pillBlack = `inline-flex min-h-[52px] items-center justify-center rounded-full bg-black px-7 text-base font-semibold text-white transition-all duration-200 hover:bg-black/80 active:scale-95 ${focusRing}`;
const pillGrey = `inline-flex min-h-[52px] items-center justify-center rounded-full bg-[#F0EFED] px-7 text-base font-semibold text-black transition-all duration-200 hover:bg-[#E7E5E2] active:scale-95 ${focusRing}`;

const sectionHeading =
  'text-[clamp(1.75rem,6vw,3rem)] font-extrabold leading-[1.1] tracking-[-0.04em]';

// Coloured card, as on the dashboard: white frame, soft shadow, slight tilt
// on wide screens.
const colourCard =
  'rounded-[25px] border-[6px] border-white p-6 shadow-[0_12px_22px_rgba(0,0,0,0.13)] sm:p-7';

const whiteCard =
  'rounded-[32px] bg-white p-5 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-8';

const STEPS = [
  {
    title: 'Add your child.',
    body: 'Choose the class, subjects and exam date. We fill in common subjects and suggest topics, and you can edit all of them.',
    colour: 'bg-[#F7CC46]',
    tilt: 'lg:rotate-[-1.2deg]',
  },
  {
    title: "Get today's plan.",
    body: 'Short sessions on the days you choose, all the way to the exam: at least 45 minutes on a weekday and at least 90 on a weekend day.',
    colour: 'bg-[#9DDFC2]',
    tilt: 'lg:rotate-[0.8deg]',
  },
  {
    title: 'Study, then rate.',
    body: 'Your child studies away from the phone, then marks how it went: Again, Hard, Good or Easy. The plan adjusts.',
    colour: 'bg-[#A5A9F0]',
    tilt: 'lg:rotate-[-0.6deg]',
  },
];

const LEARNERS = [
  {
    title: 'The top scorer',
    body: 'Stay ahead without last-minute cramming.',
    colour: 'bg-[#FCE9B9]',
  },
  {
    title: 'The steady middle',
    body: 'Build a habit that lasts all year.',
    colour: 'bg-[#DDF3E8]',
  },
  {
    title: 'The child who has lost confidence',
    body: 'Start small, win often, and rebuild belief one topic at a time. No labels. No comparisons.',
    colour: 'bg-[#EEF0FF]',
  },
];

const PARENT_POINTS = [
  'A clear plan for today.',
  'Honest ratings from your child after each session.',
  'A weekly report inside the app: study time, sessions finished, how revision went, and what to focus on next.',
  "Missed a day? The session is marked skipped, and it does not count as revision, so your child's schedule is never moved forward for something they did not do.",
];

const ALSO_INSIDE = [
  'Test marks and analysis',
  'Daily challenge',
  'Daily to-do list',
  'More than one child in one account',
];

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Which classes and subjects can I add?',
    a: 'Classes 4 to 10. You add your child’s subjects yourself. Mathematics, Science and English are filled in to start, and we suggest topics for common subjects, including Nepali, Social Studies and Computer Science. You can add, rename or remove any of them.',
  },
  {
    q: 'How much time does my child need each day?',
    a: 'At least 45 minutes on a weekday (Monday to Friday) and at least 90 minutes on a Saturday or Sunday, on the days you choose to study. You can set more time if your child has it.',
  },
  {
    q: 'Does my child need a phone?',
    a: 'Only at the start and the end. Your child opens today’s session on your phone, tablet or computer, puts it away to study, and comes back to mark how it went. Everything happens in your own account; there is no separate sign-in for your child.',
  },
  {
    q: 'What if we miss some days?',
    a: 'The session is marked skipped and does not count as revision, so your child’s schedule is never advanced for something they did not do.',
  },
  {
    q: 'How do I start?',
    a: 'Continue with Google, then add your child, their subjects and the exam date. The app builds the plan for you. You do not need to know the subject yourself.',
  },
];

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

// Google's "G" mark on a white disc, as Google's sign-in buttons show it.
function GoogleIcon() {
  return (
    <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white">
      <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    </span>
  );
}

function RepeatIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="3" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
  );
}

function TargetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

// Public. No sign-in check here: signed-in visitors see this page too, as
// before, and "Sign in" on /login sends them straight on if still signed in.
export default function LandingPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[#FAF9F6] text-black">
      <LandingStyles />

      {/* HEADER */}
      <header className="relative z-30">
        <div className={`${container} flex items-center justify-between gap-4 py-5`}>
          <Link href="/" className={`flex min-w-0 items-center gap-3 rounded-full sm:gap-4 ${focusRing}`}>
            <span
              aria-hidden="true"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black text-lg font-bold text-white sm:h-14 sm:w-14 sm:text-2xl"
            >
              S
            </span>
            <span className="truncate text-base font-bold tracking-tight sm:text-2xl">
              StudyPlan Analyzer
            </span>
          </Link>

          <Link
            href="/login"
            className={`flex h-12 shrink-0 items-center justify-center rounded-full bg-[#F0EFED] px-5 text-base font-semibold transition hover:bg-[#E7E5E2] active:scale-95 sm:h-14 sm:px-6 ${focusRing}`}
          >
            Sign in
          </Link>
        </div>
      </header>

      <main>
        {/* 1. HERO */}
        <section className={`${container} grid items-center gap-10 pb-16 pt-6 sm:pt-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14 lg:pb-24`}>
          <div>
            <h1 className="isolate text-[clamp(2.25rem,9vw,4.25rem)] font-extrabold leading-[1.05] tracking-[-0.045em]">
              Help your child <span className="lp-underline">remember</span> what they study.
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-8 text-black sm:text-xl sm:leading-9">
              StudyPlan Analyzer builds a plan for every day until the exam, and brings each
              topic back just before it is forgotten.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href="/login" className={`${pillBlack} gap-3 pl-3`}>
                <GoogleIcon />
                Continue with Google
              </Link>
              <a href="#how-it-works" className={pillGrey}>
                See how it works
              </a>
            </div>

            <p className="mt-6 max-w-md text-base leading-7 text-[#65615D]">
              Made for parents in Nepal. Sign in with Google. No password to remember.
            </p>
          </div>

          <div className="rounded-[32px] bg-white p-3 shadow-[0_12px_30px_rgba(0,0,0,0.07)] sm:p-6">
            <ClimbIllustration />
          </div>
        </section>

        {/* 2. THE REAL PROBLEM */}
        <section className={`${container} pb-16 lg:pb-24`}>
          <div className={`${colourCard} grid items-center gap-6 bg-[#F2A99F] sm:p-10 lg:grid-cols-2 lg:gap-14 lg:p-14`}>
            <h2 className={sectionHeading}>
              It&apos;s not that they can&apos;t. It&apos;s that they forget.
            </h2>
            <p className="text-lg leading-8 lg:text-xl lg:leading-9">
              Children study hard, and a few weeks later it has slipped away. Soon they think,
              &ldquo;I&apos;m just not good at this&rdquo;, and start avoiding books. That is a
              memory problem. It is not a lack of ability, and it is not laziness.
            </p>
          </div>
        </section>

        {/* 3. THE SOLUTION */}
        <section className={`${container} grid items-center gap-10 pb-16 lg:grid-cols-2 lg:gap-14 lg:pb-24`}>
          <div>
            <h2 className={sectionHeading}>Every topic comes back at the right time.</h2>
            <p className="mt-6 max-w-xl text-lg leading-8">
              The plan schedules each topic again just before your child is likely to forget
              it. Topics that feel easy come back later. Topics that feel hard come back
              sooner. Remembering brings confidence. Confidence brings motivation.
            </p>
          </div>
          <div className={whiteCard}>
            <ForgettingCurve />
          </div>
        </section>

        {/* 4. HOW IT WORKS */}
        <section id="how-it-works" className={`${container} scroll-mt-6 pb-16 lg:pb-24`}>
          <h2 className={sectionHeading}>How it works</h2>

          <ol className="mt-8 grid gap-5 md:grid-cols-3 lg:gap-6">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className={`${colourCard} ${step.colour} ${step.tilt} transition-transform duration-200 hover:rotate-0`}
              >
                <span
                  aria-hidden="true"
                  className="flex h-12 w-12 items-center justify-center rounded-full bg-black text-xl font-black text-white"
                >
                  {i + 1}
                </span>
                <h3 className="mt-6 text-2xl font-black tracking-tight">{step.title}</h3>
                <p className="mt-3 text-base leading-7">{step.body}</p>
              </li>
            ))}
          </ol>

          <div className={`${whiteCard} mt-8 lg:mt-10`}>
            <div className="mb-6 flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[#F0EFED] px-4 py-1.5 text-base font-bold">
                Example
              </span>
              <p className="text-base text-[#65615D]">Four weeks of one topic, leading to the exam.</p>
            </div>
            <div className="mx-auto max-w-xl">
              <RevisionCalendar />
            </div>
          </div>
        </section>

        {/* 5. WHY IT'S DIFFERENT */}
        <section className={`${container} pb-16 lg:pb-24`}>
          <h2 className={sectionHeading}>Why it&apos;s different</h2>

          <div className="mt-8 grid gap-5 md:grid-cols-3 lg:gap-6">
            <div className={whiteCard}>
              <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#9DDFC2]">
                <RepeatIcon />
              </div>
              <h3 className="mt-5 text-xl font-bold tracking-tight">Built on SM-2.</h3>
              <p className="mt-2 text-base leading-7 text-[#65615D]">
                A spaced-repetition method published by Piotr Wozniak in 1990 and used in many
                revision tools. We customised it for school exams.
              </p>
              <a
                href={SM2_SOURCE}
                target="_blank"
                rel="noopener noreferrer"
                className={`mt-4 inline-flex min-h-[44px] items-center rounded-full font-semibold underline decoration-[#F7CC46] decoration-[3px] underline-offset-4 hover:decoration-black ${focusRing}`}
              >
                Read the SM-2 source
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </div>

            <div className={whiteCard}>
              <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#F7CC46]">
                <CalendarIcon />
              </div>
              <h3 className="mt-5 text-xl font-bold tracking-tight">Matched to the exam date.</h3>
              <p className="mt-2 text-base leading-7 text-[#65615D]">
                The plan runs to the exam day, and gaps between revisions never stretch past
                the days that are left. You can also end it a week early, to keep the last
                days for final review.
              </p>
            </div>

            <div className={whiteCard}>
              <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#A5A9F0]">
                <TargetIcon />
              </div>
              <h3 className="mt-5 text-xl font-bold tracking-tight">Weak topics first.</h3>
              <p className="mt-2 text-base leading-7 text-[#65615D]">
                Test marks and your child&apos;s own confidence on each topic decide what gets
                time first, and no day gets too many hard topics.
              </p>
            </div>
          </div>

          <p className="mt-6 text-base leading-7 text-[#65615D]">
            To get you started, Mathematics, Science and English are filled in, and topics are
            suggested for common subjects, Nepali included. You can change all of it.
          </p>
        </section>

        {/* 6. FOR EVERY CHILD */}
        <section className={`${container} pb-16 lg:pb-24`}>
          <h2 className={sectionHeading}>A plan for every kind of learner.</h2>

          <div className="mt-8 grid gap-5 md:grid-cols-3 lg:gap-6">
            {LEARNERS.map((l) => (
              <div key={l.title} className={`rounded-[25px] p-6 sm:p-7 ${l.colour}`}>
                <h3 className="text-xl font-bold tracking-tight">{l.title}</h3>
                <p className="mt-2 text-base leading-7">{l.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 7. WHAT PARENTS WILL NOTICE */}
        <section className={`${container} pb-16 lg:pb-24`}>
          <div className={`${whiteCard} sm:p-10 lg:p-14`}>
            <h2 className={sectionHeading}>
              Less &ldquo;did you study?&rdquo;, more &ldquo;how did it go?&rdquo;
            </h2>

            <ul className="mt-8 grid gap-5 lg:grid-cols-2 lg:gap-x-10">
              {PARENT_POINTS.map((p) => (
                <li key={p} className="flex gap-4 text-base leading-7 sm:text-lg sm:leading-8">
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#9DDFC2]">
                    <CheckIcon />
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>

            <div className="mt-10 border-t border-black/10 pt-8">
              <p className="text-base font-semibold">Also in the app</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {ALSO_INSIDE.map((item) => (
                  <li key={item} className="rounded-full bg-[#F0EFED] px-4 py-2 text-base">
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-10 text-xl font-bold leading-8 tracking-tight sm:text-2xl">
              Real results come from small habits repeated. This keeps them going.
            </p>
          </div>
        </section>

        {/* 8. TRUST */}
        <section className={`${container} pb-16 lg:pb-24`} aria-labelledby="trust-heading">
          <div className="grid gap-5 rounded-[32px] bg-[#F0EFED] px-6 py-8 sm:px-10 lg:grid-cols-2 lg:items-center lg:gap-x-14 lg:py-10">
            <div>
              <h2 id="trust-heading" className="text-2xl font-extrabold tracking-tight lg:text-3xl">
                Your family&apos;s information stays yours.
              </h2>
              <Link
                href="/privacy"
                className={`mt-3 inline-flex min-h-[44px] items-center rounded-full font-semibold underline underline-offset-4 ${focusRing}`}
              >
                Read our Privacy Policy
              </Link>
            </div>
            <ul className="flex flex-col gap-3 text-base leading-7 lg:text-lg">
              <li className="flex items-center gap-2">
                <CheckIcon /> No ads.
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon /> We do not sell your information.
              </li>
              <li className="flex items-center gap-2">
                <CheckIcon /> The app sends no marketing email.
              </li>
            </ul>
          </div>
        </section>

        {/* 9. FAQ */}
        <section className={`${container} grid gap-8 pb-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-14 lg:pb-24`}>
          <div>
            <h2 className={sectionHeading}>Questions parents ask</h2>
            <p className="mt-4 text-base leading-7 text-[#65615D] lg:text-lg lg:leading-8">
              Short answers to what parents want to know before they start.
            </p>
          </div>

          <div className="flex flex-col gap-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-[25px] bg-white shadow-[0_6px_18px_rgba(0,0,0,0.05)]">
                <summary
                  className={`flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 rounded-[25px] px-6 py-4 text-lg font-bold [&::-webkit-details-marker]:hidden ${focusRing}`}
                >
                  {f.q}
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#F0EFED] text-xl font-normal transition-transform duration-200 group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <p className="px-6 pb-6 text-base leading-7 text-[#65615D]">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* 10. FINAL CTA */}
        <section className={`${container} pb-16 lg:pb-24`}>
          <div className={`${colourCard} bg-[#F7CC46] text-center sm:p-12 lg:p-16`}>
            <h2 className={`${sectionHeading} mx-auto max-w-3xl`}>
              The exam date is already on the calendar.
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-8">
              Give your child a plan for every day until it.
            </p>
            <Link href="/login" className={`${pillBlack} mt-8 gap-3 pl-3`}>
              <GoogleIcon />
              Continue with Google
            </Link>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-black/10">
        <div className={`${container} flex flex-col gap-4 py-8 text-base text-[#65615D] md:flex-row md:flex-wrap md:items-center md:justify-between`}>
          <span className="font-semibold text-black">StudyPlan Analyzer</span>
          <nav aria-label="Footer" className="flex flex-col gap-1 md:flex-row md:flex-wrap md:items-center md:gap-6">
            <Link href="/privacy" className={`inline-flex min-h-[44px] items-center rounded-full hover:text-black ${focusRing}`}>
              Privacy Policy
            </Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className={`inline-flex min-h-[44px] items-center break-all rounded-full hover:text-black ${focusRing}`}>
              {CONTACT_EMAIL}
            </a>
            <a
              href={SM2_SOURCE}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-[44px] items-center rounded-full hover:text-black ${focusRing}`}
            >
              Source: SuperMemo SM-2 algorithm, P. A. Wozniak, 1990
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
