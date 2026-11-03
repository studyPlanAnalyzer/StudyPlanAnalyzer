import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';
import { addDays, appToday, toDateString } from '@/lib/utils/date-utils';

// Regression tests for the second batch: malformed ids, the current exam,
// archiving from the Subjects page, onboarding checks, quiz usage counts, and
// trend effects after a test's date changes.

const inDays = (n: number) => toDateString(addDays(appToday(), n));
type Who = 'parent' | 'admin';
type Handler = (req: NextRequest, props: { params: Promise<object> }) => Promise<Response>;

describe('next batch of fixes', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  const ids = {
    parent: randomUUID(), admin: randomUUID(), child: randomUUID(),
    exam: randomUUID(), maths: randomUUID(), science: randomUUID(),
    algebra: randomUUID(), physics: randomUUID(),
  };
  const cookie = { parent: '', admin: '' };

  const call = (
    handler: Handler,
    url: string,
    o: { method?: string; body?: unknown; who?: Who; params?: object } = {},
  ) =>
    handler(
      new NextRequest(`https://app.example.test${url}`, {
        method: o.method ?? 'GET',
        headers: { cookie: cookie[o.who ?? 'parent'], 'content-type': 'application/json' },
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
      }),
      { params: Promise.resolve(o.params ?? {}) },
    );

  before(async () => {
    process.env.ADMIN_EMAILS = 'admin@gmail.com';
    ctx = await setupTestDb();
    const { db, schema } = ctx;
    const { signAccessToken } = await import('@/lib/auth/jwt');
    const { accessCookie } = await import('@/lib/auth/cookies');
    await db.insert(schema.users).values([
      { id: ids.parent, googleId: 'g-parent', name: 'Ramesh', email: 'ramesh@gmail.com' },
      { id: ids.admin, googleId: 'g-admin', name: 'Admin', email: 'admin@gmail.com', isAdmin: true },
    ]);
    await db.insert(schema.students).values({
      id: ids.child, parentId: ids.parent, name: 'Arjun', grade: '9',
      studyDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      paidUntil: new Date(Date.now() + 30 * 864e5), paymentStatus: 'verified',
    });
    await db.insert(schema.exams).values({ id: ids.exam, studentId: ids.child, name: 'Final', examDate: inDays(30) });
    await db.insert(schema.subjects).values([
      { id: ids.maths, studentId: ids.child, name: 'Mathematics' },
      { id: ids.science, studentId: ids.child, name: 'Science' },
    ]);
    await db.insert(schema.topics).values([
      { id: ids.algebra, subjectId: ids.maths, name: 'Algebra' },
      { id: ids.physics, subjectId: ids.science, name: 'Physics' },
    ]);
    await db.insert(schema.topicSpacedState).values([{ topicId: ids.algebra }, { topicId: ids.physics }]);
    for (const who of ['parent', 'admin'] as const) {
      const [s] = await db.insert(schema.userSessions)
        .values({ userId: ids[who], expiresAt: new Date(Date.now() + 864e5) })
        .returning({ id: schema.userSessions.id });
      cookie[who] = `${accessCookie().name}=${signAccessToken({ userId: ids[who], role: who, sid: s.id })}`;
    }
  });
  after(closeTestDb);

  test('a malformed id is a 404, not a 500', async () => {
    const student = await import('@/app/api/students/[id]/route');
    const res = await call(student.GET as Handler, '/x', { params: { id: 'not-a-uuid' } });
    assert.equal(res.status, 404);
    assert.equal((await res.json()).code, 'NOT_FOUND');
    const exams = await import('@/app/api/exams/route');
    assert.equal((await call(exams.GET as Handler, '/api/exams?studentId=123')).status, 404);
  });

  test('the current exam can\'t be switched off on its own', async () => {
    const route = await import('@/app/api/exams/[id]/route');
    const res = await call(route.PUT as Handler, '/x', {
      method: 'PUT', body: { isPrimary: false }, params: { id: ids.exam },
    });
    assert.equal(res.status, 400);
    const [exam] = await ctx.db.select().from(ctx.schema.exams);
    assert.equal(exam.isPrimary, true);
  });

  test('archiving on the Subjects page clears the subject\'s open sessions', async () => {
    const { db, schema, sql } = ctx;
    const generate = await import('@/app/api/plans/generate/route');
    assert.equal((await call(generate.POST as Handler, '/x', {
      method: 'POST', body: { studentId: ids.child, examId: ids.exam },
    })).status, 201);
    // One Science session is history.
    await db.execute(sql`
      update study_sessions set status = 'completed', completed_at = now()
       where id = (select id from study_sessions where subject_id = ${ids.science} limit 1)`);

    const curriculum = await import('@/app/api/students/[id]/curriculum/route');
    const res = await call(curriculum.POST as Handler, '/x', {
      method: 'POST', params: { id: ids.child },
      body: { subjectEdits: [{ id: ids.science, isActive: false }] }, // no planId
    });
    assert.equal(res.status, 201);
    const left = await db.select().from(schema.studySessions).where(
      sql`${schema.studySessions.subjectId} = ${ids.science}`);
    assert.deepEqual(left.map((s) => s.status), ['completed']);
  });

  test('onboarding uses the same rules as the rest of the app', async () => {
    const route = await import('@/app/api/onboarding/route');
    const body = (over: { student?: object; subjects?: object[] }) => ({
      student: {
        name: 'Kiran', grade: '09', schoolName: '  Bal   Vikas  ',
        studyDays: ['Mon'], schoolDayMinutes: 45, holidayDayMinutes: 90, ...over.student,
      },
      exam: { name: 'Final', examDate: inDays(40) },
      subjects: over.subjects ?? [{ name: 'English', examWeight: 'medium', obtainedMarks: 70 }],
    });
    const post = (b: object) => call(route.POST as Handler, '/x', { method: 'POST', body: b });

    const alias = await post(body({ subjects: [
      { name: 'Math', examWeight: 'high', obtainedMarks: 60 },
      { name: 'Mathematics', examWeight: 'high', obtainedMarks: 60 },
    ] }));
    assert.equal(alias.status, 400);
    assert.match((await alias.json()).error, /same subject/);
    assert.equal((await post(body({ student: { schoolName: 'ab' } }))).status, 400);

    const ok = await post(body({}));
    assert.equal(ok.status, 201);
    const { studentId } = await ok.json();
    const [s] = await ctx.db.select().from(ctx.schema.students).where(ctx.sql`id = ${studentId}`);
    assert.equal(s.grade, '9');
    assert.equal(s.schoolName, 'Bal Vikas');
  });

  test('quiz usage is recounted on publish and unpublish, by quiz date', async () => {
    const { db, schema } = ctx;
    const cats = ['IQ_LOGIC', 'SCIENCE', 'GENERAL_KNOWLEDGE', 'TECH_AI', 'MATHEMATICS'] as const;
    const qs = cats.map((category) => ({
      id: randomUUID(), category, gradeGroup: 'GROUP_8_10' as const, status: 'APPROVED' as const,
      questionText: `${category}?`, options: ['A', 'B', 'C', 'D'], correctAnswer: 'A',
    }));
    await db.insert(schema.questions).values(qs);
    const publish = await import('@/app/api/admin/daily-quiz/[date]/publish/route');
    const unpublish = await import('@/app/api/admin/daily-quiz/[date]/unpublish/route');
    const date = inDays(3);
    const pub = (d: string) => call(publish.POST as Handler, '/x', {
      method: 'POST', who: 'admin', params: { date: d },
      body: { gradeGroup: 'GROUP_8_10', questionIds: Object.fromEntries(qs.map((q) => [q.category, q.id])) },
    });
    const usage = async () => (await db.select().from(schema.questions))
      .filter((q) => q.id === qs[0].id).map((q) => [q.timesUsed, q.lastUsedAt])[0];

    assert.equal((await pub(inDays(-1))).status, 400); // a past day
    assert.equal((await pub(date)).status, 201);
    assert.deepEqual(await usage(), [1, date]);
    assert.equal((await call(unpublish.POST as Handler, '/x', {
      method: 'POST', who: 'admin', params: { date }, body: { gradeGroup: 'GROUP_8_10' },
    })).status, 200);
    assert.deepEqual(await usage(), [0, null]);
    assert.equal((await pub(date)).status, 201);
    assert.deepEqual(await usage(), [1, date]); // not 2
  });

  test('moving a test\'s date redoes the trend effects in the new order', async () => {
    const { db, schema } = ctx;
    const tests = await import('@/app/api/students/[id]/tests/route');
    const log = async (date: string, obtained: number) => {
      const res = await call(tests.POST as Handler, '/x', {
        method: 'POST', params: { id: ids.child },
        body: { assessmentName: `Test ${date}`, assessmentDate: date, marks: [
          { subjectId: ids.maths, obtainedMarks: obtained, fullMarks: 50, topicIds: [ids.algebra] },
        ] },
      });
      assert.equal(res.status, 201);
      return (await res.json()).assessment.id as string;
    };
    const state = async () =>
      (await db.select().from(schema.topicSpacedState)).find((s) => s.topicId === ids.algebra)!;

    const t1 = await log(inDays(-20), 45); // 90%
    await log(inDays(-10), 30);            // 60%: a 30-point drop
    assert.equal(Number((await state()).easeFactor), 2.2);
    assert.equal((await state()).status, 'learning');

    // T1 moves after T2: now 60% then 90%, a rise, and the drop never happened.
    const route = await import('@/app/api/assessments/[id]/route');
    const res = await call(route.PUT as Handler, '/x', {
      method: 'PUT', params: { id: t1 }, body: { assessmentDate: inDays(-5) },
    });
    assert.equal(res.status, 200);
    const after = await state();
    assert.equal(Number(after.easeFactor), 2.5);
    assert.equal(after.status, 'new');
    assert.equal((await db.select().from(schema.topicTestEffects)).length, 0);
  });
});
