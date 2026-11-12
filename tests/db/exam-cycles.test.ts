import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { SKIP_DB, setupTestDb, closeTestDb } from './helpers';
import { addDays, appToday, toDateString } from '@/lib/utils/date-utils';
import { academicYearOf } from '@/lib/utils/academic-year';

// Exam cycles: the last exam's topics move to revision days, a cycle can
// start before the results are out (and they can be added later), and the
// earlier topics are revised with ratings that decide where they're listed.

const inDays = (n: number) => toDateString(addDays(appToday(), n));

describe('exam cycles', { skip: SKIP_DB }, () => {
  let ctx: Awaited<ReturnType<typeof setupTestDb>>;
  let cookie = '';
  const parent = randomUUID();

  const request = (body: unknown) =>
    new NextRequest('https://app.example.test/x', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const startCycle = async (childId: string, body: unknown) => {
    const route = await import('@/app/api/students/[id]/exam-cycle/route');
    return route.POST(request(body), { params: Promise.resolve({ id: childId }) });
  };
  const addExamMarks = async (childId: string, body: unknown) => {
    const route = await import('@/app/api/students/[id]/exam-marks/route');
    return route.POST(request(body), { params: Promise.resolve({ id: childId }) });
  };

  /**
   * A child whose exam was `examAgo` days ago, with a plan for it, a
   * whole-subject English mark of 40 on that exam, and three Maths topics
   * taught for it: one due 5 days after the exam, one overdue, one new.
   */
  async function makeChild(examAgo: number, useBufferWeek: boolean) {
    const { db, schema } = ctx;
    const ids = {
      child: randomUUID(), exam: randomUUID(), plan: randomUUID(),
      maths: randomUUID(), english: randomUUID(),
      dueAfter: randomUUID(), overdue: randomUUID(), fresh: randomUUID(),
    };
    await db.insert(schema.students).values({
      id: ids.child, parentId: parent, name: 'Arjun', grade: '9',
      studyDays: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
      paidUntil: new Date(Date.now() + 30 * 864e5), paymentStatus: 'verified',
    });
    await db.insert(schema.exams).values({ id: ids.exam, studentId: ids.child, name: 'Mid-term', examDate: inDays(-examAgo) });
    await db.insert(schema.studyPlans).values({ id: ids.plan, studentId: ids.child, examId: ids.exam, totalDays: 90, averageDailyMinutes: 60, useBufferWeek });
    await db.insert(schema.subjects).values([
      { id: ids.maths, studentId: ids.child, name: 'Maths' },
      { id: ids.english, studentId: ids.child, name: 'English' },
    ]);
    await db.insert(schema.topics).values([
      { id: ids.dueAfter, subjectId: ids.maths, name: 'Algebra', examId: ids.exam, examName: 'Mid-term' },
      { id: ids.overdue, subjectId: ids.maths, name: 'Geometry', examId: ids.exam, examName: 'Mid-term' },
      { id: ids.fresh, subjectId: ids.maths, name: 'Statistics', examId: ids.exam, examName: 'Mid-term' },
    ]);
    await db.insert(schema.topicSpacedState).values([
      { topicId: ids.dueAfter, repetitionCount: 3, intervalDays: 5, status: 'reviewing', nextReviewDate: inDays(-examAgo + 5) },
      { topicId: ids.overdue, repetitionCount: 3, intervalDays: 5, status: 'reviewing', nextReviewDate: inDays(-examAgo - 3) },
      { topicId: ids.fresh },
    ]);
    const [sheet] = await db.insert(schema.assessments)
      .values({ studentId: ids.child, examId: ids.exam, assessmentDate: inDays(-examAgo - 30), assessmentName: 'Term 1 marksheet' })
      .returning();
    await db.insert(schema.marks).values({ assessmentId: sheet.id, subjectId: ids.english, obtainedMarks: 40, fullMarks: 100 });
    return ids;
  }
  const dueDate = async (topicId: string) => {
    const [s] = await ctx.db.select().from(ctx.schema.topicSpacedState).where(ctx.sql`topic_id = ${topicId}`);
    return s.nextReviewDate;
  };
  const newExam = async (childId: string) => {
    const [e] = await ctx.db.select().from(ctx.schema.exams)
      .where(ctx.sql`student_id = ${childId} and is_primary = true`);
    return e;
  };

  before(async () => {
    ctx = await setupTestDb();
    const { db, schema } = ctx;
    const { signAccessToken } = await import('@/lib/auth/jwt');
    const { accessCookie } = await import('@/lib/auth/cookies');
    await db.insert(schema.users).values({ id: parent, googleId: 'g-cycles', name: 'Ramesh', email: 'ramesh@gmail.com' });
    const [s] = await db.insert(schema.userSessions)
      .values({ userId: parent, expiresAt: new Date(Date.now() + 864e5) })
      .returning({ id: schema.userSessions.id });
    cookie = `${accessCookie().name}=${signAccessToken({ userId: parent, role: 'parent', sid: s.id })}`;
  });
  after(closeTestDb);

  test('marks can\'t be sent while the results are said to be pending', async () => {
    const ids = await makeChild(20, false);
    const res = await startCycle(ids.child, {
      name: 'Term 2', examDate: inDays(70), resultsPending: true,
      marks: [{ subjectId: ids.english, obtainedMarks: 70, fullMarks: 100 }],
    });
    assert.equal(res.status, 400);
  });

  // Exams around the Nepali new year (mid-April) can fall in different years.
  const sameYear = academicYearOf(inDays(-20)) === academicYearOf(inDays(40));
  test("missed topics of this academic year's earlier exams go straight onto the revision list", { skip: !sameYear && 'around the Nepali new year' }, async () => {
    const ids = await makeChild(20, false);
    const lastYear = randomUUID();
    await ctx.db.insert(ctx.schema.exams).values({ id: lastYear, studentId: ids.child, name: 'Final Examination', examDate: inDays(-400), isPrimary: false });

    const refused = await startCycle(ids.child, {
      name: 'Term 2', examDate: inDays(40), resultsPending: true,
      earlierTopics: [{ subjectId: ids.maths, name: 'Sets', examId: lastYear, examName: 'Final Examination' }],
    });
    assert.equal(refused.status, 400, "last year's exam isn't one of this year's");

    const res = await startCycle(ids.child, {
      name: 'Term 2', examDate: inDays(40), resultsPending: true,
      earlierTopics: [
        { subjectId: ids.maths, name: 'Sets', examName: 'First Terminal Examination', selfRating: 'know_well' },
        { subjectId: ids.maths, name: 'Vectors', examName: 'First Terminal Examination', selfRating: 'not_sure' },
        { subjectId: ids.english, name: 'Grammar', examId: ids.exam, examName: 'whatever is sent' },
      ],
    });
    assert.equal(res.status, 201);
    const rows = (await ctx.db.execute(ctx.sql`
      select t.name, t.exam_id, t.exam_name, t.self_rating, t.learn_from from topics t
      join subjects s on s.id = t.subject_id where s.student_id = ${ids.child} and t.name in ('Sets', 'Grammar')
      order by t.name`)).rows;
    assert.deepEqual(rows, [
      { name: 'Grammar', exam_id: ids.exam, exam_name: 'Mid-term', self_rating: null, learn_from: null },
      { name: 'Sets', exam_id: null, exam_name: 'First Terminal Examination', self_rating: 'know_well', learn_from: null },
    ]);

    // On the Revise page, not yet revised, they're listed by how they've gone
    // so far: English's last marks were 40%, so Grammar needs it most too.
    const route = await import('@/app/api/students/[id]/revision/route');
    const body = await (await route.GET(request({}), { params: Promise.resolve({ id: ids.child }) })).json();
    const names = Object.fromEntries(
      (body.headings as { heading: string; topics: { name: string; standingReason: string | null }[] }[]).map((h) => [
        h.heading,
        h.topics.map((t) => `${t.name}${t.standingReason ? `: ${t.standingReason}` : ''}`).sort(),
      ]),
    );
    assert.deepEqual(names, {
      needs: ['Grammar: Low test marks', 'Vectors: Marked not sure'],
      notYet: ['Algebra', 'Geometry', 'Statistics'],
      known: ['Sets: Marked know it well'],
    });
  });

  const planTopics = async (examId: string) =>
    ((await ctx.db.execute(ctx.sql`
      select distinct ss.topic_id from study_sessions ss
      join study_plans p on p.id = ss.plan_id where p.exam_id = ${examId}`)).rows as { topic_id: string }[])
      .map((r) => r.topic_id);

  describe('a cycle started 20 days after the exam, results not out yet', () => {
    let ids: Awaited<ReturnType<typeof makeChild>>;
    before(async () => {
      ids = await makeChild(20, false);
      const res = await startCycle(ids.child, {
        name: 'Term 2', examDate: inDays(70), resultsPending: true,
        newSubjects: [{ name: 'Computer', examWeight: 'medium', topics: [{ name: 'QBASIC' }, { name: 'HTML' }] }],
      });
      assert.equal(res.status, 201);
    });

    test('the new exam has its plan from the start', async () => {
      const [plan] = await ctx.db.select().from(ctx.schema.studyPlans).where(ctx.sql`exam_id = ${(await newExam(ids.child)).id}`);
      assert.ok(plan);
    });

    test("the last exam's topics move to revision: none is on the new plan, and no due date was moved", async () => {
      const onPlan = await planTopics((await newExam(ids.child)).id);
      assert.ok(![ids.dueAfter, ids.overdue, ids.fresh].some((id) => onPlan.includes(id)));
      assert.equal(await dueDate(ids.dueAfter), inDays(-20 + 5), 'no pause: nothing about it changed');
    });

    test("a new subject's topics belong to the new exam and start from tomorrow", async () => {
      const exam = await newExam(ids.child);
      const rows = (await ctx.db.execute(ctx.sql`
        select exam_id, learn_from::text as learn_from from topics where name in ('QBASIC', 'HTML')`)).rows as { exam_id: string; learn_from: string }[];
      assert.equal(rows.length, 2);
      assert.ok(rows.every((r) => r.exam_id === exam.id && r.learn_from > inDays(0)));
    });

    test('the new exam remembers whose results are still to come', async () => {
      assert.equal((await newExam(ids.child)).resultsPendingFor, ids.exam);
    });

    test('until the results are added, analysis uses the latest earlier marksheet', async () => {
      const { loadSubjectInputs } = await import('@/lib/plan-inputs');
      const exam = await newExam(ids.child);
      const english = (await loadSubjectInputs(ids.child, exam.id)).find((s) => s.name === 'English')!;
      assert.deepEqual(english.marksHistory.records.map((r) => r.percent), [40]);
    });

    test('"Add exam marks" saves them for this cycle, dated on the exam they came from', async () => {
      const res = await addExamMarks(ids.child, {
        marks: [{ subjectId: ids.english, obtainedMarks: 70, fullMarks: 100 }],
      });
      assert.equal(res.status, 201);
      const exam = await newExam(ids.child);
      assert.equal(exam.resultsPendingFor, null);
      const [sheet] = await ctx.db.select().from(ctx.schema.assessments)
        .where(ctx.sql`student_id = ${ids.child} and exam_id = ${exam.id}`);
      assert.equal(sheet.assessmentName, 'Mid-term marksheet');
      assert.equal(sheet.assessmentDate, inDays(-20));

      const { loadSubjectInputs } = await import('@/lib/plan-inputs');
      const english = (await loadSubjectInputs(ids.child, exam.id)).find((s) => s.name === 'English')!;
      assert.deepEqual(english.marksHistory.records.map((r) => r.percent), [70], 'now only this cycle\'s marks');
    });

    test('adding them twice is refused', async () => {
      const res = await addExamMarks(ids.child, {
        marks: [{ subjectId: ids.english, obtainedMarks: 70, fullMarks: 100 }],
      });
      assert.equal(res.status, 409);
    });

    describe('revising the earlier topics', () => {
      const revision = async () => {
        const route = await import('@/app/api/students/[id]/revision/route');
        return route.GET(request({}), { params: Promise.resolve({ id: ids.child }) });
      };
      const revise = async (topicId: string, rating: number) => {
        const route = await import('@/app/api/students/[id]/revision/route');
        return route.POST(request({ topicId, rating }), { params: Promise.resolve({ id: ids.child }) });
      };
      const headings = async () => {
        const body = await (await revision()).json();
        assert.equal(body.state, 'active');
        return Object.fromEntries(
          (body.headings as { heading: string; topics: { id: string }[] }[]).map((h) => [h.heading, h.topics.map((t) => t.id)]),
        );
      };

      test('all three start under "Not yet revised"', async () => {
        const h = await headings();
        assert.deepEqual([...(h.notYet ?? [])].sort(), [ids.dueAfter, ids.overdue, ids.fresh].sort());
      });

      test('Hard moves one under "Rated hard", Easy another under "What you found easy"', async () => {
        assert.equal((await revise(ids.dueAfter, 2)).status, 201);
        assert.equal((await revise(ids.fresh, 4)).status, 201);
        const h = await headings();
        assert.deepEqual(h.hard, [ids.dueAfter]);
        assert.deepEqual(h.easy, [ids.fresh]);
        assert.deepEqual(h.notYet, [ids.overdue]);
      });

      test('Again puts it back on the daily list: on the plan from the next school day', async () => {
        const res = await revise(ids.overdue, 1);
        assert.equal(res.status, 201);
        assert.equal((await res.json()).backOnDailyList, true);
        const h = await headings();
        assert.deepEqual(h.back, [ids.overdue]);
        const onPlan = await planTopics((await newExam(ids.child)).id);
        assert.ok(onPlan.includes(ids.overdue));
        assert.ok(!onPlan.includes(ids.dueAfter), 'the others stay off the daily list');
      });

      test("this exam's own topics can't be revised here", async () => {
        const [qbasic] = (await ctx.db.execute(ctx.sql`select id from topics where name = 'QBASIC'`)).rows as { id: string }[];
        assert.equal((await revise(qbasic.id, 3)).status, 400);
      });
    });
  });
});
