import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';
import { addDays, appToday, toDateString } from '@/lib/utils/date-utils';

// Onboarding with a topic taught so far and its sub-topics: the sub-topics
// are what gets studied, the topic is their heading.

describe('sub-topics taught so far', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  let cookie = '';
  const parent = randomUUID();

  before(async () => {
    ctx = await setupTestDb();
    const { db, schema } = ctx;
    const { signAccessToken } = await import('@/lib/auth/jwt');
    const { accessCookie } = await import('@/lib/auth/cookies');
    await db.insert(schema.users).values({ id: parent, googleId: 'g-sub', name: 'Rita', email: 'rita@gmail.com' });
    const [s] = await db.insert(schema.userSessions).values({ userId: parent, expiresAt: new Date(Date.now() + 864e5) }).returning({ id: schema.userSessions.id });
    cookie = `${accessCookie().name}=${signAccessToken({ userId: parent, role: 'parent', sid: s.id })}`;
  });
  after(closeTestDb);

  test('Algebra with Functions and Indices: the sub-topics are learned, Algebra is not', async () => {
    const route = await import('@/app/api/onboarding/route');
    const res = await route.POST(new NextRequest('https://app.example.test/x', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        student: { name: 'Nima', grade: '9', schoolName: 'Test School' },
        exam: { name: 'First Terminal Examination', examDate: toDateString(addDays(appToday(), 60)) },
        subjects: [{ name: 'Mathematics', examWeight: 'medium', topics: [
          { name: 'Algebra', subTopics: [{ name: 'Functions', difficultyRating: 3 }, { name: 'Indices' }] },
          { name: 'Sets' },
        ] }],
      }),
    }));
    assert.equal(res.status, 201);
    const rows = (await ctx.db.execute(ctx.sql`
      select t.name, p.name as parent, t.learn_from is not null as learns,
             exists (select 1 from study_sessions ss where ss.topic_id = t.id and ss.session_type = 'learn') as listed
        from topics t left join topics p on p.id = t.parent_topic_id order by t.created_at, t.name`)).rows;
    assert.deepEqual(
      rows.map((r) => [r.name, r.parent, r.learns, r.listed]).sort(),
      [
        ['Algebra', null, false, false],
        ['Functions', 'Algebra', true, true],
        ['Indices', 'Algebra', true, true],
        ['Sets', null, true, true],
      ],
    );
  });

  test('the same sub-topic twice under one topic is refused', async () => {
    const route = await import('@/app/api/onboarding/route');
    const res = await route.POST(new NextRequest('https://app.example.test/x', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        student: { name: 'Nima', grade: '9', schoolName: 'Test School' },
        exam: { name: 'First Terminal Examination', examDate: toDateString(addDays(appToday(), 60)) },
        subjects: [{ name: 'Mathematics', examWeight: 'medium', topics: [{ name: 'Algebra', subTopics: [{ name: 'Functions' }, { name: 'functions' }] }] }],
      }),
    }));
    assert.equal(res.status, 400);
  });
});
