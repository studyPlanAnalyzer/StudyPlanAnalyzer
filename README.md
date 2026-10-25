# StudyPlan Analyzer

Turn your child's exam results into a clear study plan until the next exam.
Upload marks, see weak topics, get a day-by-day plan that adapts automatically.

Built for parents in Nepal and similar markets who want clarity on their
child's academic performance and a realistic, research-backed study schedule.

## Tech stack

- **Framework:** Next.js 14 (App Router), TypeScript
- **Styling:** Tailwind CSS v4
- **Database:** Neon Postgres (serverless)
- **ORM:** Drizzle ORM
- **Auth:** JWT in httpOnly cookies (`jsonwebtoken` + `bcryptjs`)
- **Validation:** Zod on every API route

## Project structure

```
/app
  /api            API route handlers (auth, students, exams, subjects,
                  assessments, marks, topics, analysis, plans, sessions)
  /(auth)         Login / signup pages
  /(dashboard)    Dashboard page
  /students/[id]  Analysis, plan, today, week, settings pages
  /onboarding     6-step onboarding flow
  page.tsx        Landing page
/lib
  /db             Drizzle schema + connection
  /auth           JWT utilities + getUserFromRequest middleware
  /utils          Spaced-repetition engine, plan generator, date helpers
/components
  /ui             Button, Input, Card, Badge, Skeleton, EmptyState
  /onboarding     Step indicator
  /plan           Weekly plan view
  /session        Session completion card
middleware.ts     Route-protection middleware (checks cookie presence)
```

## 1. Set up Neon Postgres

