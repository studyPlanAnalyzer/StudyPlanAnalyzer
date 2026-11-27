/**
 * Adds a test child with Grade 10 (SEE) subjects to YOUR account, for trying
 * the plan and revision days on localhost. It writes to the database in .env
 * (DATABASE_URL), so it is a dry run unless --confirm is given.
 *
 *   npx tsx scripts/seed-test-child.ts --parent-email you@gmail.com
 *   npx tsx scripts/seed-test-child.ts --parent-email you@gmail.com --confirm
 *   npx tsx scripts/seed-test-child.ts --parent-email you@gmail.com --mode joiner --confirm
 *   npx tsx scripts/seed-test-child.ts --parent-email you@gmail.com --remove --confirm
 *
 * Options:
 *   --mode first-term  (default) the First Terminal Examination: the year is
 *                      just starting, nothing from earlier exams yet.
 *   --mode joiner      a family joining for the Third Terminal Examination:
 *                      most of the syllabus was studied for the First and
 *                      Second Terminal Examinations (revised on weekends).
 *   --taught N         this exam's topics already taught (default 8). They
 *                      start 4 a day from tomorrow, like onboarding does.
 *   --exam-days N      exam N days from today (default 60). "Today" follows
 *                      the dev clock's .dev-today file if one is set.
 *   --remove           delete the test child and everything under it instead.
 *
 * The child is created the way onboarding creates one (child, exam, subjects,
 * topics tagged with their exam, the study plan) in one transaction.
 * Sign in with Google as that parent first, so the account exists.
 */
import 'dotenv/config';
import fs from 'node:fs';
import { and, eq } from 'drizzle-orm';
import { SEE_GRADE_10 } from './seed/see-grade10';
import { appToday, addDays, fromDateString, isRealDateString, toDateString } from '../lib/utils/date-utils';
import { ALL_DAYS, sm2Days, spreadLearnFrom } from '../lib/utils/revision-days';

const CHILD_NAME = 'SEE Test Child';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}
const flag = (name: string) => process.argv.includes(`--${name}`);

function today(): Date {
  try {
    const fake = fs.readFileSync('.dev-today', 'utf8').trim();
    if (isRealDateString(fake)) return fromDateString(fake);
  } catch {
    // no dev clock set
  }
  return appToday();
}

/** Every top-level topic, taken a subject at a time in turn (as a school
 * year moves through all subjects at once). */
function syllabusInOrder() {
  const out: { subject: number; topic: (typeof SEE_GRADE_10)[number]['topics'][number] }[] = [];
  const longest = Math.max(...SEE_GRADE_10.map((s) => s.topics.length));
  for (let k = 0; k < longest; k++)
    SEE_GRADE_10.forEach((s, i) => {
      if (s.topics[k]) out.push({ subject: i, topic: s.topics[k] });
    });
  return out;
}

