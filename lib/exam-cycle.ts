import { z } from 'zod';
import { fullMarksSchema } from '@/lib/validation';

const level = z.enum(['low', 'medium', 'high']);

/** One mark on an exam's marksheet: a subject, or the topics it covers. */
export const marksheetEntrySchema = z.object({
  subjectId: z.string().uuid(),
  obtainedMarks: z.number().int().min(0),
  fullMarks: fullMarksSchema,
  confidenceLevel: level.optional(),
  topicIds: z.array(z.string().uuid()).default([]),
});
export type MarksheetEntry = z.infer<typeof marksheetEntrySchema>;

/**
 * What's wrong with a marksheet for this child, or null. Marks must be for
 * the child's own subjects and topics, at the lowest level: at most one
 * whole-subject mark per subject, and only for a subject with no topics,
 * no topic marked twice, never more than full marks.
 */
export function marksheetProblem(
  marks: MarksheetEntry[],
  subjectIds: Set<string>,
  subjectOfTopic: Map<string, string>,
): { status: number; error: string } | null {
  const seenSubject = new Set<string>();
  const seenTopic = new Set<string>();
  for (const m of marks) {
    if (!subjectIds.has(m.subjectId)) return { status: 404, error: 'Subject not found' };
    if (m.topicIds.length === 0) {
      if (seenSubject.has(m.subjectId))
        return { status: 400, error: 'Each subject can only have one whole-subject mark' };
      seenSubject.add(m.subjectId);
    }
    if (m.topicIds.some((id) => seenTopic.has(id)))
      return { status: 400, error: 'Each topic can only have one mark in a marksheet' };
    m.topicIds.forEach((id) => seenTopic.add(id));
    if (m.obtainedMarks > m.fullMarks)
      return { status: 400, error: 'obtainedMarks cannot exceed fullMarks' };
    if (m.topicIds.some((id) => subjectOfTopic.get(id) !== m.subjectId))
      return { status: 400, error: 'Selected topics must belong to the chosen subject' };
  }
  return null;
}
