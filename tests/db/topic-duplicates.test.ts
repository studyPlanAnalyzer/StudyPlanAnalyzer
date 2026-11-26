import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';

// Subjects page saves: a topic name can be used once per place (a subject's
// topics, or one topic's sub-topics).

describe('duplicate topic names', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  let cookie = '';
  const parent = randomUUID();
  const ids = { child: randomUUID(), science: randomUUID(), maths: randomUUID(), biology: randomUUID() };
  const save = async (body: unknown) => {
    const route = await import('@/app/api/students/[id]/curriculum/route');
    return route.POST(
      new NextRequest('https://app.example.test/x', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }),
      { params: Promise.resolve({ id: ids.child }) },
    );
  };

  before(async () => {
    ctx = await setupTestDb();
    const { db, schema } = ctx;
    const { signAccessToken } = await import('@/lib/auth/jwt');
    const { accessCookie } = await import('@/lib/auth/cookies');
    await db.insert(schema.users).values({ id: parent, googleId: 'g-dup', name: 'Gita', email: 'gita@gmail.com' });
    const [s] = await db.insert(schema.userSessions).values({ userId: parent, expiresAt: new Date(Date.now() + 864e5) }).returning({ id: schema.userSessions.id });
    cookie = `${accessCookie().name}=${signAccessToken({ userId: parent, role: 'parent', sid: s.id })}`;
    await db.insert(schema.students).values({ id: ids.child, parentId: parent, name: 'Hari', grade: '9', studyDays: ['Mon'], paidUntil: new Date(Date.now() + 30 * 864e5), paymentStatus: 'verified' });
    await db.insert(schema.subjects).values([{ id: ids.science, studentId: ids.child, name: 'Science' }, { id: ids.maths, studentId: ids.child, name: 'Mathematics' }]);
    await db.insert(schema.topics).values({ id: ids.biology, subjectId: ids.science, name: 'Biology' });
  });
  after(closeTestDb);

  test('the same name again in the same subject is refused, whatever its case', async () => {
    const res = await save({ topics: [{ subjectId: ids.science, name: '  biology ' }] });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /already a topic/);
  });

  test('two new topics with the same name in one save are refused', async () => {
    assert.equal((await save({ topics: [{ subjectId: ids.science, name: 'Physics' }, { subjectId: ids.science, name: 'physics' }] })).status, 400);
  });

  test('the same name is fine in another subject, or as a sub-topic', async () => {
    assert.equal((await save({ topics: [{ subjectId: ids.maths, name: 'Biology' }] })).status, 201);
    assert.equal((await save({ topics: [{ subjectId: ids.science, parentTopicId: ids.biology, name: 'Biology' }] })).status, 201);
  });

  test('deleting a topic frees its name in the same save', async () => {
    const [chem] = await ctx.db.insert(ctx.schema.topics).values({ subjectId: ids.science, name: 'Chemistry' }).returning();
    assert.equal((await save({ deletedTopicIds: [chem.id], topics: [{ subjectId: ids.science, name: 'Chemistry' }] })).status, 201);
  });
});
