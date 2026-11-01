import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import type { GoogleIdentity } from './google-token';

/**
 * Whether a verified Google email is an admin: listed in ADMIN_EMAILS
 * (comma-separated, compared case-insensitively). Unset or empty means
 * nobody is an admin.
 */
export function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}

/**
 * The account for a verified Google identity, created on the first sign-in.
 * Found by Google's user id (sub), never by email, so a Google account whose
 * email changes keeps its account. Two first sign-ins at once make one
 * account: the insert is ignored if the googleId already exists, and the
 * update that follows reads the one row back. Email, name and admin status
 * are refreshed from Google and ADMIN_EMAILS on every sign-in, so removing
 * someone from ADMIN_EMAILS takes effect at their next sign-in.
 */
export async function upsertGoogleUser(identity: GoogleIdentity, now = new Date()) {
  const isAdmin = isAdminEmail(identity.email);
  const name = identity.name ?? identity.email.split('@')[0];
  await db
    .insert(schema.users)
    .values({ googleId: identity.sub, email: identity.email, name, isAdmin })
    .onConflictDoNothing({ target: schema.users.googleId });
  const [user] = await db
    .update(schema.users)
    .set({ email: identity.email, name, isAdmin, lastLoginAt: now, updatedAt: now })
    .where(eq(schema.users.googleId, identity.sub))
    .returning({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      isAdmin: schema.users.isAdmin,
      preferredLanguage: schema.users.preferredLanguage,
    });
  return user;
}
