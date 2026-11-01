import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';

// ---------------------------------------------------------------------------
// Reports made on demand (lib/reports/generate.ts), on a real database. The
// clock is fixed at Wednesday 21 Oct 2026, so the last finished week is
// Sun 11 – Sat 17 Oct.
// ---------------------------------------------------------------------------

const NOW = new Date('2026-10-21T10:00:00Z');
const LAST = '2026-10-11';

describe('weekly reports on demand', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  let gen: typeof import('@/lib/reports/generate');
  const parent = randomUUID();
  const paid = { paidUntil: new Date('2026-12-31'), paymentStatus: 'verified' };
  let quizSeq = 0;

  before(async () => {
    ctx = await setupTestDb();
    gen = await import('@/lib/reports/generate');
    await ctx.db.insert(ctx.schema.users).values({ id: parent, googleId: 'g-parent', name: 'Sita', email: 'sita@gmail.com' });
  });
  after(closeTestDb);

  /** A child with an exam, a plan, a subject and a topic. */
  async function child(name: string, createdAt: string, billing: { paidUntil: Date | null; paymentStatus: string } = paid) {
    const { db, schema } = ctx;
    const id = randomUUID();
    await db.insert(schema.students).values({ id, parentId: parent, name, grade: '9', createdAt: new Date(createdAt), ...billing });
    const examId = randomUUID();
    const planId = randomUUID();
    const subjectId = randomUUID();
    const topicId = randomUUID();
    await db.insert(schema.exams).values({ id: examId, studentId: id, name: 'Finals', examDate: '2026-12-20', isPrimary: true });
    await db.insert(schema.subjects).values({ id: subjectId, studentId: id, name: 'Maths' });
    await db.insert(schema.topics).values({ id: topicId, subjectId, name: 'Algebra' });
    await db.insert(schema.studyPlans).values({ id: planId, studentId: id, examId, totalDays: 90, averageDailyMinutes: 45, generatedAt: new Date(createdAt) });
    return { id, planId, subjectId, topicId };
  }
  const finished = (c: { planId: string; topicId: string; subjectId: string }, day: string) =>
    ctx.db.insert(ctx.schema.studySessions).values({
      planId: c.planId, topicId: c.topicId, subjectId: c.subjectId, scheduledDate: day,
      durationMinutes: 30, sessionType: 'learn', status: 'completed', completedAt: new Date(`${day}T12:00:00Z`),
    });
  const scheduledOnly = (c: { planId: string; topicId: string; subjectId: string }, day: string) =>
    ctx.db.insert(ctx.schema.studySessions).values({
      planId: c.planId, topicId: c.topicId, subjectId: c.subjectId, scheduledDate: day,
      durationMinutes: 30, sessionType: 'learn', status: 'planned',
    });
  async function testLogged(c: { id: string; subjectId: string }, day: string) {
    const [a] = await ctx.db.insert(ctx.schema.assessments)
      .values({ studentId: c.id, assessmentDate: day, assessmentName: 'Unit test' }).returning();
    await ctx.db.insert(ctx.schema.marks).values({ assessmentId: a.id, subjectId: c.subjectId, obtainedMarks: 70, fullMarks: 100 });
  }
  async function challenge(c: { id: string }, day: string) {
    const [q] = await ctx.db.insert(ctx.schema.dailyQuizzes)
      .values({ date: day, gradeGroup: 'GROUP_8_10', isPublished: true, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, ++quizSeq)) })
      .onConflictDoNothing().returning();
    const quizId = q?.id ?? (await ctx.db.execute(ctx.sql`select id from daily_quizzes where date = ${day}`)).rows[0].id as string;
    await ctx.db.insert(ctx.schema.quizAttempts).values({ studentId: c.id, dailyQuizId: quizId, score: 4, totalQuestions: 5, answers: [], completedAt: new Date(`${day}T09:00:00Z`) });
  }
  const reportsOf = async (studentId: string) =>
    (await ctx.db.select().from(ctx.schema.weeklyReports).where(ctx.sql`${ctx.schema.weeklyReports.studentId} = ${studentId}`))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const checksOf = async (studentId: string) =>
    (await ctx.db.select().from(ctx.schema.weeklyReportChecks).where(ctx.sql`${ctx.schema.weeklyReportChecks.studentId} = ${studentId}`)).length;
  /** Database queries made while `fn` runs. */
  async function queriesDuring(fn: () => Promise<unknown>) {
    const pool = ctx.db.$client as unknown as { query: (...a: unknown[]) => unknown };
    const original = pool.query.bind(pool);
    let n = 0;
    pool.query = (...a: unknown[]) => { n++; return original(...a); };
    try { await fn(); } finally { pool.query = original; }
    return n;
  }

  let aarav: Awaited<ReturnType<typeof child>>;

  test('catching up: only active weeks, the newest 4, older ones built later', async () => {
    aarav = await child('Aarav', '2026-08-01T00:00:00Z');
    await finished(aarav, '2026-10-12');      // week 10-11 (the last finished week)
    await finished(aarav, '2026-10-05');      // week 10-04
    await finished(aarav, '2026-09-28');      // week 09-27
    await testLogged(aarav, '2026-09-21');    // week 09-20: a test logged
    await challenge(aarav, '2026-09-15');     // week 09-13: a challenge (5th newest: not built)
    await scheduledOnly(aarav, '2026-09-07'); // week 09-06: only scheduled, no report
    await finished(aarav, '2026-10-19');      // this week: not finished yet

    const r = await gen.refreshReports({ parentId: parent, now: NOW });
    assert.equal(r.built, 4);
    const reports = await reportsOf(aarav.id);
    assert.deepEqual(reports.map((x) => x.weekStart), ['2026-09-20', '2026-09-27', '2026-10-04', LAST]);

    const newest = reports[3].snapshot;
    assert.equal(newest.context.builtLater, false);
    assert.ok(newest.nextWeek, 'the newest week keeps next week');
    for (const old of reports.slice(0, 3).map((x) => x.snapshot)) {
      assert.equal(old.context.builtLater, true);
      assert.equal(old.revision.gettingStronger, null);
      assert.equal(old.nextWeek, null);
      assert.ok(old.revision.needsAttention.every((t) => t.reason !== 'weak'));
      assert.deepEqual(old.intervalDays, {});
    }
    // Every week from the child's first week to the last finished one is decided.
    assert.equal(await checksOf(aarav.id), 12);
    assert.deepEqual(r.unread, [{ studentId: aarav.id, weekStart: LAST }]);
  });

  test('milestones: each awarded once, in the report that earned it', async () => {
    const reports = await reportsOf(aarav.id);
    const firstReportClaims = reports.filter((x) => x.snapshot.milestonesUnlocked.includes('first_report'));
    assert.deepEqual(firstReportClaims.map((x) => x.weekStart), ['2026-09-20']);
    const rows = await ctx.db.select().from(ctx.schema.studentMilestones).where(ctx.sql`${ctx.schema.studentMilestones.studentId} = ${aarav.id}`);
    assert.equal(rows.filter((m) => m.key === 'first_report').length, 1);
  });

  test('idempotent, and one query when nothing is due', async () => {
    const before = await reportsOf(aarav.id);
    let r: Awaited<ReturnType<typeof gen.refreshReports>> | undefined;
    const n = await queriesDuring(async () => { r = await gen.refreshReports({ parentId: parent, studentId: aarav.id, now: NOW }); });
    assert.equal(r!.built, 0);
    assert.equal(n, 1);
    const after = await reportsOf(aarav.id);
    assert.deepEqual(after.map((x) => [x.id, x.snapshot]), before.map((x) => [x.id, x.snapshot]));
  });

  test('opened reports drop out of the unread list', async () => {
    await ctx.db.execute(ctx.sql`update weekly_reports set read_at = now() where student_id = ${aarav.id} and week_start = ${LAST}`);
    const r = await gen.refreshReports({ parentId: parent, studentId: aarav.id, now: NOW });
    assert.deepEqual(r.unread, []);
  });

  test('concurrent requests: one report, one milestone', async () => {
    const maya = await child('Maya', '2026-10-01T00:00:00Z');
    await finished(maya, '2026-10-13');
    const results = await Promise.all(Array.from({ length: 5 }, () => gen.refreshReports({ parentId: parent, studentId: maya.id, now: NOW })));
    assert.equal(results.reduce((s, r) => s + r.built, 0), 1);
    const reports = await reportsOf(maya.id);
    assert.equal(reports.length, 1);
    const ms = await ctx.db.select().from(ctx.schema.studentMilestones).where(ctx.sql`${ctx.schema.studentMilestones.studentId} = ${maya.id}`);
    assert.equal(ms.filter((m) => m.key === 'first_report').length, 1);
  });

  test('billing: nothing for locked or never-paid children; grace gets the payment line', async () => {
    const locked = await child('Locked', '2026-09-01T00:00:00Z', { paidUntil: new Date('2026-09-15'), paymentStatus: 'verified' });
    const neverPaid = await child('NeverPaid', '2026-09-01T00:00:00Z', { paidUntil: null, paymentStatus: 'none' });
    const grace = await child('Grace', '2026-09-01T00:00:00Z', { paidUntil: new Date('2026-10-20T10:00:00Z'), paymentStatus: 'verified' });
    for (const c of [locked, neverPaid, grace]) await finished(c, '2026-10-12');
    await gen.refreshReports({ parentId: parent, now: NOW });
    for (const c of [locked, neverPaid]) {
      assert.equal((await reportsOf(c.id)).length, 0);
      assert.equal(await checksOf(c.id), 0, 'a locked child\'s weeks are left undecided');
    }
    const [g] = await reportsOf(grace.id);
    assert.equal(g.snapshot.context.paymentDue, true);
    const { unread } = await gen.refreshReports({ parentId: parent, now: NOW });
    assert.ok(!unread.some((u) => u.studentId === locked.id || u.studentId === neverPaid.id));
  });

  test('idle weeks (sessions only scheduled) produce no report, and stay cheap', async () => {
    const idle = await child('Idle', '2026-10-01T00:00:00Z');
    await scheduledOnly(idle, '2026-10-12');
    await scheduledOnly(idle, '2026-10-05');
    const r = await gen.refreshReports({ parentId: parent, studentId: idle.id, now: NOW });
    assert.equal(r.built, 0);
    assert.equal((await reportsOf(idle.id)).length, 0);
    assert.equal(await checksOf(idle.id), 3); // weeks 09-27, 10-04, 10-11
    const n = await queriesDuring(() => gen.refreshReports({ parentId: parent, studentId: idle.id, now: NOW }));
    assert.equal(n, 1);
  });

  test('a child added after the last finished week: nothing yet, one query', async () => {
    const newKid = await child('New', '2026-10-19T08:00:00Z');
    await finished(newKid, '2026-10-19');
    const n = await queriesDuring(() => gen.refreshReports({ parentId: parent, studentId: newKid.id, now: NOW }));
    assert.equal(n, 1);
    assert.equal((await reportsOf(newKid.id)).length, 0);
  });
});
