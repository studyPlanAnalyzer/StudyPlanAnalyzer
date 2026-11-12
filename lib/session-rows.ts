import type { SessionDraft } from '@/lib/utils/plan-generator';

/**
 * The study_sessions rows for a plan's generated sessions. One place, so
 * every route that saves a plan (generate, rebuild, settings) stores the same
 * fields, including each session's position in its day's list.
 */
export function sessionRows(planId: string, drafts: SessionDraft[]) {
  return drafts.map((s) => ({
    planId,
    topicId: s.topicId,
    subjectId: s.subjectId,
    scheduledDate: s.scheduledDate,
    durationMinutes: s.durationMinutes,
    sessionType: s.sessionType,
    position: s.position,
    isFiller: s.isFiller ?? false,
  }));
}
