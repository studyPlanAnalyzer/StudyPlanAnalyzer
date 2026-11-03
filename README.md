# StudyPlan Analyzer

Turn your child's exam results into a clear study plan until the next exam.
Log marks, see weak subjects and topics, and get a day-by-day plan that adapts
as the child studies.

Built for parents in Nepal (grades 4–10).

## Tech stack

- **Framework:** Next.js 16 (App Router), React 19, TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** Postgres (Neon), through `pg` and Drizzle ORM
- **Sign-in:** Google only (Google Identity Services), with the app's own
  short-lived access token and rotating refresh token in httpOnly cookies
- **Validation:** Zod on every API route (shared rules in `lib/validation.ts`)
- **Hosting:** Vercel

## Project structure

```
app/
  api/              API routes (one folder per resource)
  (auth)/login      Sign-in ("Continue with Google"); /signup redirects here
  (dashboard)/      Parent dashboard
  onboarding/       First-time setup of a child
  students/[id]/    A child's pages: analysis, plan, today, tests, subjects,
                    settings, new exam cycle, new academic session, reports, pay
  admin/            Admin pages: payments, schools, question bank, daily quiz,
                    analytics, weekly report preview
lib/
  auth/             Google token checks, sessions, cookies, request auth
  billing/          Prices, billing states, the payment guard
  db/               Drizzle schema and connection
  reports/          Weekly reports (built on demand)
  utils/            Plan generator, spaced repetition, dates, scoring
  validation.ts     Shared request rules (dates, study days, minutes, grade…)
components/         UI
proxy.ts            CORS/CSRF checks for the API; sends signed-out visitors to /login
drizzle/            SQL migrations
tests/              Automated tests (node:test via tsx)
scripts/            Plan generator regression script
```

## Setup

### 1. Database (Neon)

Create a Neon project. Neon gives two connection strings:

- **Pooled** (hostname contains `-pooler`): use this for the app
  (`DATABASE_URL` in `.env` and on Vercel).
- **Direct** (no `-pooler`): use this for running migrations.

Use `sslmode=verify-full` in both.

### 2. Environment variables

```bash
cp .env.example .env
```

| Variable | Needed | What it is |
|---|---|---|
| `DATABASE_URL` | yes | Pooled Neon connection string |
| `JWT_SECRET` | yes | Signs access tokens. At least 256 bits: `openssl rand -base64 32`. Production refuses the example value. |
| `GOOGLE_CLIENT_ID` | yes | OAuth client ID (Google Cloud Console → Credentials, type "Web application"). The server checks every Google ID token against it. |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | yes | The same value, for the sign-in button |
| `ADMIN_EMAILS` | for admins | Comma-separated Google emails that are admins (case-insensitive). Checked on every request: removing an email takes effect immediately. |
| `NEXT_PUBLIC_APP_NAME` | no | Display name |
| `BILLING_ENABLED` | no | `false` switches billing off (every child usable) for development |
| `ALLOWED_ORIGINS` | no | Other origins allowed to call the API with credentials |
| `DB_SSL_MODE` | no | `disable` only for a local Postgres without TLS |
| `AUTH_COOKIE_INSECURE` | no | Development only: `true` if your browser refuses Secure cookies on `http://localhost` |

### 3. Install and migrate

```bash
npm install
DATABASE_URL="<direct connection string>" npm run db:migrate
```

After changing `lib/db/schema.ts`, create a migration with
`npm run db:generate` and commit the files it writes in `drizzle/`.

### 4. Run

```bash
TZ=UTC npm run dev
```

Open http://localhost:3000. `TZ=UTC` makes your machine store timestamps the
way the server does in production (Vercel runs in UTC). Without it, a machine
set to Nepal time stores Nepal wall-clock times, which can shift report weeks
in local testing.

## Dates and time

- **Every "today" is the day in Nepal** (Asia/Kathmandu, UTC+5:45): today's
  sessions, the daily challenge, to-dos and streaks, missed-session catch-up,
  "the exam is over", report weeks. The server and every browser agree,
  whatever their own time zone. All of it goes through `lib/utils/date-utils.ts`
  (`appToday`, `todayKey`, `appDay`, `appDayStart`, `daysUntil`).
