import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { insertTopicRows } from '@/lib/topic-leaves';
import {
  subjectNameSchema,
  findNameClash,
  clashMessage,
} from '@/lib/subject-name';
import { saveMarks, type NewMark } from '@/lib/save-mark';
import { toDateString, appToday } from '@/lib/utils/date-utils';
import { marksheetEntrySchema, marksheetProblem } from '@/lib/exam-cycle';
import { createPlanForExam } from '@/lib/plan-create';
import { sm2Days, spreadLearnFrom } from '@/lib/utils/revision-days';
import { academicYearLabel, academicYearOf } from '@/lib/utils/academic-year';
import { paymentRequiredResponse } from '@/lib/billing/guard';
import {
  dateStringSchema,
  examDateProblem,
  fullMarksSchema,
} from '@/lib/validation';

const level = z.enum(['low', 'medium', 'high']);
const name = z.string().trim().min(1).max(200);

const bodySchema = z.object({
  name,
  examDate: dateStringSchema,
  // The last exam's results aren't out yet: no marks now, "Add exam marks" later.
  resultsPending: z.boolean().default(false),
  // Latest marks for subjects the child already has (blank ones are left out).
  marks: z.array(marksheetEntrySchema).default([]),
  // Subjects studied for the first time this cycle, with any topics already
  // taught (they start over the next days, 4 a day). No marks: they have none.
  newSubjects: z
    .array(
      z.object({
        name: subjectNameSchema,
        fullMarks: fullMarksSchema.default(100),
        examWeight: level,
        topics: z
          .array(
            z.object({
              name,
              difficultyRating: z.number().int().min(1).max(5).default(2),
            }),
          )
          .default([]),
      }),
    )
    .default([]),
  // Topics of this academic year's earlier exams that were never listed:
  // straight onto the revision list, for the exam they were studied for (one
  // of the child's exams this year, or one from before they joined).
  earlierTopics: z
    .array(
      z.object({
        subjectId: z.string().uuid(),
        name,
        examId: z.string().uuid().optional(),
        examName: name,
        selfRating: z.enum(['not_sure', 'ok', 'know_well']).optional(),
      }),
    )
    .max(500)
    .default([]),
});

/**
 * Starts a new exam cycle in ONE request and ONE transaction: retires the old
 * exam, creates the new one with its study plan, records the marksheet (marks
 * and topic mastery), adds any brand-new subjects with their topics, and any
 * topics of this academic year's earlier exams that were missed. Every
 * topic of the earlier exams moves to revision days from now on (it is no
 * longer this exam's), so nothing on SM-2 carries over the break. If the last
 * exam's results aren't out yet, the marks are left for "Add exam marks"
 * (exam-marks route) and the new exam remembers which exam they belong to.
 * If anything fails, nothing is saved.
 *
 * All reading happens up front in a single parallel round; the transaction
 * then uses a fixed number of statements (about 15) however many subjects,
 * topics and marks there are.
 */
