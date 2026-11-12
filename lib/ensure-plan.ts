import { api, ApiError } from '@/lib/api-client';

/**
 * The current exam's plan id, creating the plan if it doesn't exist yet. A
 * plan exists from the moment an exam does (onboarding, a new exam cycle and a
 * new session all create it); this covers children set up before that, so no
 * screen ever asks the parent to "generate" one. null when there is no exam
 * to plan for (none yet, or it is over).
 */
export async function ensurePlanId(
  studentId: string,
  detail: { latestPlan: { id: string } | null; currentExamId: string | null; currentExamOver: boolean },
): Promise<string | null> {
  if (detail.latestPlan) return detail.latestPlan.id;
  if (!detail.currentExamId || detail.currentExamOver) return null;
  try {
    const res = await api.post<{ plan: { id: string } }>('/api/plans/generate', {
      studentId,
      examId: detail.currentExamId,
    });
    return res.plan.id;
  } catch (err) {
    // Another tab created it a moment ago.
    if (err instanceof ApiError && err.status === 409) {
      const again = await api.get<{ latestPlan: { id: string } | null }>(`/api/students/${studentId}`);
      return again.latestPlan?.id ?? null;
    }
    throw err;
  }
}
