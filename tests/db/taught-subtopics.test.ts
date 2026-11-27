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

  test('a sub-topic under a topic already being studied takes its place; deleting it brings the topic back', async () => {
    const { db, sql } = ctx;
    const [sets] = (await db.execute(sql`select t.id, t.subject_id from topics t where t.name = 'Sets'`)).rows as { id: string; subject_id: string }[];
    const [plan] = (await db.execute(sql`select id from study_plans limit 1`)).rows as { id: string }[];
    const due = toDateString(addDays(appToday(), 5));
    await db.execute(sql`update topic_spaced_state set repetition_count = 2, interval_days = 6, status = 'reviewing',
      last_review_date = ${toDateString(appToday())}, next_review_date = ${due} where topic_id = ${sets.id}`);
    const curriculum = await import('@/app/api/students/[id]/curriculum/route');
    const [child] = (await db.execute(sql`select id from students limit 1`)).rows as { id: string }[];
    await db.execute(sql`update students set paid_until = now() + interval '30 days', payment_status = 'verified' where id = ${child.id}`);
    const save = (body: object) => curriculum.POST(new NextRequest('https://app.example.test/x', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ planId: plan.id, ...body }),
    }), { params: Promise.resolve({ id: child.id }) });
    const planned = async () => ((await db.execute(sql`
      select t.name, ss.session_type as type, ss.scheduled_date::text as d from study_sessions ss join topics t on t.id = ss.topic_id
       where ss.plan_id = ${plan.id} and ss.status = 'planned' and t.name in ('Sets', 'Venn diagrams') order by 3, 1`)).rows);

    assert.equal((await save({ topics: [{ subjectId: sets.subject_id, parentTopicId: sets.id, name: 'Venn diagrams' }] })).status, 201);
    const withSub = await planned();
    assert.ok(!withSub.some((r) => r.name === 'Sets'), 'Sets is a heading now: not on the plan');
    assert.ok(withSub.some((r) => r.name === 'Venn diagrams' && r.type === 'learn'), 'Venn diagrams is learned');

    const [venn] = (await db.execute(sql`select id from topics where name = 'Venn diagrams'`)).rows as { id: string }[];
    assert.equal((await save({ deletedTopicIds: [venn.id] })).status, 201);
    assert.deepEqual(await planned(), [{ name: 'Sets', type: 'review', d: due }], 'Sets is back, on its own review date');
  });

  test('the same topic as an earlier topic and as this exam\'s is refused', async () => {
    const route = await import('@/app/api/onboarding/route');
    const res = await route.POST(new NextRequest('https://app.example.test/x', {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({
        student: { name: 'Nima', grade: '9', schoolName: 'Test School' },
        exam: { name: 'Third Terminal Examination', examDate: toDateString(addDays(appToday(), 60)) },
        subjects: [{ name: 'Mathematics', examWeight: 'medium',
          earlierTopics: [{ name: 'Algebra', examName: 'First Terminal Examination' }],
          topics: [{ name: 'algebra' }] }],
      }),
    }));
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /listed twice in Mathematics/);
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
