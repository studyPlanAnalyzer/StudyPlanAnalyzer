import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { SubjectInput, TopicSpacedStatus } from '@/lib/utils/plan-generator';
import { loadActiveEstimates } from '@/lib/estimated-confidence';
import { leafTopics } from '@/lib/topic-leaves';
import type { Executor } from '@/lib/utils/topic-mastery';

/**
 * Builds the generator's input for a student's active subjects. Topics are
 * scored and scheduled at the lowest level: sub-topics where a topic has
 * them, otherwise the topic itself. A leaf with its own test marks carries
 * that mastery; one without falls back to difficulty plus the subject score.
 */
export async function loadSubjectInputs(
  studentId: string,
  examId: string,
  ex: Executor = db,
): Promise<SubjectInput[]> {
  const subjectRows = await ex
    .select()
    .from(schema.subjects)
    .where(
      and(
        eq(schema.subjects.studentId, studentId),
        eq(schema.subjects.isActive, true),
      ),
    );
  if (subjectRows.length === 0) return [];
  const subjectIds = subjectRows.map((s) => s.id);

  // Everything else depends only on the subjects, so it is read together:
  //  - this exam's whole-subject marks (marks scoped to topics feed topic
  //    mastery, not the subject score), with their test dates, in one join
  //  - every topic with its SM-2 state, in one join
  //  - the subjects' estimates
  const [markRows, topicRows, estimates] = await Promise.all([
    ex
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
          eq(schema.assessments.studentId, studentId),
          or(
            eq(schema.assessments.examId, examId),
            isNull(schema.assessments.examId),
          ),
          inArray(schema.marks.subjectId, subjectIds),
          isNull(schema.markTopics.markId),
        ),
      ),
    ex
      .select({
        topic: schema.topics,
        state: schema.topicSpacedState,
      })
      .from(schema.topics)
      .leftJoin(
        schema.topicSpacedState,
        eq(schema.topicSpacedState.topicId, schema.topics.id),
      )
      .where(inArray(schema.topics.subjectId, subjectIds)),
    loadActiveEstimates(subjectIds, ex),
  ]);

  const marks = markRows.map((r) => r.mark);
  const assessmentDateById = new Map(
    markRows.map((r) => [r.mark.assessmentId, r.assessmentDate]),
  );
  const spacedByTopic = new Map(
    topicRows.flatMap((r) => (r.state ? [[r.topic.id, r.state] as const] : [])),
  );
  const topics = leafTopics(topicRows.map((r) => r.topic));

  return subjectRows.map((subject) => {
    const subjectMarks = marks
      .filter((m) => m.subjectId === subject.id)
      .sort((a, b) => {
        const da = assessmentDateById.get(a.assessmentId) ?? '';
        const db_ = assessmentDateById.get(b.assessmentId) ?? '';
        return da < db_ ? -1 : da > db_ ? 1 : 0;
      });
    const latestConfidence = subjectMarks[subjectMarks.length - 1]
      ?.confidenceLevel as 'low' | 'medium' | 'high' | null | undefined;

    return {
      id: subject.id,
      name: subject.name,
      examWeight: subject.examWeight as SubjectInput['examWeight'],
      marksHistory: {
        records: subjectMarks.map((m) => ({
          percent: Math.round((m.obtainedMarks / m.fullMarks) * 100),
          fullMarks: m.fullMarks,
        })),
        latestConfidence: latestConfidence ?? null,
      },
      estimatedConfidence: estimates.get(subject.id) ?? null,
      topics: topics
        .filter((t) => t.subjectId === subject.id)
        .map((t) => {
          const state = spacedByTopic.get(t.id);
          return {
            id: t.id,
            subjectId: t.subjectId,
            difficultyRating: t.difficultyRating,
            estimatedMastery: t.estimatedMastery,
            spacedState: state
              ? {
                  status: state.status as TopicSpacedStatus,
                  nextReviewDate: state.nextReviewDate,
                  repetitionCount: state.repetitionCount,
                }
              : null,
          };
        }),
    };
  });
}
