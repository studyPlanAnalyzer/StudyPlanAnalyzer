import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';

// ---------------------------------------------------------------------------
// Who can read which report. Requests are signed in the way the browser is:
// a real session row and a signed access-token cookie.
// ---------------------------------------------------------------------------

const WEEK = '2026-10-11';
const BASE = 'https://app.example.test';

describe('report APIs: access', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  const ids = { a: randomUUID(), b: randomUUID(), a1: randomUUID(), aLocked: randomUUID(), b1: randomUUID() };
  const cookie: Record<'a' | 'b', string> = { a: '', b: '' };
  let routes: {
    list: typeof import('@/app/api/students/[id]/reports/route');
    one: typeof import('@/app/api/students/[id]/reports/[weekStart]/route');
    read: typeof import('@/app/api/students/[id]/reports/[weekStart]/read/route');
    refresh: typeof import('@/app/api/reports/refresh/route');
    childRefresh: typeof import('@/app/api/students/[id]/reports/refresh/route');
  };

  before(async () => {
    ctx = await setupTestDb();
    const { db, schema } = ctx;
    const { signAccessToken } = await import('@/lib/auth/jwt');
    const { accessCookie } = await import('@/lib/auth/cookies');
    const { buildWeeklyReport } = await import('@/lib/reports/build-weekly-report');

    await db.insert(schema.users).values([
      { id: ids.a, googleId: 'g-a', name: 'Sita', email: 'sita@example.test' },
      { id: ids.b, googleId: 'g-b', name: 'Ram', email: 'ram@example.test' },
    ]);
    const paid = { paidUntil: new Date(Date.now() + 30 * 864e5), paymentStatus: 'verified' };
    await db.insert(schema.students).values([
      { id: ids.a1, parentId: ids.a, name: 'Aarav', grade: '9', ...paid },
      { id: ids.aLocked, parentId: ids.a, name: 'Locked', grade: '9', paidUntil: new Date('2026-01-01'), paymentStatus: 'verified' },
      { id: ids.b1, parentId: ids.b, name: 'Gita', grade: '9', ...paid },
    ]);
    const snap = (studentId: string, name: string) =>
      buildWeeklyReport({
        student: { id: studentId, name, createdAt: '2026-09-01T00:00:00.000Z' }, weekStart: WEEK, billing: 'active',
        exam: null, plan: null, sessions: [], revisions: [], topicReviews: [], quizAttempts: [], firstQuizAttemptAt: null, todos: [],
        marks: [], subjectInputs: [], topicNames: {}, intervalDays: {}, onTimeReviewsAllTime: 0,
        previousReport: null, hasEarlierReport: false, awardedMilestones: [], builtLater: false,
      });
    await db.insert(schema.weeklyReports).values([
      { studentId: ids.a1, weekStart: WEEK, snapshot: snap(ids.a1, 'Aarav') },
      { studentId: ids.aLocked, weekStart: WEEK, snapshot: snap(ids.aLocked, 'Locked') },
      { studentId: ids.b1, weekStart: WEEK, snapshot: snap(ids.b1, 'Gita') },
    ]);

    for (const who of ['a', 'b'] as const) {
      const [session] = await db
        .insert(schema.userSessions)
        .values({ userId: ids[who], expiresAt: new Date(Date.now() + 864e5) })
        .returning({ id: schema.userSessions.id });
      const token = signAccessToken({ userId: ids[who], role: 'parent', sid: session.id });
      cookie[who] = `${accessCookie().name}=${token}`;
    }

    routes = {
      list: await import('@/app/api/students/[id]/reports/route'),
      one: await import('@/app/api/students/[id]/reports/[weekStart]/route'),
      read: await import('@/app/api/students/[id]/reports/[weekStart]/read/route'),
      refresh: await import('@/app/api/reports/refresh/route'),
      childRefresh: await import('@/app/api/students/[id]/reports/refresh/route'),
    };
  });
  after(closeTestDb);

  const req = (path: string, who?: 'a' | 'b', init: { method?: string; body?: unknown } = {}) =>
    new NextRequest(`${BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: { ...(who ? { cookie: cookie[who] } : {}), ...(init.body ? { 'content-type': 'application/json' } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
  const p = <T extends object>(v: T) => ({ params: Promise.resolve(v) });
  const readAt = async (studentId: string) =>
    (await ctx.db.select({ r: ctx.schema.weeklyReports.readAt }).from(ctx.schema.weeklyReports)
      .where(ctx.sql`${ctx.schema.weeklyReports.studentId} = ${studentId}`))[0].r;

  test('signed out: 401 everywhere', async () => {
    assert.equal((await routes.list.GET(req(`/api/students/${ids.a1}/reports`), p({ id: ids.a1 }))).status, 401);
    assert.equal((await routes.one.GET(req(`/x`), p({ id: ids.a1, weekStart: WEEK }))).status, 401);
    assert.equal((await routes.read.POST(req(`/x`, undefined, { method: 'POST' }), p({ id: ids.a1, weekStart: WEEK }))).status, 401);
    assert.equal((await routes.refresh.POST(req('/api/reports/refresh', undefined, { method: 'POST' }))).status, 401);
    assert.equal((await routes.childRefresh.POST(req('/x', undefined, { method: 'POST' }), p({ id: ids.a1 }))).status, 401);
  });

  test('a parent cannot read, list or mark another parent\'s report', async () => {
    assert.equal((await routes.one.GET(req('/x', 'b'), p({ id: ids.a1, weekStart: WEEK }))).status, 404);
    assert.equal((await routes.list.GET(req('/x', 'b'), p({ id: ids.a1 }))).status, 404);
    assert.equal((await routes.read.POST(req('/x', 'b', { method: 'POST' }), p({ id: ids.a1, weekStart: WEEK }))).status, 404);
    assert.equal((await routes.childRefresh.POST(req('/x', 'b', { method: 'POST' }), p({ id: ids.a1 }))).status, 404);
    assert.equal(await readAt(ids.a1), null);
  });

  test('the parent reads their own report; reading changes nothing until POST read', async () => {
    const res = await routes.one.GET(req('/x', 'a'), p({ id: ids.a1, weekStart: WEEK }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.report.studentName, 'Aarav');
    assert.equal(await readAt(ids.a1), null);

    const list = await (await routes.list.GET(req('/x', 'a'), p({ id: ids.a1 }))).json();
    assert.deepEqual(list.reports.map((r: { weekStart: string }) => r.weekStart), [WEEK]);
  });

  test('locked children: no report data at all (402)', async () => {
    assert.equal((await routes.one.GET(req('/x', 'a'), p({ id: ids.aLocked, weekStart: WEEK }))).status, 402);
    assert.equal((await routes.list.GET(req('/x', 'a'), p({ id: ids.aLocked }))).status, 402);
    assert.equal((await routes.childRefresh.POST(req('/x', 'a', { method: 'POST' }), p({ id: ids.aLocked }))).status, 402);
  });

  test('the dashboard notice: own unread, readable children only, cleared by reading', async () => {
    const notice = (who: 'a' | 'b') => routes.refresh.POST(req('/api/reports/refresh', who, { method: 'POST' }));
    const before = await (await notice('a')).json();
    assert.deepEqual(before.unread, [{ studentId: ids.a1, weekStart: WEEK }]);
    assert.equal((await routes.read.POST(req('/x', 'a', { method: 'POST' }), p({ id: ids.a1, weekStart: WEEK }))).status, 200);
    assert.ok(await readAt(ids.a1));
    const after = await (await notice('a')).json();
    assert.deepEqual(after.unread, []);
    const other = await (await notice('b')).json();
    assert.deepEqual(other.unread, [{ studentId: ids.b1, weekStart: WEEK }]);
  });

  test('a malformed week or a week without a report: 404', async () => {
    assert.equal((await routes.one.GET(req('/x', 'a'), p({ id: ids.a1, weekStart: '../../etc' }))).status, 404);
    assert.equal((await routes.one.GET(req('/x', 'a'), p({ id: ids.a1, weekStart: '2026-10-04' }))).status, 404);
  });

});
