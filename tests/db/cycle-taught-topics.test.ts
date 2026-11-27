import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';
import { addDays, appToday, toDateString } from '@/lib/utils/date-utils';

// A new exam cycle with topics already taught for it in a subject the child
// already has: a new topic (Physics > Light, with a sub-topic) and a new
// sub-topic under an existing topic (Physics > Force > Friction).

const inDays = (n: number) => toDateString(addDays(appToday(), n));

describe('new exam cycle: taught topics in existing subjects', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  let cookie = '';
  const parent = randomUUID();
  const ids = { child: randomUUID(), exam: randomUUID(), physics: randomUUID(), force: randomUUID(), sound: randomUUID() };
  const cycle = async (body: unknown) => {
    const route = await import('@/app/api/students/[id]/exam-cycle/route');
    return route.POST(
      new NextRequest('https://app.example.test/x', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: ids.child }) },
    );
  };
  const base = { name: 'Second Terminal Examination', examDate: inDays(60), resultsPending: true };

  before(async () => {
    ctx = await setupTestDb();
    const { db, schema } = ctx;
    const { signAccessToken } = await import('@/lib/auth/jwt');
    const { accessCookie } = await import('@/lib/auth/cookies');
    await db.insert(schema.users).values({ id: parent, googleId: 'g-ct', name: 'Mina', email: 'mina@gmail.com' });
    const [s] = await db.insert(schema.userSessions).values({ userId: parent, expiresAt: new Date(Date.now() + 864e5) }).returning({ id: schema.userSessions.id });
    cookie = `${accessCookie().name}=${signAccessToken({ userId: parent, role: 'parent', sid: s.id })}`;
    await db.insert(schema.students).values({ id: ids.child, parentId: parent, name: 'Ravi', grade: '9', studyDays: ['Mon'], paidUntil: new Date(Date.now() + 30 * 864e5), paymentStatus: 'verified' });
    await db.insert(schema.exams).values({ id: ids.exam, studentId: ids.child, name: 'First Terminal Examination', examDate: inDays(-3) });
    await db.insert(schema.subjects).values({ id: ids.physics, studentId: ids.child, name: 'Physics' });
    await db.insert(schema.topics).values([
      { id: ids.force, subjectId: ids.physics, name: 'Force and motion', examId: ids.exam, examName: 'First Terminal Examination' },
      { id: ids.sound, subjectId: ids.physics, name: 'Sound', examId: ids.exam, examName: 'First Terminal Examination' },
    ]);
  });
  after(closeTestDb);

  test('a name already used there is refused, and nothing is saved', async () => {
    const res = await cycle({ ...base, taughtTopics: [{ subjectId: ids.physics, name: 'sound' }] });
    assert.equal(res.status, 400);
    const exams = (await ctx.db.execute(ctx.sql`select count(*)::int n from exams where student_id = ${ids.child}`)).rows as { n: number }[];
    assert.equal(exams[0].n, 1);
  });

  test('a missed earlier topic with a name already used in the subject is refused', async () => {
    const res = await cycle({ ...base, earlierTopics: [{ subjectId: ids.physics, name: 'Force and Motion', examName: 'First Terminal Examination' }] });
    assert.equal(res.status, 400);
  });

  test('Light (with Refraction) and Force > Friction are added for the new exam and start from tomorrow', async () => {
    const res = await cycle({ ...base, taughtTopics: [
      { subjectId: ids.physics, name: 'Light', subTopics: [{ name: 'Refraction', difficultyRating: 3 }] },
      { subjectId: ids.physics, parentTopicId: ids.force, name: 'Friction' },
    ] });
    assert.equal(res.status, 201);
    const rows = (await ctx.db.execute(ctx.sql`
      select t.name, p.name as parent, e.name as exam, t.learn_from is not null as learns
        from topics t left join topics p on p.id = t.parent_topic_id left join exams e on e.id = t.exam_id
       where t.name in ('Light', 'Refraction', 'Friction') order by t.name`)).rows;
    assert.deepEqual(rows, [
      { name: 'Friction', parent: 'Force and motion', exam: 'Second Terminal Examination', learns: true },
      { name: 'Light', parent: null, exam: 'Second Terminal Examination', learns: false },
      { name: 'Refraction', parent: 'Light', exam: 'Second Terminal Examination', learns: true },
    ]);
  });
});
