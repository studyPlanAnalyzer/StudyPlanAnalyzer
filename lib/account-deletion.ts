import { eq, sql } from 'drizzle-orm';
import { schema } from '@/lib/db';
import type { Executor } from '@/lib/utils/topic-mastery';

/**
 * Deletes a parent's account and everything in it, inside the caller's
 * transaction. Deleting the user row cascades to their sign-ins, children
 * and every child's data (exams, subjects, topics, tests, plans, sessions,
 * quiz attempts, to-dos, reports).
 *
 * Payment records are kept for the accounts, with everything that names the
 * family removed: the parent, child and school names, the admin's note, and
 * the child's name inside the remark code. Their user and child links become
 * null when those rows go.
 */
export async function deleteAccount(ex: Executor, userId: string) {
  await ex
    .update(schema.payments)
    .set({
      parentName: null,
      childName: null,
      schoolName: null,
      adminNote: null,
      remarkCode: sql`'SP-DELETED-' || ${schema.payments.id}::text`,
    })
    .where(eq(schema.payments.userId, userId));
  await ex.delete(schema.users).where(eq(schema.users.id, userId));
}