async function main() {
  const email = arg('parent-email');
  if (!email) {
    console.error('Usage: npx tsx scripts/seed-test-child.ts --parent-email you@gmail.com [--confirm]');
    process.exit(1);
  }
  const examDays = Number(arg('exam-days') ?? 60);
  if (!Number.isInteger(examDays) || examDays < 2 || examDays > 365) {
    console.error('--exam-days must be a whole number from 2 to 365');
    process.exit(1);
  }
  const remove = flag('remove');
  const confirm = flag('confirm');
  const mode = arg('mode') ?? 'first-term';
  if (mode !== 'first-term' && mode !== 'joiner') {
    console.error('--mode must be first-term or joiner');
    process.exit(1);
  }
  const taughtCount = Number(arg('taught') ?? 8);
  if (!Number.isInteger(taughtCount) || taughtCount < 0) {
    console.error('--taught must be a whole number');
    process.exit(1);
  }

  // Imported here, after dotenv has loaded DATABASE_URL.
  const { db, schema } = await import('../lib/db');
  const { insertTopicRows } = await import('../lib/topic-leaves');
  const { createPlanForExam } = await import('../lib/plan-create');

  const host = new URL(process.env.DATABASE_URL!).hostname;
  console.log(`Database: ${host}`);

  const parents = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  if (parents.length !== 1) {
    console.error(
      parents.length === 0
        ? `No account with email ${email}. Sign in to the app with Google first.`
        : `${parents.length} accounts use ${email}; can't tell which one to use.`,
    );
    process.exit(1);
  }
  const parent = parents[0];
  const existing = await db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(and(eq(schema.students.parentId, parent.id), eq(schema.students.name, CHILD_NAME)));
  console.log(`Parent: ${parent.name} (${email})`);

  if (remove) {
    if (existing.length === 0) return console.log(`No "${CHILD_NAME}" to remove.`);
    if (!confirm)
      return console.log(`Dry run: would delete "${CHILD_NAME}" and all its data. Add --confirm to do it.`);
    await db
      .delete(schema.students)
      .where(and(eq(schema.students.parentId, parent.id), eq(schema.students.name, CHILD_NAME)));
    return console.log(`Deleted "${CHILD_NAME}" and everything under it.`);
  }

  if (existing.length > 0) {
    console.error(`"${CHILD_NAME}" already exists. Remove it first with --remove --confirm.`);
    process.exit(1);
  }

  const start = today();
  const examDate = addDays(start, examDays);
  const examName = mode === 'joiner' ? 'Third Terminal Examination' : 'First Terminal Examination';

  // Which topics were studied for earlier exams, and which are this exam's
  // so far. The rest of the syllabus is added on the Subjects page as taught.
  const all = syllabusInOrder();
  const earlierCount = mode === 'joiner' ? Math.round(all.length * 0.6) : 0;
  const earlier = all.slice(0, earlierCount).map((x, k) => ({
    ...x,
    examName: k < earlierCount / 2 ? 'First Terminal Examination' : 'Second Terminal Examination',
  }));
  const taught = all.slice(earlierCount, earlierCount + taughtCount);

  console.log(`Today: ${toDateString(start)}   Exam: ${examName}, ${toDateString(examDate)} (${examDays} days)`);
  console.log(`Subjects: ${SEE_GRADE_10.length}   Earlier topics: ${earlier.length}   Taught so far for this exam: ${taught.length}`);
  if (!confirm) return console.log('\nDry run: nothing written. Add --confirm to create the child.');

  await db.transaction(async (tx) => {
    const [student] = await tx
      .insert(schema.students)
      .values({ parentId: parent.id, name: CHILD_NAME, grade: '10', studyDays: [...ALL_DAYS], sundayRevision: true })
      .returning();
    const [exam] = await tx
      .insert(schema.exams)
      .values({ studentId: student.id, name: examName, examDate: toDateString(examDate), isPrimary: true })
      .returning();
    const subjects = await tx
      .insert(schema.subjects)
      .values(SEE_GRADE_10.map((s, i) => ({ studentId: student.id, name: s.name, examWeight: s.examWeight, orderIndex: i })))
      .returning();

    const learnFrom = spreadLearnFrom(taught.length, toDateString(start), sm2Days(true, earlier.length > 0));
    const groups = [
      ...earlier.map((x) => ({ ...x, tag: { examId: null, examName: x.examName, selfRating: 'not_sure' as const } })),
      ...taught.map((x, k) => ({ ...x, tag: { examId: exam.id, examName: exam.name, learnFrom: learnFrom[k] } })),
    ];
    for (const g of groups) {
      const s = SEE_GRADE_10[g.subject];
      const [top] = await insertTopicRows(tx, [{
        subjectId: subjects[g.subject].id,
        parentTopicId: null,
        name: g.topic.name,
        difficultyRating: g.topic.difficulty ?? s.difficulty,
        ...g.tag,
      }]);
      await insertTopicRows(
        tx,
        (g.topic.subtopics ?? []).map((st) => ({
          subjectId: subjects[g.subject].id,
          parentTopicId: top.id,
          name: st.name,
          difficultyRating: st.difficulty ?? g.topic.difficulty ?? s.difficulty,
          ...g.tag,
        })),
      );
    }
    await createPlanForExam({ student, exam, ex: tx });
  });
  console.log(`\nCreated "${CHILD_NAME}" with its study plan. Open it in the app.`);
}

main()
  .then(async () => {
    const { db } = await import('../lib/db');
    await db.$client.end();
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
