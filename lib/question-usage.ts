import { sql } from 'drizzle-orm';
import type { Executor } from '@/lib/utils/topic-mastery';

/**
 * Sets each question's timesUsed and lastUsedAt from the published quizzes it
 * is actually in: how many, and the latest quiz date (the day students see
 * it, which is what the reuse cooldown is measured from). Recounting instead
 * of adding one means unpublishing and republishing can't count a question
 * twice, and a question taken out of a quiz stops counting.
 */
export async function recountQuestionUsage(ex: Executor, questionIds: string[]) {
  const ids = Array.from(new Set(questionIds));
  if (ids.length === 0) return;
  await ex.execute(sql`
    update questions q set
      times_used = u.n,
      last_used_at = u.last,
      updated_at = now()
    from (
      select q2.id, count(d.id)::int as n, max(d.date) as last
        from questions q2
        left join daily_quiz_questions l on l.question_id = q2.id
        left join daily_quizzes d on d.id = l.daily_quiz_id and d.is_published
       where q2.id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})
       group by q2.id
    ) u
    where q.id = u.id`);
}
