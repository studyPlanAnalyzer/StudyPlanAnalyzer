import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';
import { addDays, appToday, toDateString } from '@/lib/utils/date-utils';

// Optional "free choice" sessions are placeholders that fill spare minutes.
// They have no rating and never touch a topic's review schedule. And finishing
// the day's last required session, which rebuilds the plan from tomorrow, must
// leave today's optional session open: the day isn't over.

const inDays = (n: number) => toDateString(addDays(appToday(), n));

describe('optional sessions', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  let cookie = '';
  const ids = {
    parent: randomUUID(), child: randomUUID(), exam: randomUUID(),
    english: randomUUID(), grammar: randomUUID(), plan: randomUUID(),
  };

  const put = async (id: string, body: unknown) => {
    const route = await import('@/app/api/sessions/[id]/route');
    return route.PUT(
      new NextRequest('https://app.example.test/x', {
        method: 'PUT',
        headers: { cookie, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ id }) },
    );
  };

  const status = async (id: string) => {
    const [s] = await ctx.db
      .select()
      .from(ctx.schema.studySessions)
      .where(ctx.sql`id = ${id}`);
    return s?.status;
  };

  const addSession = async (scheduledDate: string, isFiller: boolean, topicId = ids.grammar) => {
    const id = randomUUID();
    await ctx.db.insert(ctx.schema.studySessions).values({
      id, planId: ids.plan, topicId, subjectId: ids.english,
      scheduledDate, durationMinutes: 20,
      sessionType: isFiller ? 'practice' : 'learn', isFiller,
    });
    return id;
  };

  before(async () => {
    ctx = await setupTestDb();
    const { db, schema } = ctx;
    const { signAccessToken } = await import('@/lib/auth/jwt');
    const { accessCookie } = await import('@/lib/auth/cookies');
    await db.insert(schema.users).values({ id: ids.parent, googleId: 'g-parent', name: 'Ramesh', email: 'ramesh@gmail.com' });
    await db.insert(schema.students).values({
      id: ids.child, parentId: ids.parent, name: 'Arjun', grade: '9',
      studyDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      paidUntil: new Date(Date.now() + 30 * 864e5), paymentStatus: 'verified',
    });
    await db.insert(schema.exams).values({ id: ids.exam, studentId: ids.child, name: 'Final', examDate: inDays(30) });
    await db.insert(schema.subjects).values({ id: ids.english, studentId: ids.child, name: 'English' });
    await db.insert(schema.topics).values({ id: ids.grammar, subjectId: ids.english, name: 'Grammar' });
    await db.insert(schema.topicSpacedState).values({ topicId: ids.grammar });
    await db.insert(schema.studyPlans).values({ id: ids.plan, studentId: ids.child, examId: ids.exam, totalDays: 30, averageDailyMinutes: 60 });
    const [s] = await db.insert(schema.userSessions)
      .values({ userId: ids.parent, expiresAt: new Date(Date.now() + 864e5) })
      .returning({ id: schema.userSessions.id });
    cookie = `${accessCookie().name}=${signAccessToken({ userId: ids.parent, role: 'parent', sid: s.id })}`;
  });
  after(closeTestDb);

  test("rating the day's last required session leaves today's optional one open", async () => {
    const learn = await addSession(inDays(0), false);
    const optional = await addSession(inDays(0), true);
    const pastOptional = await addSession(inDays(-1), true);

    const res = await put(learn, { status: 'completed', rating: 3 });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).planUpdated, true, 'the plan should have been rebuilt');

    assert.equal(await status(learn), 'completed');
    assert.equal(await status(optional), 'planned');
    assert.equal(await status(pastOptional), 'skipped', 'a day already over is still history');

    // And it can still be done afterwards.
    assert.equal((await put(optional, { status: 'completed' })).status, 200);
    assert.equal(await status(optional), 'completed');
  });

  test("skipping the day's last required session leaves it open too", async () => {
    const { db, schema } = ctx;
    await db.delete(schema.studySessions);
    const learn = await addSession(inDays(0), false);
    const optional = await addSession(inDays(0), true);

    assert.equal((await put(learn, { status: 'skipped' })).status, 200);
    assert.equal(await status(optional), 'planned');
  });

  describe('never touch the review schedule', () => {
    const fresh = async () => {
      const { db, schema } = ctx;
      await db.delete(schema.studySessions);
      await db.delete(schema.topicReviews);
      await db.delete(schema.topicSpacedState);
      await db.insert(schema.topicSpacedState).values({ topicId: ids.grammar });
    };
    const spaced = async () => {
      const [s] = await ctx.db
        .select()
        .from(ctx.schema.topicSpacedState)
        .where(ctx.sql`topic_id = ${ids.grammar}`);
      return s;
    };
    const reviews = () => ctx.db.select().from(ctx.schema.topicReviews);

    test('an optional session is completed with no rating', async () => {
      await fresh();
      const optional = await addSession(inDays(0), true);
      const res = await put(optional, { status: 'completed' });
      assert.equal(res.status, 200);
      const [s] = await ctx.db.select().from(ctx.schema.studySessions).where(ctx.sql`id = ${optional}`);
      assert.equal(s.status, 'completed');
      assert.equal(s.rating, null);
      assert.equal((await spaced()).nextReviewDate, null);
      assert.equal((await reviews()).length, 0);
    });

    test('a rating sent anyway, as a page opened before the change would, is ignored', async () => {
      await fresh();
      const optional = await addSession(inDays(0), true);
      assert.equal((await put(optional, { status: 'completed', rating: 1 })).status, 200);
      const [s] = await ctx.db.select().from(ctx.schema.studySessions).where(ctx.sql`id = ${optional}`);
      assert.equal(s.status, 'completed');
      assert.equal(s.rating, null);
      assert.equal((await spaced()).nextReviewDate, null);
      assert.equal((await spaced()).repetitionCount, 0);
      assert.equal((await reviews()).length, 0);
    });

    test('a topic that is due is not moved by an optional session either', async () => {
      await fresh();
      await ctx.db.update(ctx.schema.topicSpacedState)
        .set({ nextReviewDate: inDays(0), repetitionCount: 3, intervalDays: 15 })
        .where(ctx.sql`topic_id = ${ids.grammar}`);
      const optional = await addSession(inDays(0), true);
      await put(optional, { status: 'completed', rating: 1 });
      const after = await spaced();
      assert.equal(after.repetitionCount, 3);
      assert.equal(after.nextReviewDate, inDays(0));
    });

    test('doing the optional session first leaves the required rating as the one that counts', async () => {
      await fresh();
      const optional = await addSession(inDays(0), true);
      const learn = await addSession(inDays(0), false);
      await put(optional, { status: 'completed', rating: 1 });
      assert.equal((await put(learn, { status: 'completed', rating: 3 })).status, 200);
      assert.equal((await spaced()).repetitionCount, 1);
      assert.equal((await reviews()).length, 1);
    });

    test("an optional session can't take away a topic's Learn session", async () => {
      await fresh();
      const { db, schema } = ctx;
      const tenses = randomUUID();
      await db.insert(schema.topics).values({ id: tenses, subjectId: ids.english, name: 'Tenses' });
      await db.insert(schema.topicSpacedState).values({ topicId: tenses });
      const optional = await addSession(inDays(0), true, tenses);
      const learn = await addSession(inDays(0), false);

      await put(optional, { status: 'completed', rating: 3 });
      const res = await put(learn, { status: 'completed', rating: 3 });
      assert.equal((await res.json()).planUpdated, true);

      const ahead = await db.select().from(schema.studySessions)
        .where(ctx.sql`topic_id = ${tenses} and is_filler = false and status = 'planned'`);
      assert.ok(ahead.some((s) => s.sessionType === 'learn'), 'Tenses should still have its Learn session');
    });

    test('a required session still needs a rating', async () => {
      await fresh();
      const learn = await addSession(inDays(0), false);
      assert.equal((await put(learn, { status: 'completed' })).status, 400);
    });
  });
});
