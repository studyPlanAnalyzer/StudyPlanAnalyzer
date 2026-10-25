import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { and, eq, inArray } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import { saveMark } from '@/lib/save-mark';
import { withErrorHandling } from '@/lib/api/handler';

const createMarkSchema = z.object({
  assessmentId: z.string().uuid(),
  subjectId: z.string().uuid(),
  obtainedMarks: z.number().int().min(0),
  fullMarks: z.number().int().positive(),
  confidenceLevel: z.enum(['low', 'medium', 'high']).optional(),
  topicIds: z.array(z.string().uuid()).optional().default([]),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  const userId = getAuthUserId(req);
  if (!userId) return unauthorizedResponse();

  const body = await req.json();
  const parsed = createMarkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;

  if (data.obtainedMarks > data.fullMarks) {
    return NextResponse.json(
      { error: 'obtainedMarks cannot exceed fullMarks' },
      { status: 400 },
    );
  }

  // Ownership of the assessment (one query: assessment joined to its student)
  // and the topic check run together, in one round instead of three in a row.
  const [owned, topicRows] = await Promise.all([
    db
      .select({ id: schema.assessments.id })
      .from(schema.assessments)
      .innerJoin(
        schema.students,
        eq(schema.students.id, schema.assessments.studentId),
      )
      .where(
        and(
          eq(schema.assessments.id, data.assessmentId),
          eq(schema.students.parentId, userId),
        ),
      )
      .limit(1),
    data.topicIds.length > 0
      ? db
          .select()
          .from(schema.topics)
          .where(inArray(schema.topics.id, data.topicIds))
      : Promise.resolve([]),
  ]);
  if (owned.length === 0)
    return NextResponse.json(
      { error: 'Assessment not found' },
      { status: 404 },
    );

  if (data.topicIds.length > 0) {
    if (topicRows.length !== new Set(data.topicIds).size) {
      return NextResponse.json(
        { error: 'One or more topics not found' },
        { status: 404 },
      );
    }
    if (topicRows.some((t) => t.subjectId !== data.subjectId)) {
      return NextResponse.json(
        { error: 'Selected topics must belong to the chosen subject' },
        { status: 400 },
      );
    }
  }

  const { mark, scopedToTopics } = await db.transaction((tx) =>
    saveMark(tx, data),
  );

  return NextResponse.json({ mark, scopedToTopics }, { status: 201 });
});
