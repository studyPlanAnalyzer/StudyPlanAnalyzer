import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';
import { CLIENT_ID, googleToken, keySet, makeKey } from '../auth/google-fixtures';

// POST /api/auth/google on a real database, with a local key pair standing
// in for Google's (no network).

const key = makeKey('key-1');

describe('Google sign-in route', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  let route: typeof import('@/app/api/auth/google/route');
  let me: typeof import('@/app/api/auth/me/route');
  let adminRoute: typeof import('@/app/api/admin/dashboard-metrics/route');
  let ip = 0;

  before(async () => {
    ctx = await setupTestDb();
    process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
    (await import('@/lib/auth/google-token')).setGoogleKeySourceForTests(keySet(key));
    route = await import('@/app/api/auth/google/route');
    me = await import('@/app/api/auth/me/route');
    adminRoute = await import('@/app/api/admin/dashboard-metrics/route');
  });
  after(async () => {
    (await import('@/lib/auth/google-token')).setGoogleKeySourceForTests(null);
    await closeTestDb();
  });
  beforeEach(async () => {
    await ctx.db.execute(ctx.sql`truncate users cascade`);
    delete process.env.ADMIN_EMAILS;
  });

  const signIn = (body: unknown, raw?: string) =>
    route.POST(
      new NextRequest('https://app.example.test/api/auth/google', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-real-ip': `10.7.0.${++ip % 250}` },
        body: raw ?? JSON.stringify(body),
      }),
    );
  const cookiesOf = (res: Response) =>
    Object.fromEntries(
      res.headers.getSetCookie().map((line) => {
        const [nv, ...attrs] = line.split(';').map((s) => s.trim());
        const i = nv.indexOf('=');
        return [nv.slice(0, i), { value: nv.slice(i + 1), attrs: attrs.map((a) => a.toLowerCase()) }];
      }),
    );
  const users = () => ctx.db.select().from(ctx.schema.users);

  test('a valid token creates the user and the same session as before', async () => {
    const res = await signIn({ credential: googleToken(key) });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.user.email, 'parent@gmail.com');
    assert.equal(body.user.name, 'Sita Sharma');
    assert.equal(body.user.isAdmin, false);

    const [u] = await users();
    assert.equal(u.googleId, '1000000000000000001');
    assert.equal(body.user.id, u.id);

    // The cookies startSession has always set: names, paths, lifetimes, flags.
    const c = cookiesOf(res);
    const expect = (name: string, path: string, maxAge: number) => {
      const ck = c[name];
      assert.ok(ck, `${name} not set`);
      for (const a of ['httponly', 'secure', 'samesite=strict', `path=${path}`, `max-age=${maxAge}`])
        assert.ok(ck.attrs.includes(a), `${name} is missing ${a}`);
      assert.ok(!ck.attrs.some((a) => a.startsWith('domain=')));
    };
    expect('__Host-sp_access', '/', 900);
    expect('__Secure-sp_refresh', '/api/auth', 604800);
    expect('__Host-sp_signed_in', '/', 604800);

    // The access token has the same claims as before, for this user.
    const claims = jwt.decode(c['__Host-sp_access'].value) as jwt.JwtPayload;
    assert.deepEqual(Object.keys(claims).sort(), ['aud', 'exp', 'iat', 'iss', 'jti', 'role', 'sid', 'sub']);
    assert.equal(claims.sub, u.id);
    const sessions = await ctx.db.select().from(ctx.schema.userSessions);
    assert.deepEqual(sessions.map((s) => s.id), [claims.sid]);

    // And it signs the user in to the rest of the app, unchanged.
    const meRes = await me.GET(new NextRequest('https://app.example.test/api/auth/me', {
      headers: { cookie: `__Host-sp_access=${c['__Host-sp_access'].value}` },
    }));
    assert.equal(meRes.status, 200);
    const meBody = await meRes.json();
    assert.equal(meBody.user.id, u.id);
    assert.ok(!('emailVerified' in meBody.user));
  });

  test('the same Google id signs in to the same account, even after an email change', async () => {
    const first = await (await signIn({ credential: googleToken(key) })).json();
    const second = await (await signIn({ credential: googleToken(key, { email: 'sita.new@gmail.com', name: 'Sita S.' }) })).json();
    assert.equal(second.user.id, first.user.id);
    const all = await users();
    assert.equal(all.length, 1);
    assert.equal(all[0].email, 'sita.new@gmail.com');
    // A different Google account with the old email is a different person.
    const other = await (await signIn({ credential: googleToken(key, { sub: '2000000000000000002', email: 'parent@gmail.com' }) })).json();
    assert.notEqual(other.user.id, first.user.id);
    assert.equal((await users()).length, 2);
  });

  test('two first sign-ins at once make one user', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => signIn({ credential: googleToken(key) })));
    assert.ok(results.every((r) => r.status === 200));
    const ids = new Set(await Promise.all(results.map(async (r) => (await r.json()).user.id)));
    assert.equal(ids.size, 1);
    assert.equal((await users()).length, 1);
  });

  test('every bad token is refused, and nothing is created', async () => {
    const bad: [string, unknown][] = [
      ['wrong aud', { credential: googleToken(key, { aud: 'other.apps.googleusercontent.com' }) }],
      ['wrong iss', { credential: googleToken(key, { iss: 'https://evil.example' }) }],
      ['expired', { credential: googleToken(key, {}, { expiresIn: -600 }) }],
      ['email not verified', { credential: googleToken(key, { email_verified: false }) }],
      ['tampered', { credential: googleToken(key).slice(0, -6) + 'AAAAAA' }],
      ['not Google\'s key', { credential: googleToken(makeKey('key-1')) }],
    ];
    for (const [why, body] of bad) {
      const res = await signIn(body);
      assert.equal(res.status, 401, why);
      assert.equal(res.headers.getSetCookie().length, 0, `${why}: a cookie was set`);
    }
    assert.equal((await signIn({})).status, 400, 'missing token');
    assert.equal((await signIn(null, 'not json')).status, 400, 'not json');
    assert.equal((await users()).length, 0);
    assert.equal((await ctx.db.select().from(ctx.schema.userSessions)).length, 0);
  });

  test('oversized bodies are refused before being read in full', async () => {
    const res = await signIn(null, JSON.stringify({ credential: googleToken(key), pad: 'x'.repeat(20_000) }));
    assert.equal(res.status, 413);
    assert.equal((await users()).length, 0);
  });

  test('POST only', () => {
    assert.deepEqual(Object.keys(route).filter((k) => /^[A-Z]+$/.test(k)), ['POST']);
  });

  describe('ADMIN_EMAILS', () => {
    const asAdminCheck = async (res: Response) => {
      const access = cookiesOf(res)['__Host-sp_access'].value;
      return adminRoute.GET(new NextRequest('https://app.example.test/api/admin/dashboard-metrics', {
        headers: { cookie: `__Host-sp_access=${access}` },
      }));
    };

    test('a listed email is an admin (any case), an unlisted one is not', async () => {
      process.env.ADMIN_EMAILS = ' Owner@Gmail.com , helper@gmail.com';
      const admin = await signIn({ credential: googleToken(key, { sub: 'a1', email: 'owner@gmail.com' }) });
      assert.equal((await admin.clone().json()).user.isAdmin, true);
      assert.equal((await asAdminCheck(admin)).status, 200);
      const parent = await signIn({ credential: googleToken(key, { sub: 'p1', email: 'parent@gmail.com' }) });
      assert.equal((await parent.clone().json()).user.isAdmin, false);
      assert.equal((await asAdminCheck(parent)).status, 403);
    });

    test('empty or unset: nobody is an admin', async () => {
      process.env.ADMIN_EMAILS = '';
      const r1 = await signIn({ credential: googleToken(key, { sub: 'a1', email: 'owner@gmail.com' }) });
      assert.equal((await r1.json()).user.isAdmin, false);
      delete process.env.ADMIN_EMAILS;
      const r2 = await signIn({ credential: googleToken(key, { sub: 'a1', email: 'owner@gmail.com' }) });
      assert.equal((await r2.json()).user.isAdmin, false);
    });

    test('removal takes effect at the next sign-in', async () => {
      process.env.ADMIN_EMAILS = 'owner@gmail.com';
      const before = await signIn({ credential: googleToken(key, { sub: 'a1', email: 'owner@gmail.com' }) });
      assert.equal((await asAdminCheck(before)).status, 200);
      process.env.ADMIN_EMAILS = 'someone-else@gmail.com';
      const after = await signIn({ credential: googleToken(key, { sub: 'a1', email: 'owner@gmail.com' }) });
      assert.equal((await after.clone().json()).user.isAdmin, false);
      assert.equal((await asAdminCheck(after)).status, 403);
      // getUserFromRequest reads isAdmin from the database, so the older
      // session lost admin at the same moment.
      assert.equal((await asAdminCheck(before)).status, 403);
    });
  });
});
