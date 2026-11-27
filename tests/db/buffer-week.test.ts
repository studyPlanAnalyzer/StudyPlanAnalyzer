import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';
import { addDays, appToday, toDateString } from '@/lib/utils/date-utils';

// The buffer week: once it has begun nothing is listed, even after sessions
// were missed before it (opening Today used to refill the week up to the exam).

const inDays = (n: number) => toDateString(addDays(appToday(), n));

describe('buffer week', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  let cookie = '';
  const parent = randomUUID();
  const ids = { child: randomUUID(), exam: randomUUID(), plan: randomUUID(), maths: randomUUID(), topic: randomUUID() };

  before(async () => {
    ctx = await setupTestDb();
    const { db, schema } = ctx;
    const { signAccessToken } = await import('@/lib/auth/jwt');
    const { accessCookie } = await import('@/lib/auth/cookies');
    await db.insert(schema.users).values({ id: parent, googleId: 'g-buffer', name: 'Sita', email: 'sita@gmail.com' });
    const [s] = await db.insert(schema.userSessions).values({ userId: parent, expiresAt: new Date(Date.now() + 864e5) }).returning({ id: schema.userSessions.id });
    cookie = `${accessCookie().name}=${signAccessToken({ userId: parent, role: 'parent', sid: s.id })}`;
    // Exam in 4 days with the buffer week on: it began 3 days ago.
    await db.insert(schema.students).values({ id: ids.child, parentId: parent, name: 'Ram', grade: '9', studyDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], paidUntil: new Date(Date.now() + 30 * 864e5), paymentStatus: 'verified' });
    await db.insert(schema.exams).values({ id: ids.exam, studentId: ids.child, name: 'Third Terminal Examination', examDate: inDays(4) });
    await db.insert(schema.studyPlans).values({ id: ids.plan, studentId: ids.child, examId: ids.exam, totalDays: 30, averageDailyMinutes: 30, useBufferWeek: true });
    await db.insert(schema.subjects).values({ id: ids.maths, studentId: ids.child, name: 'Maths' });
    await db.insert(schema.topics).values({ id: ids.topic, subjectId: ids.maths, name: 'Algebra', examId: ids.exam, examName: 'Third Terminal Examination' });
    await db.insert(schema.topicSpacedState).values({ topicId: ids.topic, repetitionCount: 2, intervalDays: 6, status: 'reviewing', nextReviewDate: inDays(-5) });
    // A review from before the buffer week that was never done.
    await db.insert(schema.studySessions).values({ planId: ids.plan, topicId: ids.topic, subjectId: ids.maths, scheduledDate: inDays(-5), durationMinutes: 20, sessionType: 'review', status: 'planned' });
  });
  after(closeTestDb);

  test('opening Today in the buffer week lists nothing, and the missed review is history', async () => {
    const route = await import('@/app/api/plans/[planId]/catch-up/route');
    const res = await route.POST(
      new NextRequest('https://app.example.test/x', { method: 'POST', headers: { cookie } }),
      { params: Promise.resolve({ planId: ids.plan }) },
    );
    assert.equal(res.status, 200);
    const rows = (await ctx.db.execute(ctx.sql`select scheduled_date::text as d, status from study_sessions where plan_id = ${ids.plan} order by 1`)).rows as { d: string; status: string }[];
    assert.deepEqual(rows, [{ d: inDays(-5), status: 'skipped' }]);
  });
});
