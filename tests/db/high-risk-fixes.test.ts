import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';
import { addDays, appToday, toDateString } from '@/lib/utils/date-utils';

// Regression tests for the fixes to the highest-risk areas: the paywall on
// tests, one plan per exam, safe session completion, moving the exam date,
// deleting topics with the marks that only covered them, and quizzes.

const inDays = (n: number) => toDateString(addDays(appToday(), n));
type Who = 'parent' | 'admin';
type Handler = (req: NextRequest, props: { params: Promise<object> }) => Promise<Response>;

describe('high-risk fixes', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  const ids = {
    parent: randomUUID(), admin: randomUUID(), child: randomUUID(), locked: randomUUID(),
    exam: randomUUID(), maths: randomUUID(), algebra: randomUUID(), geometry: randomUUID(),
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
        body:
          o.body === undefined ? undefined : typeof o.body === 'string' ? o.body : JSON.stringify(o.body),
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
    await db.insert(schema.students).values([
      {
        id: ids.child, parentId: ids.parent, name: 'Arjun', grade: '9',
        studyDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
        paidUntil: new Date(Date.now() + 30 * 864e5), paymentStatus: 'verified',
      },
      { id: ids.locked, parentId: ids.parent, name: 'Sita', grade: '6' },
    ]);
    await db.insert(schema.exams).values({ id: ids.exam, studentId: ids.child, name: 'Final', examDate: inDays(30) });
    await db.insert(schema.subjects).values({ id: ids.maths, studentId: ids.child, name: 'Mathematics' });
    await db.insert(schema.topics).values([
      { id: ids.algebra, subjectId: ids.maths, name: 'Algebra' },
      { id: ids.geometry, subjectId: ids.maths, name: 'Geometry' },
    ]);
    await db.insert(schema.topicSpacedState).values([{ topicId: ids.algebra }, { topicId: ids.geometry }]);
    for (const who of ['parent', 'admin'] as const) {
      const [s] = await db.insert(schema.userSessions)
        .values({ userId: ids[who], expiresAt: new Date(Date.now() + 864e5) })
        .returning({ id: schema.userSessions.id });
      cookie[who] = `${accessCookie().name}=${signAccessToken({ userId: ids[who], role: who, sid: s.id })}`;
    }
  });
  after(closeTestDb);

  test('tests (assessments) of a locked child are behind the paywall', async () => {
    const route = await import('@/app/api/assessments/route');
    const post = await call(route.POST as Handler, '/api/assessments', {
      method: 'POST',
      body: { studentId: ids.locked, assessmentDate: inDays(-1), assessmentName: 'Sneaky' },
    });
    assert.equal(post.status, 402);
    const get = await call(route.GET as Handler, `/api/assessments?studentId=${ids.locked}`);
    assert.equal(get.status, 402);
  });

  test('generate: malformed JSON is a 400, and two requests at once make one plan', async () => {
    const route = await import('@/app/api/plans/generate/route');
    const bad = await call(route.POST as Handler, '/api/plans/generate', { method: 'POST', body: '{"studentId": ' });
    assert.equal(bad.status, 400);
    assert.equal((await bad.json()).code, 'BAD_JSON');

    const body = { studentId: ids.child, examId: ids.exam };
    const results = await Promise.all([1, 2].map(() =>
      call(route.POST as Handler, '/api/plans/generate', { method: 'POST', body })));
    assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
    const conflict = await results.find((r) => r.status === 409)!.json();
    assert.match(conflict.error, /already exists/);
    const plans = await ctx.db.select().from(ctx.schema.studyPlans);
    assert.equal(plans.length, 1);
    assert.equal(conflict.planId, plans[0].id);
  });

  test('no session lands on the exam day', async () => {
    const { rows } = await ctx.db.execute(ctx.sql`select max(scheduled_date)::text as last from study_sessions`);
    assert.ok((rows[0] as { last: string }).last < inDays(30));
  });

  test('completing a session twice logs one review; future sessions can\'t be completed', async () => {
    const { db, schema, sql } = ctx;
    const route = await import('@/app/api/sessions/[id]/route');
    const [today] = (await db.execute(sql`
      select id from study_sessions where scheduled_date = ${inDays(0)} and topic_id is not null and not is_filler
      order by session_type limit 1`)).rows as { id: string }[];
    assert.ok(today, 'a session today');

    const body = { status: 'completed', rating: 3 };
    const first = await call(route.PUT as Handler, '/x', { method: 'PUT', body, params: { id: today.id } });
    assert.equal(first.status, 200);
    const second = await call(route.PUT as Handler, '/x', { method: 'PUT', body, params: { id: today.id } });
    assert.equal(second.status, 200);
    assert.equal((await second.json()).planUpdated, false);
    const reviews = await db.select().from(schema.topicReviews);
    assert.equal(reviews.length, 1);

    const [future] = (await db.execute(sql`
      select id from study_sessions where scheduled_date > ${inDays(0)} and topic_id is not null limit 1`)).rows as { id: string }[];
    const early = await call(route.PUT as Handler, '/x', { method: 'PUT', body, params: { id: future.id } });
    assert.equal(early.status, 400);
    assert.equal((await db.select().from(schema.topicReviews)).length, 1);
  });

  test('moving the exam date checks the date and rebuilds the plan with it', async () => {
    const route = await import('@/app/api/exams/[id]/route');
    const put = (examDate: string) =>
      call(route.PUT as Handler, '/x', { method: 'PUT', body: { examDate }, params: { id: ids.exam } });
    assert.equal((await put('abc')).status, 400);
    assert.equal((await put('2027-02-30')).status, 400);
    assert.equal((await put(inDays(400))).status, 400);
    assert.equal((await put(inDays(0))).status, 400);

    const ok = await put(inDays(10));
    assert.equal(ok.status, 200);
    const { rows } = await ctx.db.execute(ctx.sql`
      select max(scheduled_date)::text as last from study_sessions where status = 'planned'`);
    assert.ok((rows[0] as { last: string }).last < inDays(10));
  });

  test('settings take whether Sunday is a revision day, and save it', async () => {
    const route = await import('@/app/api/students/[id]/settings/route');
    const put = (body: object) =>
      call(route.PUT as Handler, '/x', { method: 'PUT', body, params: { id: ids.child } });
    assert.equal((await put({})).status, 400);
    assert.equal((await put({ sundayRevision: 'yes' })).status, 400);
    assert.equal((await put({ sundayRevision: false })).status, 200);
    const [s] = await ctx.db.select().from(ctx.schema.students).where(ctx.sql`id = ${ids.child}`);
    assert.equal(s.sundayRevision, false);
  });

  test('deleting a topic deletes the marks that only covered it, and keeps the rest', async () => {
    const { db, schema } = ctx;
    const [t1, t2, t3] = [randomUUID(), randomUUID(), randomUUID()];
    const [whole, onlyAlgebra, both] = [randomUUID(), randomUUID(), randomUUID()];
    await db.insert(schema.assessments).values([
      { id: t1, studentId: ids.child, assessmentDate: inDays(-10), assessmentName: 'Term' },
      { id: t2, studentId: ids.child, assessmentDate: inDays(-5), assessmentName: 'Algebra quiz' },
      { id: t3, studentId: ids.child, assessmentDate: inDays(-3), assessmentName: 'Unit test' },
    ]);
    await db.insert(schema.marks).values([
      { id: whole, assessmentId: t1, subjectId: ids.maths, obtainedMarks: 62, fullMarks: 100 },
      { id: onlyAlgebra, assessmentId: t2, subjectId: ids.maths, obtainedMarks: 8, fullMarks: 20 },
      { id: both, assessmentId: t3, subjectId: ids.maths, obtainedMarks: 30, fullMarks: 40 },
    ]);
    await db.insert(schema.markTopics).values([
      { markId: onlyAlgebra, topicId: ids.algebra },
      { markId: both, topicId: ids.algebra },
      { markId: both, topicId: ids.geometry },
    ]);

    const route = await import('@/app/api/topics/[id]/route');
    const res = await call(route.DELETE as Handler, '/x', { method: 'DELETE', params: { id: ids.algebra } });
    assert.equal(res.status, 200);

    const marks = (await db.select().from(schema.marks)).map((m) => m.id).sort();
    assert.deepEqual(marks, [whole, both].sort());
    const tests = (await db.select().from(schema.assessments)).map((a) => a.id).sort();
    assert.deepEqual(tests, [t1, t3].sort());
    const links = await db.select().from(schema.markTopics);
    assert.deepEqual(links.map((l) => [l.markId, l.topicId]), [[both, ids.geometry]]);

    // The subject's own score still comes only from the whole-subject mark.
    const analysis = await import('@/app/api/analysis/[studentId]/route');
    const body = await (await call(analysis.GET as Handler, '/x', { params: { studentId: ids.child } })).json();
    assert.deepEqual(body.subjects[0].percentHistory, [62]);
  });

  test('a quiz published with 3 questions can be answered; its answers can\'t be edited', async () => {
    const { db, schema } = ctx;
    const cats = ['IQ_LOGIC', 'SCIENCE', 'GENERAL_KNOWLEDGE'] as const;
    const qs = cats.map((category) => ({
      id: randomUUID(), category, gradeGroup: 'GROUP_8_10' as const, status: 'APPROVED' as const,
      questionText: `${category}?`, options: ['A', 'B', 'C', 'D'], correctAnswer: 'A',
    }));
    await db.insert(schema.questions).values(qs);
    const quizId = randomUUID();
    await db.insert(schema.dailyQuizzes).values({ id: quizId, date: inDays(0), gradeGroup: 'GROUP_8_10', isPublished: true });
    await db.insert(schema.dailyQuizQuestions).values(qs.map((q, order) => ({ dailyQuizId: quizId, questionId: q.id, order })));

    const quiz = await import('@/app/api/students/[id]/daily-challenge/route');
    const res = await call(quiz.POST as Handler, '/x', {
      method: 'POST',
      params: { id: ids.child },
      body: { dailyQuizId: quizId, answers: qs.map((q, i) => ({ questionId: q.id, selectedAnswer: i === 0 ? 'A' : 'B' })) },
    });
    assert.equal(res.status, 201);
    const { attempt } = await res.json();
    assert.equal(attempt.totalQuestions, 3);
    assert.equal(attempt.score, 1);

    const edit = await import('@/app/api/admin/questions/[id]/route');
    const put = (body: object) =>
      call(edit.PUT as Handler, '/x', { method: 'PUT', who: 'admin', body, params: { id: qs[0].id } });
    assert.equal((await put({ correctAnswer: 'B' })).status, 409);
    assert.equal((await put({ options: ['A', 'B', 'C', 'E'] })).status, 409);
    assert.equal((await put({ questionText: 'Clearer wording?' })).status, 200);
  });
});
