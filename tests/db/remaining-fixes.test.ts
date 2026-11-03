import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';
import { addDays, appToday, toDateString } from '@/lib/utils/date-utils';

// Regression tests for the remaining fixes: admin question filters, topic
// creation in one transaction, parent topics keeping their tests as history,
// unpublishing vs attempts, finished sessions, test names, to-do deletes and
// the admin payment numbers.

const inDays = (n: number) => toDateString(addDays(appToday(), n));
type Who = 'parent' | 'admin';
type Handler = (req: NextRequest, props: { params: Promise<object> }) => Promise<Response>;

describe('remaining fixes', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  const ids = {
    parent: randomUUID(), admin: randomUUID(), child: randomUUID(),
    exam: randomUUID(), maths: randomUUID(), algebra: randomUUID(),
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
    await db.insert(schema.subjects).values({ id: ids.maths, studentId: ids.child, name: 'Mathematics' });
    await db.insert(schema.topics).values({ id: ids.algebra, subjectId: ids.maths, name: 'Algebra' });
    await db.insert(schema.topicSpacedState).values({ topicId: ids.algebra });
    for (const who of ['parent', 'admin'] as const) {
      const [s] = await db.insert(schema.userSessions)
        .values({ userId: ids[who], expiresAt: new Date(Date.now() + 864e5) })
        .returning({ id: schema.userSessions.id });
      cookie[who] = `${accessCookie().name}=${signAccessToken({ userId: ids[who], role: who, sid: s.id })}`;
    }
  });
  after(closeTestDb);

  test('admin question list: unknown filters are a 400; % and _ are plain text', async () => {
    const { db, schema } = ctx;
    await db.insert(schema.questions).values(['Is 50% of 10 five?', 'Plain question?'].map((questionText) => ({
      category: 'MATHEMATICS' as const, gradeGroup: 'GROUP_8_10' as const,
      questionText, options: ['A', 'B', 'C', 'D'], correctAnswer: 'A',
    })));
    const route = await import('@/app/api/admin/questions/route');
    const get = (q: string) => call(route.GET as Handler, `/api/admin/questions${q}`, { who: 'admin' });
    assert.equal((await get('?gradeGroup=GROUP_1_3')).status, 400);
    assert.equal((await get('?status=DONE')).status, 400);
    const found = await (await get('?search=%25')).json();
    assert.deepEqual(found.questions.map((q: { questionText: string }) => q.questionText), ['Is 50% of 10 five?']);
    const eligible = await import('@/app/api/admin/daily-quiz/eligible/route');
    assert.equal((await call(eligible.GET as Handler, '/x?gradeGroup=GROUP_8_10&category=HISTORY', { who: 'admin' })).status, 400);
  });

  test('adding topics is all or nothing', async () => {
    const { db, schema, sql } = ctx;
    await db.execute(sql`create function fail_spaced() returns trigger as $$ begin raise exception 'boom'; end $$ language plpgsql`);
    await db.execute(sql`create trigger fail_spaced before insert on topic_spaced_state for each row execute function fail_spaced()`);
    try {
      const route = await import('@/app/api/topics/route');
      const res = await call(route.POST as Handler, '/x', {
        method: 'POST', body: { subjectId: ids.maths, topics: [{ name: 'Geometry' }] },
      });
      assert.equal(res.status, 500);
      const topics = (await db.select().from(schema.topics)).map((t) => t.name);
      assert.deepEqual(topics, ['Algebra']);
    } finally {
      await db.execute(sql`drop trigger fail_spaced on topic_spaced_state`);
      await db.execute(sql`drop function fail_spaced()`);
    }
  });

  test('a topic that gains sub-topics keeps its tests as history; losing them brings them back', async () => {
    const { db, schema, sql } = ctx;
    const tests = await import('@/app/api/students/[id]/tests/route');
    const log = async (date: string, obtained: number) => {
      const res = await call(tests.POST as Handler, '/x', {
        method: 'POST', params: { id: ids.child },
        body: { assessmentName: `Algebra ${date}`, assessmentDate: date, marks: [
          { subjectId: ids.maths, obtainedMarks: obtained, fullMarks: 50, topicIds: [ids.algebra] },
        ] },
      });
      assert.equal(res.status, 201);
    };
    const algebra = async () => {
      const [t] = await db.select().from(schema.topics).where(sql`id = ${ids.algebra}`);
      const [s] = await db.select().from(schema.topicSpacedState).where(sql`topic_id = ${ids.algebra}`);
      return { mastery: t.estimatedMastery, ease: Number(s.easeFactor), status: s.status };
    };
    await log(inDays(-20), 45); // 90%
    await log(inDays(-10), 30); // 60%: a 30-point drop
    assert.deepEqual(await algebra(), { mastery: 72, ease: 2.2, status: 'learning' });

    // First sub-topic: the tests stay on Algebra, its adjustment is undone,
    // and they don't become whole-subject Mathematics marks.
    const topics = await import('@/app/api/topics/route');
    const added = await call(topics.POST as Handler, '/x', {
      method: 'POST', body: { subjectId: ids.maths, parentTopicId: ids.algebra, topics: [{ name: 'Linear equations' }] },
    });
    assert.equal(added.status, 201);
    const linear = (await added.json()).topics[0].id as string;
    const links = await db.select().from(schema.markTopics);
    assert.equal(links.length, 2);
    assert.ok(links.every((l) => l.topicId === ids.algebra));
    assert.equal((await algebra()).ease, 2.5);
    assert.equal((await algebra()).status, 'new');
    assert.equal((await db.select().from(schema.topicTestEffects)).length, 0);
    const analysis = await import('@/app/api/analysis/[studentId]/route');
    const before = await (await call(analysis.GET as Handler, '/x', { params: { studentId: ids.child } })).json();
    assert.deepEqual(before.subjects[0].percentHistory, []);

    // Correcting a history mark keeps it on Algebra (not spread to sub-topics).
    const [second] = (await db.execute(sql`
      select m.id from marks m join assessments a on a.id = m.assessment_id order by a.assessment_date desc limit 1`)).rows as { id: string }[];
    const marks = await import('@/app/api/marks/[id]/route');
    assert.equal((await call(marks.PUT as Handler, '/x', {
      method: 'PUT', params: { id: second.id }, body: { obtainedMarks: 35, topicIds: [ids.algebra] },
    })).status, 200);
    const relinked = await db.select().from(schema.markTopics).where(sql`mark_id = ${second.id}`);
    assert.deepEqual(relinked.map((l) => l.topicId), [ids.algebra]);
    assert.equal((await algebra()).ease, 2.5); // still no adjustment while it has sub-topics

    // Last sub-topic deleted: Algebra counts its own tests again
    // (90% then 70%: a 20-point drop, so ease 2.3 and a restart).
    const topic = await import('@/app/api/topics/[id]/route');
    assert.equal((await call(topic.DELETE as Handler, '/x', { method: 'DELETE', params: { id: linear } })).status, 200);
    assert.deepEqual(await algebra(), { mastery: 78, ease: 2.3, status: 'learning' });
  });

  test('a quiz with an attempt can\'t be unpublished', async () => {
    const { db, schema } = ctx;
    const quizId = randomUUID();
    await db.insert(schema.dailyQuizzes).values({ id: quizId, date: inDays(0), gradeGroup: 'GROUP_8_10', isPublished: true });
    await db.insert(schema.quizAttempts).values({ studentId: ids.child, dailyQuizId: quizId, score: 1, answers: [] });
    const route = await import('@/app/api/admin/daily-quiz/[date]/unpublish/route');
    const res = await call(route.POST as Handler, '/x', {
      method: 'POST', who: 'admin', params: { date: inDays(0) }, body: { gradeGroup: 'GROUP_8_10' },
    });
    assert.equal(res.status, 409);
    assert.match((await res.json()).error, /1 student/);
    const [quiz] = await db.select().from(schema.dailyQuizzes);
    assert.equal(quiz.isPublished, true);
  });

  test('a finished session can\'t be put back to planned or skipped', async () => {
    const { db, schema } = ctx;
    const plan = randomUUID();
    const session = randomUUID();
    await db.insert(schema.studyPlans).values({ id: plan, studentId: ids.child, examId: ids.exam, totalDays: 30, averageDailyMinutes: 60 });
    await db.insert(schema.studySessions).values({
      id: session, planId: plan, scheduledDate: inDays(0), durationMinutes: 20,
      sessionType: 'practice', status: 'completed', rating: 3, completedAt: new Date(),
    });
    const route = await import('@/app/api/sessions/[id]/route');
    for (const status of ['planned', 'skipped'])
      assert.equal((await call(route.PUT as Handler, '/x', { method: 'PUT', params: { id: session }, body: { status } })).status, 409);
    const [s] = await db.select().from(schema.studySessions).where(ctx.sql`id = ${session}`);
    assert.equal(s.status, 'completed');
  });

  test('test names are at most 200 characters', async () => {
    const tests = await import('@/app/api/students/[id]/tests/route');
    const res = await call(tests.POST as Handler, '/x', {
      method: 'POST', params: { id: ids.child },
      body: { assessmentName: 'x'.repeat(201), assessmentDate: inDays(-1), marks: [
        { subjectId: ids.maths, obtainedMarks: 10, fullMarks: 20 },
      ] },
    });
    assert.equal(res.status, 400);
  });

  test('deleting a to-do that isn\'t there is a 404', async () => {
    const { db, schema } = ctx;
    const [todo] = await db.insert(schema.todos)
      .values({ studentId: ids.child, content: 'Revise', todoDate: inDays(0) }).returning();
    const route = await import('@/app/api/students/[id]/todos/[todoId]/route');
    const del = (todoId: string) =>
      call(route.DELETE as Handler, '/x', { method: 'DELETE', params: { id: ids.child, todoId } });
    assert.equal((await del(randomUUID())).status, 404);
    assert.equal((await del(todo.id)).status, 200);
    assert.equal((await del(todo.id)).status, 404);
  });

  test('admin dashboard shows real payment numbers', async () => {
    const { db, schema } = ctx;
    const pay = (status: string, amountRs: number, reviewedAt: Date | null, submittedAt: Date | null = null) => ({
      userId: ids.parent, studentId: ids.child, plan: 'monthly', months: 1, amountRs,
      remarkCode: `SP-ARJUN-${randomUUID().slice(0, 6)}`, status, reviewedAt, submittedAt,
    });
    await db.insert(schema.payments).values([
      pay('pending', 250, null, new Date()),
      pay('pending', 200, null, new Date(Date.now() - 3 * 864e5)), // waiting 3 days
      pay('verified', 250, new Date()),
      pay('verified', 600, new Date(Date.now() - 400 * 864e5)), // over a year ago
    ]);
    const route = await import('@/app/api/admin/dashboard-metrics/route');
    const { billing } = await (await call(route.GET as Handler, '/x', { who: 'admin' })).json();
    assert.deepEqual(billing, {
      paymentsWaiting: 2, paymentsOverdue: 1, verifiedThisMonth: 1, revenueThisMonthRs: 250, paidChildren: 1,
    });
  });

  test('a payment waiting to be checked never locks the child, and can\'t be paid twice', async () => {
    const { db, schema, sql } = ctx;
    const sita = randomUUID();
    // Paid until 10 days ago (long past grace): locked until she pays.
    await db.insert(schema.students).values({
      id: sita, parentId: ids.parent, name: 'Sita', grade: '6',
      paidUntil: new Date(Date.now() - 10 * 864e5), paymentStatus: 'verified',
    });
    const student = await import('@/app/api/students/[id]/route');
    const open = () => call(student.GET as Handler, '/x', { params: { id: sita } });
    assert.equal((await open()).status, 402);

    const start = await import('@/app/api/billing/payments/route');
    const submit = await import('@/app/api/billing/payments/[id]/route');
    const started = await (await call(start.POST as Handler, '/x', {
      method: 'POST', body: { studentId: sita, plan: 'monthly' },
    })).json();
    assert.equal((await call(submit.PUT as Handler, '/x', {
      method: 'PUT', params: { id: started.paymentId },
      body: { transactionId: 'FT555001', parentName: 'Ramesh', childName: 'Sita', schoolName: 'Bal Vikas' },
    })).status, 200);
    assert.equal((await open()).status, 200);

    // A week passes and nobody has checked it: still usable, nothing new to pay.
    await db.execute(sql`update payments set submitted_at = now() - interval '7 days' where id = ${started.paymentId}`);
    assert.equal((await open()).status, 200);
    assert.equal((await call(start.POST as Handler, '/x', {
      method: 'POST', body: { studentId: sita, plan: 'monthly' },
    })).status, 409);
    const code = await import('@/app/api/billing/school-code/route');
    assert.equal((await call(code.POST as Handler, '/x', {
      method: 'POST', body: { studentId: sita, code: 'SCH-AAAA-BBBB' },
    })).status, 409);

    // Rejected: back to how it was (paid period long over), so locked again.
    const reject = await import('@/app/api/admin/payments/[id]/reject/route');
    assert.equal((await call(reject.POST as Handler, '/x', {
      method: 'POST', who: 'admin', params: { id: started.paymentId }, body: {},
    })).status, 200);
    assert.equal((await open()).status, 402);
  });
});
