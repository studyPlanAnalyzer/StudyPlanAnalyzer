import { NextRequest } from 'next/server';
import { verifyAccessToken, AccessTokenPayload } from './jwt';
import { accessCookie } from './cookies';
import { isAdminEmail } from './google-user';
import { db, schema } from '@/lib/db';
import { and, eq, gt } from 'drizzle-orm';

/** The verified access token from the request's access cookie, if any. */
export function sessionFromRequest(req: NextRequest): AccessTokenPayload | null {
  const token = req.cookies.get(accessCookie().name)?.value;
  if (!token) return null;
  return verifyAccessToken(token);
}

// A token is only honoured while its session row exists and hasn't expired:
// logging out or a refresh token replay deletes the row and
// ends it at once.
function liveSession(payload: AccessTokenPayload) {
  return and(
    eq(schema.userSessions.id, payload.sid),
    eq(schema.userSessions.userId, payload.userId),
    gt(schema.userSessions.expiresAt, new Date()),
  );
}

/**
 * Extracts and verifies the access token from its httpOnly cookie on an
 * incoming request, checks its session is still live, then loads the user
 * record. Returns null if the token is missing or invalid, the session has
 * ended, or the user no longer exists.
 *
 * isAdmin is true only while the account is marked admin AND its email is
 * still in ADMIN_EMAILS, so removing someone from the list takes effect on
 * their very next request, not at their next sign-in.
 *
 * Use this at the top of every protected API route that needs the user record:
 *   const user = await getUserFromRequest(req);
 *   if (!user) return unauthorized();
 */
export async function getUserFromRequest(req: NextRequest) {
  const payload = sessionFromRequest(req);
  if (!payload) return null;

  const [row] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      preferredLanguage: schema.users.preferredLanguage,
      isAdmin: schema.users.isAdmin,
      createdAt: schema.users.createdAt,
    })
    .from(schema.userSessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId))
    .where(liveSession(payload))
    .limit(1);

  if (!row) return null;
  return { ...row, isAdmin: row.isAdmin && isAdminEmail(row.email) };
}

/**
 * The signed-in user's id, for routes that only need the id (for example to
 * check that a student belongs to the parent). One small primary-key lookup
 * confirms the session is still live; routes that need the user's record
 * (admin flag, name, email) use getUserFromRequest.
 */
export async function getAuthUserId(req: NextRequest): Promise<string | null> {
  const payload = sessionFromRequest(req);
  if (!payload) return null;
  const [row] = await db
    .select({ userId: schema.userSessions.userId })
    .from(schema.userSessions)
    .where(liveSession(payload))
    .limit(1);
  return row?.userId ?? null;
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbiddenResponse() {
  return Response.json({ error: 'Admins only' }, { status: 403 });
}
