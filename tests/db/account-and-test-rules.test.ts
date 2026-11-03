import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';
import { addDays, appToday, toDateString } from '@/lib/utils/date-utils';

// Full marks up to 100, no future-dated tests, one mark per thing in a test,
// signing devices out, and account deletion requests.

const inDays = (n: number) => toDateString(addDays(appToday(), n));
type Who = 'parent' | 'admin' | 'other';
type Handler = (req: NextRequest, props: { params: Promise<object> }) => Promise<Response>;

describe('account and test rules', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  const ids = {
    parent: randomUUID(), admin: randomUUID(), other: randomUUID(), child: randomUUID(),
    maths: randomUUID(), algebra: randomUUID(), geometry: randomUUID(),
  };
  const cookie = { parent: '', admin: '', other: '' };
  const sid = { parent: '', admin: '', other: '' };
  let signAccess: (who: Who, session: string) => string;

  const call = (
    handler: Handler,
    url: string,
    o: { method?: string; body?: unknown; who?: Who; params?: object; cookie?: string } = {},
  ) =>
    handler(
      new NextRequest(`https://app.example.test${url}`, {
        method: o.method ?? 'GET',
        headers: { cookie: o.cookie ?? cookie[o.who ?? 'parent'], 'content-type': 'application/json' },
        body: o.body === undefined ? undefined : JSON.stringify(o.body),
      }),
      { params: Promise.resolve(o.params ?? {}) },
    );

  const newSession = async (who: Who, userAgent: string | null = null) => {
    const [s] = await ctx.db.insert(ctx.schema.userSessions)
      .values({ userId: ids[who], expiresAt: new Date(Date.now() + 864e5), userAgent })
      .returning({ id: ctx.schema.userSessions.id });
    return s.id;
  };

  before(async () => {
    process.env.ADMIN_EMAILS = 'admin@gmail.com';
    ctx = await setupTestDb();
    const { db, schema } = ctx;
    const { signAccessToken } = await import('@/lib/auth/jwt');
    const { accessCookie } = await import('@/lib/auth/cookies');
    signAccess = (who, session) =>
      `${accessCookie().name}=${signAccessToken({ userId: ids[who], role: who === 'admin' ? 'admin' : 'parent', sid: session })}`;
    await db.insert(schema.users).values([
      { id: ids.parent, googleId: 'g-parent', name: 'Ramesh', email: 'ramesh@gmail.com' },
      { id: ids.admin, googleId: 'g-admin', name: 'Admin', email: 'admin@gmail.com', isAdmin: true },
      { id: ids.other, googleId: 'g-other', name: 'Gita', email: 'gita@gmail.com' },
    ]);
    await db.insert(schema.students).values({
      id: ids.child, parentId: ids.parent, name: 'Arjun', grade: '9',
      paidUntil: new Date(Date.now() + 30 * 864e5), paymentStatus: 'verified',
    });
    await db.insert(schema.subjects).values({ id: ids.maths, studentId: ids.child, name: 'Mathematics' });
    await db.insert(schema.topics).values([
      { id: ids.algebra, subjectId: ids.maths, name: 'Algebra' },
      { id: ids.geometry, subjectId: ids.maths, name: 'Geometry' },
    ]);
    await db.insert(schema.topicSpacedState).values([{ topicId: ids.algebra }, { topicId: ids.geometry }]);
    for (const who of ['parent', 'admin', 'other'] as const) {
      sid[who] = await newSession(who, who === 'parent' ? 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15' : null);
      cookie[who] = signAccess(who, sid[who]);
    }
  });
  after(closeTestDb);

  const logTest = async (body: object) => {
    const tests = await import('@/app/api/students/[id]/tests/route');
    return call(tests.POST as Handler, '/x', { method: 'POST', params: { id: ids.child }, body });
  };
  const mark = (topicIds: string[] = [], obtained = 10, full = 20) =>
    ({ subjectId: ids.maths, obtainedMarks: obtained, fullMarks: full, topicIds });

  test('full marks are at most 100', async () => {
    const subjects = await import('@/app/api/subjects/route');
    assert.equal((await call(subjects.POST as Handler, '/x', {
      method: 'POST', body: { studentId: ids.child, name: 'Science', fullMarks: 101 },
    })).status, 400);
    assert.equal((await logTest({ assessmentName: 'T', assessmentDate: inDays(-1), marks: [mark([], 50, 150)] })).status, 400);
    assert.equal((await logTest({ assessmentName: 'T', assessmentDate: inDays(-1), marks: [mark([], 90, 100)] })).status, 201);
  });

  test('tests can\'t be dated in the future', async () => {
    const future = await logTest({ assessmentName: 'Future', assessmentDate: inDays(1), marks: [mark()] });
    assert.equal(future.status, 400);
    assert.equal((await logTest({ assessmentName: 'Today', assessmentDate: inDays(0), marks: [mark()] })).status, 201);
  });

  test('one mark per subject or per topic in a test, never two for the same thing', async () => {
    const { db, schema, sql } = ctx;
    const before = (await db.select().from(schema.marks)).length;
    const twoWhole = await logTest({ assessmentName: 'Two', assessmentDate: inDays(-2), marks: [mark(), mark()] });
    assert.equal(twoWhole.status, 400);
    assert.match((await twoWhole.json()).error, /more than one mark/);
    const mixed = await logTest({ assessmentName: 'Mixed', assessmentDate: inDays(-2), marks: [mark(), mark([ids.algebra])] });
    assert.equal(mixed.status, 400);
    assert.match((await mixed.json()).error, /whole subject and marks for its topics/);
    const topicTwice = await logTest({
      assessmentName: 'Twice', assessmentDate: inDays(-2), marks: [mark([ids.algebra]), mark([ids.algebra, ids.geometry])],
    });
    assert.equal(topicTwice.status, 400);
    assert.match((await topicTwice.json()).error, /"Algebra" has more than one mark/);
    assert.equal((await db.select().from(schema.marks)).length, before); // nothing saved

    const ok = await logTest({
      assessmentName: 'Per topic', assessmentDate: inDays(-2), marks: [mark([ids.algebra]), mark([ids.geometry])],
    });
    assert.equal(ok.status, 201);

    // Adding a whole-subject mark to that test afterwards is refused too.
    const [t] = (await db.execute(sql`select id from assessments where assessment_name = 'Per topic'`)).rows as { id: string }[];
    const marks = await import('@/app/api/marks/route');
    assert.equal((await call(marks.POST as Handler, '/x', {
      method: 'POST', body: { assessmentId: t.id, ...mark() },
    })).status, 400);
  });

  test('devices: list, sign out one, sign out all others', async () => {
    const { db, schema, sql } = ctx;
    const phone = await newSession('parent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1');
    const tablet = await newSession('parent', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120.0 Safari/537.36');
    const sessions = await import('@/app/api/account/sessions/route');
    const one = await import('@/app/api/account/sessions/[id]/route');
    const others = await import('@/app/api/account/sessions/sign-out-others/route');

    const { sessions: list } = await (await call(sessions.GET as Handler, '/x')).json();
    assert.equal(list.length, 3);
    assert.deepEqual(list.find((s: { current: boolean }) => s.current).device, 'Safari on Mac');
    assert.ok(list.some((s: { device: string }) => s.device === 'Safari on iPhone'));
    assert.ok(list.some((s: { device: string }) => s.device === 'Chrome on Android'));

    // Another parent can't sign out this parent's device.
    assert.equal((await call(one.DELETE as Handler, '/x', { method: 'DELETE', who: 'other', params: { id: phone } })).status, 404);
    assert.equal((await call(one.DELETE as Handler, '/x', { method: 'DELETE', params: { id: phone } })).status, 200);
    // The signed-out device's next request is refused.
    const me = await import('@/app/api/auth/me/route');
    assert.equal((await call(me.GET as unknown as Handler, '/x', { cookie: signAccess('parent', phone) })).status, 401);

    assert.equal((await call(others.POST as Handler, '/x', { method: 'POST' })).status, 200);
    const left = await db.select().from(schema.userSessions).where(sql`user_id = ${ids.parent}`);
    assert.deepEqual(left.map((s) => s.id), [sid.parent]);
    assert.notEqual(tablet, sid.parent);
  });

  test('account deletion: request, cancel, decline, carry out', async () => {
    const { db, schema, sql } = ctx;
    const request = await import('@/app/api/account/deletion-request/route');
    const admin = await import('@/app/api/admin/deletion-requests/route');
    const complete = await import('@/app/api/admin/deletion-requests/[id]/complete/route');
    const decline = await import('@/app/api/admin/deletion-requests/[id]/decline/route');
    const ask = (reason: string, who: Who = 'parent') =>
      call(request.POST as Handler, '/x', { method: 'POST', who, body: { reason } });
    const pendingFor = async () =>
      (await (await call(admin.GET as Handler, '/x', { who: 'admin' })).json()).requests;

    assert.equal((await ask('short')).status, 400);
    assert.equal((await ask('We are moving abroad.')).status, 201);
    assert.equal((await ask('We are moving abroad.')).status, 409);
    assert.equal((await call(request.DELETE as Handler, '/x', { method: 'DELETE' })).status, 200);
    assert.equal((await pendingFor()).length, 0);

    // Declined with a note the parent sees.
    assert.equal((await ask('Please remove everything.', 'other')).status, 201);
    const [gita] = await pendingFor();
    assert.equal((await call(decline.POST as Handler, '/x', {
      method: 'POST', who: 'admin', params: { id: gita.id }, body: { note: 'Please ask from your own account.' },
    })).status, 200);
    const seen = await (await call(request.GET as Handler, '/x', { who: 'other' })).json();
    assert.equal(seen.request.status, 'declined');
    assert.equal(seen.request.adminNote, 'Please ask from your own account.');

    // Carried out: the account and children go; payments stay without names.
    await db.insert(schema.payments).values({
      userId: ids.parent, studentId: ids.child, plan: 'monthly', months: 1, amountRs: 250,
      remarkCode: 'SP-ARJUN-K7Q2M9', transactionId: 'FT777', parentName: 'Ramesh',
      childName: 'Arjun', schoolName: 'Bal Vikas', status: 'verified',
    });
    assert.equal((await ask('We are moving abroad.')).status, 201);
    const [ramesh] = await pendingFor();
    assert.equal(ramesh.email, 'ramesh@gmail.com');
    assert.equal(ramesh.children, 1);
    assert.equal((await call(complete.POST as Handler, '/x', { method: 'POST', who: 'admin', params: { id: ramesh.id } })).status, 200);
    assert.equal((await call(complete.POST as Handler, '/x', { method: 'POST', who: 'admin', params: { id: ramesh.id } })).status, 409);

    assert.equal((await db.select().from(schema.users).where(sql`id = ${ids.parent}`)).length, 0);
    assert.equal((await db.select().from(schema.students)).length, 0);
    assert.equal((await db.select().from(schema.marks)).length, 0);
    const [p] = await db.select().from(schema.payments);
    assert.equal(p.userId, null);
    assert.equal(p.studentId, null);
    assert.equal(p.parentName, null);
    assert.equal(p.childName, null);
    assert.equal(p.schoolName, null);
    assert.equal(p.transactionId, 'FT777');
    assert.equal(p.amountRs, 250);
    assert.match(p.remarkCode, /^SP-DELETED-/);
    const [done] = await db.select().from(schema.deletionRequests).where(sql`id = ${ramesh.id}`);
    assert.equal(done.status, 'completed');
    assert.equal(done.email, null);
    assert.equal(done.reason, 'We are moving abroad.');
  });
});