export const POST = withErrorHandling(
  async (req: NextRequest, props: { params: Promise<{ id: string }> }) => {
    const params = await props.params;
    const userId = await getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { name: examName, examDate, marks, newSubjects, resultsPending, earlierTopics } = parsed.data;

    // One parallel round of reads. Nothing is returned from them until the
    // ownership check below passes.
    const [students, exams, subjects, topics] = await Promise.all([
      db
        .select()
        .from(schema.students)
        .where(
          and(
            eq(schema.students.id, params.id),
            eq(schema.students.parentId, userId),
          ),
        )
        .limit(1),
      db
        .select({
          id: schema.exams.id,
          name: schema.exams.name,
          examDate: schema.exams.examDate,
          isPrimary: schema.exams.isPrimary,
        })
        .from(schema.exams)
        .where(eq(schema.exams.studentId, params.id)),
      db
        .select({
          id: schema.subjects.id,
          name: schema.subjects.name,
          orderIndex: schema.subjects.orderIndex,
          isActive: schema.subjects.isActive,
        })
        .from(schema.subjects)
        .where(eq(schema.subjects.studentId, params.id)),
      db
        .select({
          id: schema.topics.id,
          subjectId: schema.topics.subjectId,
        })
        .from(schema.topics)
        .innerJoin(
          schema.subjects,
          eq(schema.subjects.id, schema.topics.subjectId),
        )
        .where(eq(schema.subjects.studentId, params.id)),
    ]);
    const student = students[0];
    if (!student)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    const denied = paymentRequiredResponse(student);
    if (denied) return denied;

    const today = toDateString(appToday());
    const examDateError = examDateProblem(examDate);
    if (examDateError)
      return NextResponse.json({ error: examDateError }, { status: 400 });

    // Only one exam is active at a time: a new cycle starts after the last exam.
    const active = exams.find((e) => e.isPrimary && e.examDate > today);
    if (active)
      return NextResponse.json(
        {
          error: `There's already an active exam cycle ("${active.name}", ending ${active.examDate}) that hasn't happened yet. A new exam cycle can only start once the current one is over. If you need this exam to end sooner, go to Settings and edit the exam date there instead of starting a new cycle.`,
        },
        { status: 409 },
      );

    // Marks must be for this child's subjects and topics, and make sense.
    const problem = marksheetProblem(
      marks,
      new Set(subjects.map((s) => s.id)),
      new Map(topics.map((t) => [t.id, t.subjectId])),
    );
    if (problem) return NextResponse.json({ error: problem.error }, { status: problem.status });
    if (resultsPending && marks.length > 0)
      return NextResponse.json(
        { error: "The results aren't out yet, so leave the marks for later and add them with \"Add exam marks\"." },
        { status: 400 },
      );
    // Existing subjects first, so a clash names the one already there.
    const clash = findNameClash(
      subjects.map((s) => s.name),
      newSubjects.map((s) => s.name),
    );
    if (clash)
      return NextResponse.json({ error: clashMessage(clash) }, { status: 400 });

    // Missed earlier topics: for the child's own subjects, and for an exam of
    // the same academic year as the new one.
    const activeSubjects = new Set(subjects.filter((s) => s.isActive).map((s) => s.id));
    if (earlierTopics.some((t) => !activeSubjects.has(t.subjectId)))
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    const year = academicYearOf(examDate);
    const examById = new Map(exams.map((e) => [e.id, e]));
    if (
      earlierTopics.some((t) => {
        const e = t.examId ? examById.get(t.examId) : undefined;
        return t.examId && (!e || academicYearOf(e.examDate) !== year);
      })
    )
      return NextResponse.json(
        { error: `Choose one of the ${academicYearLabel(year)} exams these topics were studied for.` },
        { status: 400 },
      );

    const nextOrder =
      subjects.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1;

    // The exam this cycle follows: the latest one already over.
    const previous = exams
      .filter((e) => e.examDate <= today)
      .sort((a, b) => b.examDate.localeCompare(a.examDate))[0];

    const exam = await db.transaction(async (tx) => {
      // The new exam becomes the only primary one.
      await tx
        .update(schema.exams)
        .set({ isPrimary: false })
        .where(eq(schema.exams.studentId, student.id));
      const [created] = await tx
        .insert(schema.exams)
        .values({
          studentId: student.id,
          name: examName,
          examDate,
          isPrimary: true,
          resultsPendingFor: resultsPending ? (previous?.id ?? null) : null,
        })
        .returning();

      // New subjects and all their topics, and any missed earlier topics: two
      // statements each for the whole lot.
      const newSubjectRows = newSubjects.map((s, i) => ({
        id: randomUUID(),
        studentId: student.id,
        name: s.name,
        fullMarks: s.fullMarks,
        examWeight: s.examWeight,
        orderIndex: nextOrder + i,
      }));
      if (newSubjectRows.length > 0)
        await tx.insert(schema.subjects).values(newSubjectRows);
      // Topics already taught: 4 a day from tomorrow, on school days
      // (revision days are for the earlier topics now).
      const taught = newSubjects.flatMap((s, i) =>
        s.topics.map((t) => ({ subjectId: newSubjectRows[i].id, ...t })),
      );
      const learnFrom = spreadLearnFrom(
        taught.length,
        today,
        sm2Days(student.sundayRevision, topics.length + earlierTopics.length > 0),
      );
      await insertTopicRows(tx, [
        ...taught.map((t, k) => ({
          subjectId: t.subjectId,
          parentTopicId: null,
          name: t.name,
          difficultyRating: t.difficultyRating,
          examId: created.id,
          examName: created.name,
          learnFrom: learnFrom[k],
        })),
        ...earlierTopics.map((t) => ({
          subjectId: t.subjectId,
          parentTopicId: null,
          name: t.name,
          examId: t.examId ?? null,
          examName: t.examId ? examById.get(t.examId)!.name : t.examName,
          selfRating: t.selfRating ?? null,
        })),
      ]);

      // One marksheet for the cycle, all its marks saved together.
      const sheetMarks: Omit<NewMark, 'assessmentId'>[] = marks;
      if (sheetMarks.length > 0) {
        const [assessment] = await tx
          .insert(schema.assessments)
          .values({
            studentId: student.id,
            examId: created.id,
            assessmentDate: today,
            assessmentName: `${examName} marksheet`,
          })
          .returning();
        await saveMarks(
          tx,
          sheetMarks.map((m) => ({ ...m, assessmentId: assessment.id })),
        );
      }
      // The new exam's plan starts now; topics join it as they're taught.
      await createPlanForExam({ student, exam: created, ex: tx });
      return created;
    });

    return NextResponse.json({ exam }, { status: 201 });
  },
);
