import { NextRequest, NextResponse } from 'next/server';
import { db, schema } from '@/lib/db';
import { and, eq, isNull } from 'drizzle-orm';
import { getAuthUserId, unauthorizedResponse } from '@/lib/auth/middleware';
import {
  subjectPriority,
  leafPriority,
  SubjectInput,
} from '@/lib/utils/plan-generator';
import { loadActiveEstimates } from '@/lib/estimated-confidence';
import { ESTIMATED_CONFIDENCE_PERCENT } from '@/lib/utils/scoring';
import { leafTopics } from '@/lib/topic-leaves';
import { withErrorHandling } from '@/lib/api/handler';

type StrengthLevel = 'weak' | 'medium' | 'strong';

function strengthFromPercent(percent: number): StrengthLevel {
  if (percent < 50) return 'weak';
  if (percent < 75) return 'medium';
  return 'strong';
}

export const GET = withErrorHandling(
  async (req: NextRequest, { params }: { params: { studentId: string } }) => {
    const userId = getAuthUserId(req);
    if (!userId) return unauthorizedResponse();

    // One parallel round instead of seven queries in a row. Nothing is returned
    // unless the student belongs to this parent.
    //  - Archived subjects (isActive = false) are left out of the analysis.
    //  - Marks scoped to specific topics belong to those topics only; they never
    //    feed the subject's own score, history or trend, so only whole-subject
    //    marks (no mark_topics rows) are read, with their test dates.
    const [students, subjectRows, assessmentRows, markRows, topicRows] =
      await Promise.all([
        db
          .select()
          .from(schema.students)
          .where(
            and(
              eq(schema.students.id, params.studentId),
              eq(schema.students.parentId, userId),
            ),
          )
          .limit(1),
        db
          .select()
          .from(schema.subjects)
          .where(
            and(
              eq(schema.subjects.studentId, params.studentId),
              eq(schema.subjects.isActive, true),
            ),
          ),
        db
          .select({ id: schema.assessments.id })
          .from(schema.assessments)
          .where(eq(schema.assessments.studentId, params.studentId)),
        db
          .select({
            mark: schema.marks,
            assessmentDate: schema.assessments.assessmentDate,
          })
          .from(schema.marks)
          .innerJoin(
            schema.assessments,
            eq(schema.assessments.id, schema.marks.assessmentId),
          )
          .leftJoin(
            schema.markTopics,
            eq(schema.markTopics.markId, schema.marks.id),
          )
          .where(
            and(
              eq(schema.assessments.studentId, params.studentId),
              isNull(schema.markTopics.markId),
            ),
          ),
        db
          .select({ topic: schema.topics })
          .from(schema.topics)
          .innerJoin(
            schema.subjects,
            eq(schema.subjects.id, schema.topics.subjectId),
          )
          .where(
            and(
              eq(schema.subjects.studentId, params.studentId),
              eq(schema.subjects.isActive, true),
            ),
          ),
      ]);
    const student = students[0];
    if (!student)
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const relevantMarks = markRows.map((r) => r.mark);
    const subjectIdList = subjectRows.map((s) => s.id);
    const allTopics = topicRows.map((r) => r.topic);
    // Analysed at the lowest level: sub-topics where there are any, else topics.
    const relevantTopics = leafTopics(allTopics);
    const topicNameById = new Map(allTopics.map((t) => [t.id, t.name]));

    // A parent's gut-sense estimate, only for subjects with no marks at all.
    const estimates = await loadActiveEstimates(subjectIdList);

    // Build percent history per subject, ordered oldest -> newest by assessment date.
    const assessmentDateById = new Map(
      markRows.map((r) => [r.mark.assessmentId, r.assessmentDate]),
    );
    const subjectAnalyses = subjectRows.map((subject) => {
      const subjectMarks = relevantMarks
        .filter((m) => m.subjectId === subject.id)
        .sort((a, b) => {
          const da = assessmentDateById.get(a.assessmentId) ?? '';
          const db_ = assessmentDateById.get(b.assessmentId) ?? '';
          return da < db_ ? -1 : da > db_ ? 1 : 0;
        });

      const percentHistory = subjectMarks.map((m) =>
        Math.round((m.obtainedMarks / m.fullMarks) * 100),
      );
      const realLatestPercent =
        percentHistory.length > 0
          ? percentHistory[percentHistory.length - 1]
          : null;
      const estimate = estimates.get(subject.id) ?? null;
      const isEstimated = realLatestPercent === null && estimate !== null;
      const latestPercent = isEstimated
        ? ESTIMATED_CONFIDENCE_PERCENT[estimate]
        : realLatestPercent;
      const previousPercent =
        percentHistory.length > 1
          ? percentHistory[percentHistory.length - 2]
          : null;
      const latestConfidence = subjectMarks[subjectMarks.length - 1]
        ?.confidenceLevel as 'low' | 'medium' | 'high' | null | undefined;

      let trend: 'improving' | 'declining' | 'stable' | 'unknown' = 'unknown';
      if (latestPercent !== null && previousPercent !== null) {
        const delta = latestPercent - previousPercent;
        trend = delta >= 3 ? 'improving' : delta <= -3 ? 'declining' : 'stable';
      }

      // percentHistory (above) stays cross-cycle and un-blended for display —
      // this Analysis page is meant to show the full historical picture.
      // `records` is the input to subjectPriority/topicPriority, which uses a
      // blended, size-weighted figure internally so a single small quiz
      // doesn't dominate the priority score the same way it doesn't dominate
      // the plan generator.
      const records = subjectMarks.map((m) => ({
        percent: Math.round((m.obtainedMarks / m.fullMarks) * 100),
        fullMarks: m.fullMarks,
      }));

      const subjectInput: SubjectInput = {
        id: subject.id,
        name: subject.name,
        examWeight: subject.examWeight as SubjectInput['examWeight'],
        marksHistory: { records, latestConfidence: latestConfidence ?? null },
        estimatedConfidence: estimate,
        topics: [],
      };
      const priority = subjectPriority(subjectInput);

      const topicsForSubject = relevantTopics
        .filter((t) => t.subjectId === subject.id)
        .map((t) => ({
          id: t.id,
          name: t.name,
          parentName: t.parentTopicId
            ? (topicNameById.get(t.parentTopicId) ?? null)
            : null,
          difficultyRating: t.difficultyRating,
          estimatedMastery: t.estimatedMastery,
          priority: leafPriority(subjectInput, {
            id: t.id,
            subjectId: t.subjectId,
            difficultyRating: t.difficultyRating,
            estimatedMastery: t.estimatedMastery,
          }).priority,
        }))
        .sort((a, b) => b.priority - a.priority);

      return {
        subjectId: subject.id,
        name: subject.name,
        examWeight: subject.examWeight,
        fullMarks: subject.fullMarks,
        latestPercent,
        isEstimated,
        percentHistory,
        latestConfidence: latestConfidence ?? null,
        trend,
        strength:
          latestPercent !== null
            ? strengthFromPercent(latestPercent)
            : 'unknown',
        priority,
        topics: topicsForSubject,
      };
    });

    subjectAnalyses.sort((a, b) => b.priority - a.priority);

    // Estimates are placeholders, not results, so they stay out of the average.
    const percentagesAvailable = subjectAnalyses
      .filter((s) => !s.isEstimated)
      .map((s) => s.latestPercent)
      .filter((p): p is number => p !== null);
    const overallAveragePercent =
      percentagesAvailable.length > 0
        ? Math.round(
            percentagesAvailable.reduce((sum, p) => sum + p, 0) /
              percentagesAvailable.length,
          )
        : null;

    const topPriorityTopics = subjectAnalyses
      .flatMap((s) => s.topics.map((t) => ({ ...t, subjectName: s.name })))
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 3);

    return NextResponse.json({
      student: { id: student.id, name: student.name, grade: student.grade },
      overallAveragePercent,
      assessmentsCount: assessmentRows.length,
      subjects: subjectAnalyses,
      topPriorityTopics,
    });
  },
);