- Dates use the Gregorian calendar (not Bikram Sambat).
- Calendar dates are shown with `formatDay` and stored moments (paid until,
  submitted at) with `formatInstantDay`/`formatInstantDateTime`, so every
  device shows the same date.
- Dates in requests must be real days (`2027-02-30` is refused).

## Rules and limits

| What | Rule |
|---|---|
| Grade | 4 to 10 |
| School name | At least 3 characters |
| Exam date | After today and at most 1 year ahead |
| Study days | `Sun`…`Sat` (duplicates are removed) |
| Daily study minutes | School days 45–120, weekends/holidays 90–120 (Mon–Fri are school days) |
| Subjects | No two subjects may be the same subject: "Math", "Maths" and "Mathematics" are one (`lib/subject-name.ts`) |
| Exams | One current (primary) exam per child. A new exam cycle or academic session starts only after it is over. |
| Plans | One plan per exam (enforced by the database) |
| Full marks | At most 100 (subjects and tests) |
| Test dates | Today or earlier (Nepal time), never in the future |
| Marks in one test | Per subject, either one whole-subject mark or one mark per topic (no topic twice), never both. A second result goes in another test. |

## Main flows

1. **Sign in** with Google at `/login`. The first sign-in creates the account.
2. **Onboarding** (`/onboarding`): the child, study days and minutes, the next
   exam, subjects, the latest marks (or an estimated confidence per subject if
   there are no exams yet), and topics.
3. **Payment** (`/students/[id]/pay`): see Billing below.
4. **Analysis**: subject strengths, trends and the top priority topics, then
   **Generate plan** (optionally keeping the last 7 days before the exam free).
5. **Plan / Today**: complete sessions and rate them Again/Hard/Good/Easy. The
   rating updates the topic's spaced-repetition state, and the plan is rebuilt
   once the day's required sessions are done.
6. **Log a test / Tests**: record marks for the whole subject or for specific
   topics, with a confidence level; edit or delete them later.
7. **Subjects**: add, rename, archive or delete subjects, topics and
   sub-topics. Saving rebuilds the plan.
8. **Settings**: study days, minutes and the exam date. Saving rebuilds the plan.
9. **New exam cycle** (after the exam): the new exam plus the marksheet.
   **New academic session**: starts over with new subjects.
10. **Weekly reports**: one per active week, made when the parent opens the app.

## How plans are built

`lib/utils/plan-generator.ts`:

- **Subject priority** = weakness (100 − a blend of the last 3 whole-subject
  marks, bigger tests counting more) × exam weight (0.8 / 1.0 / 1.5) × trend
  (1.3 after a drop of 3+ points, 0.85 after a rise of 3+), with a boost when
  the latest confidence was low. A subject with no marks uses its estimated
  confidence (low 35%, medium 50%, high 85%).
- **Topics are judged at the lowest level**: sub-topics where a topic has them,
  otherwise the topic. A topic with its own marks is scored from them (and its
  own confidence); one without uses the subject's priority plus its difficulty.
- **Tiers** (weak < 50% ≤ medium < 75% ≤ strong) set session lengths.
- New topics get a learn session and one review the next study day; topics
  already being reviewed get one review on their due date. SM-2
  (`lib/utils/spaced-repetition.ts`) decides later dates, capped by the time
  left before the exam.
- Sessions are placed within each day's minutes, at most two hard topics a day,
  never on the exam day. Topics that can't fit are listed on the Plan page.
- Plans use marks from the current exam cycle only; Analysis shows all history.

**Topic tests and the review schedule** (`lib/test-trend.ts`): a topic's newest
test is compared with its earlier ones; a drop makes its reviews more frequent
(and a drop of 20+ points restarts them), a rise relaxes them a little. Moving a
test's date redoes these in the new order.

**Topics with sub-topics**: when a topic gets its first sub-topic, its old test
marks stay linked to it as history and its adjustments are undone; the
sub-topics are judged on their own. If all its sub-topics are deleted, its old
marks count for it again. Deleting a topic deletes the marks that covered only
that topic.

