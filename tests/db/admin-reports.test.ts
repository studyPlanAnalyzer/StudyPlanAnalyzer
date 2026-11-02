import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';

// The admin reports page's APIs: admins only, and previewing stores nothing.

describe('admin reports', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  const ids = { admin: randomUUID(), parent: randomUUID(), child: randomUUID() };
  const cookie = { admin: '', parent: '' };
  let children: typeof import('@/app/api/admin/reports/children/route');
  let preview: typeof import('@/app/api/admin/reports/preview/route');

  before(async () => {
    // Admin rights need the account flag AND the email in ADMIN_EMAILS.
    process.env.ADMIN_EMAILS = 'admin@gmail.com';
    ctx = await setupTestDb();
    const { db, schema } = ctx;
    const { signAccessToken } = await import('@/lib/auth/jwt');
    const { accessCookie } = await import('@/lib/auth/cookies');
    await db.insert(schema.users).values([
      { id: ids.admin, googleId: 'g-admin', name: 'Admin', email: 'admin@gmail.com', isAdmin: true },
      { id: ids.parent, googleId: 'g-parent', name: 'Sita', email: 'sita@gmail.com' },
    ]);
    await db.insert(schema.students).values({
      id: ids.child, parentId: ids.parent, name: 'Aarav', grade: '9',
      createdAt: new Date('2026-01-01'), paidUntil: new Date(Date.now() + 30 * 864e5), paymentStatus: 'verified',
    });
    for (const who of ['admin', 'parent'] as const) {
      const [s] = await db.insert(schema.userSessions)
        .values({ userId: ids[who], expiresAt: new Date(Date.now() + 864e5) })
        .returning({ id: schema.userSessions.id });
      cookie[who] = `${accessCookie().name}=${signAccessToken({ userId: ids[who], role: who === 'admin' ? 'admin' : 'parent', sid: s.id })}`;
    }
    children = await import('@/app/api/admin/reports/children/route');
    preview = await import('@/app/api/admin/reports/preview/route');
  });
  after(closeTestDb);

  const get = (route: { GET: (r: NextRequest) => Promise<Response> }, query: string, who?: 'admin' | 'parent') =>
    route.GET(new NextRequest(`https://app.example.test/x${query}`, { headers: who ? { cookie: cookie[who] } : {} }));
  const counts = async () =>
    (await ctx.db.execute(ctx.sql`select
      (select count(*) from weekly_reports)::int as reports,
      (select count(*) from weekly_report_checks)::int as checks,
      (select count(*) from student_milestones)::int as milestones`)).rows[0];

  test('admins only: 401 signed out, 403 for a parent', async () => {
    for (const [route, q] of [[children, ''], [preview, `?studentId=${ids.child}`]] as const) {
      assert.equal((await get(route, q)).status, 401);
      assert.equal((await get(route, q, 'parent')).status, 403);
    }
  });

  test('search and preview work for an admin and store nothing', async () => {
    const before = await counts();
    const found = await (await get(children, '?q=sita', 'admin')).json();
    assert.deepEqual(found.children.map((c: { id: string }) => c.id), [ids.child]);
    assert.equal(found.weeks.length, 8);

    const res = await get(preview, `?studentId=${ids.child}`, 'admin');
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.preview.studentName, 'Aarav');
    assert.equal(body.stored, null);
    assert.equal(body.parent.email, 'sita@gmail.com');
    assert.ok(!('email' in body) && !('outboxStatus' in body));
    assert.deepEqual(await counts(), before);
  });

  test('an email removed from ADMIN_EMAILS loses admin access on the next request', async () => {
    process.env.ADMIN_EMAILS = 'someone-else@gmail.com';
    try {
      assert.equal((await get(children, '', 'admin')).status, 403);
    } finally {
      process.env.ADMIN_EMAILS = 'admin@gmail.com';
    }
    assert.equal((await get(children, '', 'admin')).status, 200);
  });

  test('a bad week or child is refused', async () => {
    assert.equal((await get(preview, `?studentId=${ids.child}&week=2026-10-12`, 'admin')).status, 400);
    assert.equal((await get(preview, '?studentId=nope', 'admin')).status, 400);
    assert.equal((await get(preview, `?studentId=${randomUUID()}`, 'admin')).status, 404);
  });
});
