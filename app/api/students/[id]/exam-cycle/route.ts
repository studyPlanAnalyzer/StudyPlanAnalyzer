import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { withErrorHandling } from '@/lib/api/handler';
import { insertTopicRows } from '@/lib/topic-leaves';
import { saveMarks, type NewMark } from '@/lib/save-mark';
import { toDateString, todayUTC } from '@/lib/utils/date-utils';

const level = z.enum(['low', 'medium', 'high']);
const name = z.string().trim().min(1).max(200);

const bodySchema = z.object({
  name,
  examDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  // Latest marks for subjects the child already has (blank ones are left out).
  marks: z
    .array(
      z.object({
        subjectId: z.string().uuid(),
        obtainedMarks: z.number().int().min(0),
        fullMarks: z.number().int().positive(),
        confidenceLevel: level.optional(),
        topicIds: z.array(z.string().uuid()).default([]),
      }),
    )
    .default([]),
  // Subjects tested for the first time this cycle, with their marks and topics.
  newSubjects: z
    .array(
      z.object({
        name,
        fullMarks: z.number().int().positive().default(100),
        examWeight: level,
        obtainedMarks: z.number().int().min(0),
        confidenceLevel: level.optional(),
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
});

/**
 * Starts a new exam cycle in ONE request and ONE transaction: retires the old
 * exam, creates the new one, records the marksheet (marks, topic mastery, SM-2
 * trend), and adds any brand-new subjects with their topics. If anything
 * fails, nothing is saved.
 *
 * All reading happens up front in a single parallel round; the transaction
 * then uses a fixed number of statements (about 15) however many subjects,
 * topics and marks there are.
 */
export const POST = withErrorHandling(
  async (req: NextRequest, { params }: { params: { id: string } }) => {
    const userId = getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { name: examName, examDate, marks, newSubjects } = parsed.data;

    // One parallel round of reads. Nothing is returned from them until the
    // ownership check below passes.
    const [students, exams, subjects, topics] = await Promise.all([
      db
        .select({ id: schema.students.id })
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

    const today = toDateString(todayUTC());
    if (examDate <= today)
      return NextResponse.json(
        { error: 'Exam date must be in the future' },
        { status: 400 },
      );

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
    const subjectIds = new Set(subjects.map((s) => s.id));
    const subjectOfTopic = new Map(topics.map((t) => [t.id, t.subjectId]));
    // The marksheet is at the lowest level: one mark per topic or sub-topic.
    // A whole-subject mark (no topics) is only for a subject with none, so at
    // most one per subject, and no topic can be marked twice.
    const seenSubject = new Set<string>();
    const seenTopic = new Set<string>();
    for (const m of marks) {
      if (!subjectIds.has(m.subjectId))
        return NextResponse.json(
          { error: 'Subject not found' },
          { status: 404 },
        );
      if (m.topicIds.length === 0) {
        if (seenSubject.has(m.subjectId))
          return NextResponse.json(
            { error: 'Each subject can only have one whole-subject mark' },
            { status: 400 },
          );
        seenSubject.add(m.subjectId);
      }
      if (m.topicIds.some((id) => seenTopic.has(id)))
        return NextResponse.json(
          { error: 'Each topic can only have one mark in a marksheet' },
          { status: 400 },
        );
      m.topicIds.forEach((id) => seenTopic.add(id));
      if (m.obtainedMarks > m.fullMarks)
        return NextResponse.json(
          { error: 'obtainedMarks cannot exceed fullMarks' },
          { status: 400 },
        );
      if (m.topicIds.some((id) => subjectOfTopic.get(id) !== m.subjectId))
        return NextResponse.json(
          { error: 'Selected topics must belong to the chosen subject' },
          { status: 400 },
        );
    }
    const names = new Set(subjects.map((s) => s.name.trim().toLowerCase()));
    for (const s of newSubjects) {
      const key = s.name.toLowerCase();
      if (names.has(key))
        return NextResponse.json(
          {
            error: `${s.name} is already a subject. Each subject can only be listed once.`,
          },
          { status: 400 },
        );
      names.add(key);
      if (s.obtainedMarks > s.fullMarks)
        return NextResponse.json(
          { error: `Marks for ${s.name} cannot exceed ${s.fullMarks}` },
          { status: 400 },
        );
    }

    const nextOrder =
      subjects.reduce((max, s) => Math.max(max, s.orderIndex), -1) + 1;

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
        })
        .returning();

      // New subjects and all their topics: two statements each for the whole lot.
      const newSubjectRows = newSubjects.map((s, i) => ({
        id: randomUUID(),
        studentId: student.id,
        name: s.name,
        fullMarks: s.fullMarks,
        examWeight: s.examWeight,
        orderIndex: nextOrder + i,
      }));
      if (newSubjectRows.length > 0) {
        await tx.insert(schema.subjects).values(newSubjectRows);
        await insertTopicRows(
          tx,
          newSubjects.flatMap((s, i) =>
            s.topics.map((t) => ({
              subjectId: newSubjectRows[i].id,
              parentTopicId: null,
              name: t.name,
              difficultyRating: t.difficultyRating,
            })),
          ),
        );
      }

      // One marksheet for the cycle, all its marks saved together.
      const sheetMarks: Omit<NewMark, 'assessmentId'>[] = [
        ...marks,
        ...newSubjects.map((s, i) => ({
          subjectId: newSubjectRows[i].id,
          obtainedMarks: s.obtainedMarks,
          fullMarks: s.fullMarks,
          confidenceLevel: s.confidenceLevel,
          topicIds: [],
        })),
      ];
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
      return created;
    });

    return NextResponse.json({ exam }, { status: 201 });
  },
);