## Billing

`lib/billing/`. Payment is manual:

- **QR**: the parent picks Monthly (Rs 250 first child, Rs 200 each other) or
  Term, 3 months (Rs 600 / Rs 500), pays the QR in `public/payment-qr.png` with
  the shown remark code, and submits the transaction ID. The child stays
  usable until an admin verifies or rejects it at `/admin/payments`, however
  long that takes; meanwhile the parent can't start another payment. The
  queue marks payments waiting over 24 hours, and over 48 hours as overdue
  (also counted on the admin dashboard). A rejected payment puts the child
  back as it was before.
- **School code**: an admin creates a school at `/admin/schools` and extends
  its paid period; parents enter the school's reference code.
- After a paid period ends the child still works for 2 grace days, then locks.
  Locked children get `402 PAYMENT_REQUIRED` from every data route.

## Daily Brain Challenge

A daily quiz with one question from each of five categories (IQ & logic,
science, general knowledge, technology & AI, mathematics) for each grade group
(4–7 and 8–10).

1. **Import** questions at `/admin/questions` as JSON or CSV with columns
   `category, gradeGroup, difficulty, questionText, option1, option2, option3,
   option4, correctAnswer, explanation`. `category` is one of `IQ_LOGIC`,
   `SCIENCE`, `GENERAL_KNOWLEDGE`, `TECH_AI`, `MATHEMATICS`; `gradeGroup` is
   `GROUP_4_7` or `GROUP_8_10`; `correctAnswer` must match one option exactly.
   Imports arrive as PENDING. `sample-questions.json` has 9 examples covering
   the first three categories.
2. **Approve** them (one by one or in bulk).
3. **Publish** at `/admin/daily-quiz` (opens tomorrow's date; today or later
   only): pick one approved question per category, per grade group.
4. To change a published quiz, **unpublish** it first (only possible before any
   student has attempted it). The options and answer of a question in a
   published quiz can't be edited; its wording can.

Each question's "times used" and "last used" are counted from the published
quizzes it is in; a question rests 7 days after its quiz date before it is
suggested again.

## Account

`/account` (linked from the dashboard):

- **Signed-in devices**: every live session with its browser and device type
  (from the User-Agent at sign-in) and sign-in time. The parent can sign out
  any device, or all others; that device is signed out on its next request.
- **Delete my account and data**: the parent gives a reason and can cancel
  while it waits. An admin carries it out at `/admin/deletions` within 24
  hours (or declines it with a note the parent sees). Deleting removes the
  account, all children and their data, and all sign-ins. Payment records are
  kept for the accounts with the parent, child and school names removed. The
  request itself keeps only the reason and dates.

## Admins

There is no sign-up for admins: list their Google emails in `ADMIN_EMAILS` (on
Vercel too). Admin pages show "Admins only" to everyone else, and every
`/api/admin/*` route answers 403.

## Tests

```bash
npm test                     # everything; database tests are skipped without a test database
npm run test:plan-generator  # plan generator scenarios
```

Database tests need a disposable Postgres database whose name contains `test`
(it is wiped and rebuilt from the migrations on every run):

```bash
createdb studyplan_test
TZ=UTC TEST_DATABASE_URL=postgresql://localhost:5432/studyplan_test npm test
```

## Deploying (Vercel)

1. Import the repository in Vercel and set the environment variables above
   (pooled `DATABASE_URL`, `JWT_SECRET`, both Google client IDs,
   `ADMIN_EMAILS`).
2. Before deploying code that adds a migration, run it against production with
   the direct connection string:
   `DATABASE_URL="<direct production string>" npm run db:migrate`.
3. Pushing to `main` deploys; pull requests get preview deployments.

The app is meant to run on Vercel: sign-in and refresh rate limits use the
client IP from `x-real-ip`, which Vercel sets itself. Elsewhere, put the app
behind a proxy that sets that header (or `x-forwarded-for`) and strips any value
a client sends.
