import { and, eq, inArray, isNull } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { SubjectInput, TopicSpacedStatus } from '@/lib/utils/plan-generator';
import { loadActiveEstimates } from '@/lib/estimated-confidence';
import { leafTopics } from '@/lib/topic-leaves';
import { loadLeafConfidence } from '@/lib/leaf-confidence';
import type { Executor } from '@/lib/utils/topic-mastery';
import { loadTopicRatingSummary } from '@/lib/topic-struggling';
import { isEarlierTopic } from '@/lib/utils/revision';

/**
 * Builds the generator's input for a student's active subjects. Topics are
 * scored and scheduled at the lowest level: sub-topics where a topic has
 * them, otherwise the topic itself. A leaf with its own test marks carries
 * that mastery; one without falls back to difficulty plus the subject score.
 *
 * A subject's score comes from this exam cycle's whole-subject marks (plus
 * any marks not tied to an exam). Until this cycle's results are in, the
 * marks of the latest earlier exam stand in, so a plan started before the
 * results come out keeps what it knew instead of falling back to 50%.
 *
 * `scope: 'plan'` keeps only the topics this exam's SM-2 plan schedules: the
 * ones taught for it, and earlier-exam topics rated Again on a revision day
 * for it (lib/revision.ts). `'all'` (reports, revision ranking) keeps every one.
 */
export async function loadSubjectInputs(
  studentId: string,
  examId: string,
  ex: Executor = db,
  opts: { scope?: 'plan' | 'all' } = {},
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
  //  - every whole-subject mark (marks scoped to topics feed topic mastery,
  //    not the subject score), with its test date and exam, in one join
  //  - every topic with its SM-2 state, in one join
  //  - the subjects' estimates, and this exam's date
  const [markRows, topicRows, estimates, leafConfidence, examRows, againRows] = await Promise.all([
    ex
      .select({
        mark: schema.marks,
        assessmentDate: schema.assessments.assessmentDate,
        examId: schema.assessments.examId,
        examDate: schema.exams.examDate,
      })
      .from(schema.marks)
      .innerJoin(
        schema.assessments,
        eq(schema.assessments.id, schema.marks.assessmentId),
      )
      .leftJoin(schema.exams, eq(schema.exams.id, schema.assessments.examId))
      .leftJoin(
        schema.markTopics,
        eq(schema.markTopics.markId, schema.marks.id),
      )
      .where(
        and(
          eq(schema.assessments.studentId, studentId),
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
    loadLeafConfidence(studentId, ex),
    ex
      .select({ examDate: schema.exams.examDate })
      .from(schema.exams)
      .where(eq(schema.exams.id, examId))
      .limit(1),
    opts.scope === 'plan'
      ? ex
          .select({ topicId: schema.topicRevisions.topicId })
          .from(schema.topicRevisions)
          .where(and(eq(schema.topicRevisions.examId, examId), eq(schema.topicRevisions.rating, 1)))
      : Promise.resolve([] as { topicId: string }[]),
  ]);

  const examDate = examRows[0]?.examDate ?? null;
  /** A subject's marks for this plan: this cycle's, or the latest earlier exam's until those are in. */
  const marksOf = (subjectId: string) => {
    const rows = markRows.filter((r) => r.mark.subjectId === subjectId);
    const own = rows.filter((r) => r.examId === examId || r.examId === null);
    if (rows.some((r) => r.examId === examId)) return own;
    const earlier = rows.filter(
      (r) => r.examId !== null && r.examDate !== null && (examDate === null || r.examDate < examDate),
    );
    const latest = earlier.reduce((max, r) => (r.examDate! > max ? r.examDate! : max), '');
    return [...own, ...earlier.filter((r) => r.examDate === latest)];
  };
  const assessmentDateById = new Map(
    markRows.map((r) => [r.mark.assessmentId, r.assessmentDate]),
  );
  const spacedByTopic = new Map(
    topicRows.flatMap((r) => (r.state ? [[r.topic.id, r.state] as const] : [])),
  );
  const backOnPlan = new Set(againRows.map((r) => r.topicId));
  const topics = leafTopics(topicRows.map((r) => r.topic)).filter(
    (t) => opts.scope !== 'plan' || !isEarlierTopic(t, examId) || backOnPlan.has(t.id),
  );
  const ratings = await loadTopicRatingSummary(
    topics.map((t) => t.id),
    ex,
  );

  return subjectRows.map((subject) => {
    const subjectMarks = marksOf(subject.id)
      .map((r) => r.mark)
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
            latestConfidence: leafConfidence.get(t.id) ?? null,
            struggling: ratings.struggling.has(t.id),
            firstFollowUp: ratings.ratedOnce.has(t.id),
            learnFrom: t.learnFrom,
            spacedState: state
              ? {
                  status: state.status as TopicSpacedStatus,
                  nextReviewDate: state.nextReviewDate,
                  repetitionCount: state.repetitionCount,
                  lastSeenDate: state.lastSeenDate,
                }
              : null,
          };
        }),
    };
  });
}