1. Create a free project at [neon.tech](https://neon.tech).
2. In the Neon dashboard, copy the **pooled connection string** (it looks like
   `postgresql://user:password@ep-xxxx.neon.tech/neondb?sslmode=require`).

## 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```
DATABASE_URL="postgresql://user:password@host/neondb?sslmode=require"
JWT_SECRET="generate-a-long-random-string"
NEXT_PUBLIC_APP_NAME="StudyPlan Analyzer"
```

Generate a strong `JWT_SECRET` with:

```bash
openssl rand -base64 32
```

**Never** commit `.env` or reuse the placeholder secret in production.

## 3. Install dependencies and run migrations

```bash
npm install
npx drizzle-kit generate   # creates SQL migration files in /drizzle
npx drizzle-kit migrate    # applies them to your Neon database
```

## 4. Run the app

```bash
npm run dev
```

Visit `http://localhost:3000`.

## End-to-end flow

1. **Sign up** at `/signup` — creates a parent account, sets the `auth-token`
   httpOnly cookie.
2. **Onboarding** (`/onboarding`) — add a child, set study availability, the
   next exam, subjects, marks, and topics in six steps.
3. **Analysis** (`/students/[id]/analysis`) — see subject strengths, trends,
   and the top 3 priority topics. Click **Generate plan**.
4. **Plan** (`/students/[id]/plan`) — a week-by-week schedule of learn,
   practice, review, and mock sessions.
5. **Today** (`/students/[id]/today`) — complete today's sessions, rate them
   Again/Hard/Good/Easy, optionally record accuracy. This feeds the
   spaced-repetition engine and reschedules that topic's future reviews.
6. **Week summary** (`/students/[id]/week/[n]`) — planned vs. completed,
   subject-wise progress, next week's preview, and a **Regenerate plan**
   button.
7. **Settings** (`/students/[id]/settings`) — adjust study days, daily
   minutes, or the exam date, then regenerate the plan around the new
   constraints.

## How the study plan is generated

`lib/utils/plan-generator.ts` implements the scheduling engine:

1. **Available time** — walks every day from today to the exam date, keeping
   only days in the student's `studyDays`, and sums school-day vs.
   holiday-day minutes.
2. **Subject priority** — `weakness (100 - latest%) × examWeight multiplier
   (0.8 / 1.0 / 1.5) × trendFactor` (1.3 if declining ≥3 points, 0.85 if
   improving ≥3 points, else 1.0).
3. **Topic priority** — `subjectPriority × (difficultyRating / 3) ×
   masteryDiscount`.
4. **Tiering** — topics are ranked by priority and split so the top ~60% get
   the "weak" treatment, the next ~25% "medium", and the rest "strong",
   mirroring the 60/25/15 time budget.
5. **Session templates** — each tier has its own learn + spaced-review
   cadence (weak: reviews at +1/+3/+7/+14 days; medium: +2/+7; strong: +5),
   inspired by spaced-repetition research.
6. **Calendar placement** — sessions are placed greedily in priority order,
   respecting each day's minute cap and a 2-hard-topics-per-day limit. If the
   calendar runs out of room, the lowest-priority ("strong") topics are the
   ones that lose sessions.

`lib/utils/spaced-repetition.ts` implements the per-topic SM-2–style update
that runs every time a session is marked complete, adjusting the ease
factor, interval, and next review date based on the 1–4 rating and optional
accuracy score.

## API reference

All endpoints are under `/api`. Protected endpoints require the `auth-token`
httpOnly cookie (set automatically by login/signup) and return `401` if
missing or invalid.

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/signup` | Create account, set cookie |
| POST | `/api/auth/login` | Verify credentials, set cookie |
| POST | `/api/auth/logout` | Clear cookie |
| GET | `/api/auth/me` | Current user, or 401 |

### Students
| Method | Path | Description |
|---|---|---|
| POST | `/api/students` | Create a child |
| GET | `/api/students` | List the parent's children |
| GET | `/api/students/[id]` | Full detail: subjects, exams, assessments, topics, latest plan |
| PUT | `/api/students/[id]` | Update study preferences |

### Exams
| Method | Path | Description |
|---|---|---|
| POST | `/api/exams` | Create an exam |
| GET | `/api/exams?studentId=` | List exams for a student |
| PUT | `/api/exams/[id]` | Update an exam's name/date |

### Subjects, assessments, marks, topics
| Method | Path | Description |
|---|---|---|
| POST | `/api/subjects` | Create a subject |
| GET | `/api/subjects?studentId=` | List subjects |
| POST | `/api/assessments` | Create an assessment (exam instance) |
| GET | `/api/assessments?studentId=` | List assessments |
| POST | `/api/marks` | Record marks for a subject in an assessment |
| POST | `/api/topics` | Bulk-create topics for a subject (initializes spaced-repetition state) |
| GET | `/api/topics?subjectId=` | List topics with spaced state |
| PUT | `/api/topics/[id]` | Update a topic's difficulty/mastery |

### Analysis
| Method | Path | Description |
|---|---|---|
| GET | `/api/analysis/[studentId]` | Subject percentages, strength levels, trends, topic priorities |

### Plans & sessions
| Method | Path | Description |
|---|---|---|
| POST | `/api/plans/generate` | Generate a full plan for a student + exam |
| GET | `/api/plans/[planId]` | Plan detail, sessions grouped by week/day |
| POST | `/api/plans/[planId]/regenerate` | Keep completed sessions, reschedule the rest |
| PUT | `/api/sessions/[id]` | Mark a session completed/partly_completed/skipped; triggers spaced-repetition update |

## Deploying to Vercel

1. Push this repository to GitHub/GitLab/Bitbucket.
2. In [Vercel](https://vercel.com), **Import Project** from your repo.
3. Under **Environment Variables**, add `DATABASE_URL`, `JWT_SECRET`, and
   `NEXT_PUBLIC_APP_NAME` (same values as your `.env`).
4. Deploy. Vercel runs `npm install` and `next build` automatically.
5. Run migrations against your production database once, from your local
   machine (pointed at the production `DATABASE_URL`):
   ```bash
   npx drizzle-kit migrate
   ```
6. Because Neon is serverless HTTP-based, no connection pooling
   configuration is needed for Vercel's serverless functions.

## Notes

- Passwords are hashed with bcrypt (10 salt rounds); JWTs are stored only in
  httpOnly cookies, never in `localStorage`.
- All API input is validated with Zod; all database access goes through
  Drizzle's parameterized query builder.
- The UI is built mobile-first and structured for future Nepali translation
  (`preferredLanguage` field on the user, `'en' | 'ne'`), though only English
  copy ships today.

## Daily Brain Challenge (add-on module)

A daily, low-stakes 3-question quiz (1 IQ & Logic, 1 Science, 1 General
Knowledge) for students in Grades 4–10, built as a habit-forming game — not
an exam, and never framed as measuring intelligence.

### Migration

This module adds an `isAdmin` column to `users` and four new tables
(`questions`, `daily_quizzes`, `daily_quiz_questions`, `quiz_attempts`).
After pulling this code, run:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

### Making yourself an admin

There's deliberately no self-serve UI for this. Run once, against your Neon
database (via the Neon SQL console or `psql`):

```sql
UPDATE users SET is_admin = true WHERE email = 'your-email@example.com';
```

Admin pages (`/admin/questions`, `/admin/daily-quiz`, `/admin/analytics`)
check `isAdmin` on load and show an "Admins only" screen otherwise.

### Question import format

Questions are drafted **offline** (e.g. asking Claude/Cursor to generate a
batch in this shape) and imported via `/admin/questions` → **Import
questions**, either as pasted JSON or an uploaded CSV with matching column
headers:

```
category, gradeGroup, difficulty, questionText, option1, option2, option3, option4, correctAnswer, explanation
```

- `category`: `IQ_LOGIC` | `SCIENCE` | `GENERAL_KNOWLEDGE`
- `gradeGroup`: `GROUP_4_7` | `GROUP_8_10`
- `difficulty`: `easy` | `medium` | `hard` (optional, defaults to `medium`)
- `correctAnswer` must exactly match one of `option1`–`option4`
- `explanation` is optional

Every imported row lands as `status = PENDING` — nothing is visible to
students, or even selectable for a daily quiz, until an admin approves it.
See `sample-questions.json` in the project root for a ready-to-import
example batch (9 questions spanning both grade groups and all 3 categories).

### Day-to-day workflow

1. Import a batch of candidate questions (JSON/CSV) at `/admin/questions`.
2. Approve/edit/reject them individually or in bulk.
3. Go to `/admin/daily-quiz` (redirects to tomorrow's date) and pick one
   approved question per category for each grade group, then **Publish**.
4. Published quizzes are locked — to change one, **Unpublish** first (this
   is blocked once any student has already attempted it), edit the
   selection, and republish.
5. Parents see a child's Daily Brain Challenge at
   `/students/[id]/daily-challenge` (linked from the Dashboard, Plan page
   nav, and Analysis page) once that child's grade falls in 4–10. One
   attempt per student per day; correct answers are withheld until after
   submission and computed server-side.
6. `/admin/analytics` shows daily participation counts and average scores
   per grade group; a small stats card on each student's Analysis page shows
   their own 7-day/30-day completion count and average score.

## Plan generation engine — design notes (major revision)

The scheduling engine (`lib/utils/plan-generator.ts`) and its callers
(`/api/plans/generate`, `/api/plans/[planId]/regenerate`) were substantially
reworked after a code review surfaced a severe bug and several structural
issues. This section documents what changed and why, plus what's
deliberately deferred.

### Migration required

One column was added: `study_plans.unscheduled_topic_ids`. Run:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

### What changed

1. **Topics with real review history are now scheduled from their actual
   spaced-repetition state, not replayed through a static template.**
   Previously, regenerating a plan excluded any topic with *any* completed
   session from future scheduling — meaning the moment a student finished
   just the "learn" step, all of that topic's remaining spaced reviews were
   silently deleted and never rebuilt. Now, a topic with review history
   (`topic_spaced_state.repetitionCount > 0`) is scheduled a single "next
   due review" session anchored to its real `nextReviewDate`, while a
   never-studied topic still gets the full learn + spaced-review chain.

2. **Tiering (weak/medium/strong) is now based on absolute performance, not
   forced rank.** Previously every plan always carved off the top 60% of
   topics by rank as "weak," regardless of how the student was actually
   doing — a 95%-average student's plan still forced 60% of topics into the
   most intensive tier. Tiers are now assigned from the subject's real
   percent score, using the same weak/medium/strong thresholds as the
   Analysis page, with small nudges for unusually hard or already-mastered
   individual topics.

3. **The plan's reported weak/medium/strong split is now computed from what
   was actually scheduled**, not a hardcoded 60/25/15 shown regardless of
   outcome.

4. **A topic that genuinely can't fit anywhere on the calendar is now
   surfaced on the Plan page** as an honest warning, instead of silently
   vanishing with no explanation.

5. **A single small class test no longer swings a subject's priority as
   hard as a full term exam.** The baseline weakness score blends the last
   up to 3 marks, weighted by how comprehensive each one was and mildly by
   recency — a /10 quiz no longer counts the same as a /100 exam. Trend
   direction (declining/improving) still compares the two most recent raw
   marks, since a genuine recent move is meaningful even from a small test.

6. **Marks used for plan generation are now scoped to the current exam
   cycle** (or untagged legacy marks), so a confidence tag or trend swing
   from a already-concluded exam cycle can't keep driving today's plan. The
   Analysis page's historical view is intentionally unaffected — it still
   shows the full cross-cycle history.

7. **First-time plan generation now excludes already-mastered topics too**
   (previously only `regenerate` did this), so starting a new exam cycle
   doesn't re-teach material the student mastered last term.

8. **Idempotency guard on generate**: calling generate twice for the same
   exam now returns a 409 pointing at regenerate, instead of silently
   creating a duplicate plan.

9. **Settings' exam-date edit now requires a future date**, matching every
   other exam-date entry point in the app.

### Regression tests

`scripts/test-plan-generator.ts` exercises the generator directly (no
database needed) against the exact scenarios above — in particular, the
in-progress-topic bug and the tiering bug. Run with:

```bash
npm run test:plan-generator
```

This adds one new dev dependency, `tsx`, to run the TypeScript test file
directly.

### Known, deliberately deferred issues

- **No database transactions.** Multi-step delete/insert/update sequences
  in generate/regenerate aren't wrapped in a transaction. The Neon HTTP
  driver's transaction support is limited and couldn't be verified against
  a live database in this environment, so no transaction wrapper was added
  rather than shipping one unverified. A crash mid-sequence could leave a
  plan half-rebuilt; this is a known risk, not a fixed one.
- **No history view for past exam cycles' plans.** Old plans aren't deleted
  when a new cycle starts (by design — the data isn't lost), but there's no
  UI to browse them. This is a missing feature, not a bug.
- **"Learn within first 3 days"** isn't separately enforced as a hard rule.
  In practice, the highest-priority topics are processed first and claim
  the earliest available slots, which achieves the same outcome for the
  topics that matter most; a strict 3-day cutoff risked causing *more*
  silently-unscheduled topics for marginal benefit.
