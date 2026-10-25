import { NextRequest } from 'next/server';
import { AUTH_COOKIE_NAME, verifyJwt, JwtPayload } from './jwt';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

/**
 * Extracts and verifies the JWT from the `auth-token` httpOnly cookie on an
 * incoming request, then loads the corresponding user record from the DB.
 * Returns null if the token is missing, invalid, or the user no longer exists.
 *
 * Use this at the top of every protected API route that needs the user record:
 *   const user = await getUserFromRequest(req);
 *   if (!user) return unauthorized();
 */
export async function getUserFromRequest(req: NextRequest) {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;

  const payload: JwtPayload | null = verifyJwt(token);
  if (!payload) return null;

  const [user] = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      email: schema.users.email,
      preferredLanguage: schema.users.preferredLanguage,
      isAdmin: schema.users.isAdmin,
      emailVerified: schema.users.emailVerified,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, payload.userId))
    .limit(1);

  return user ?? null;
}

/**
 * The signed-in user's id, read from the verified JWT alone: no database
 * round trip. Use it in routes that only need the id, for example to check
 * that a student belongs to the parent. Those routes filter by
 * `students.parentId = id`, so a token for a deleted user matches no rows and
 * the route answers 404 anyway. Routes that need the user's record (admin or
 * verified flags, name, email) keep using getUserFromRequest.
 */
export function getAuthUserId(req: NextRequest): string | null {
  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload: JwtPayload | null = verifyJwt(token);
  return payload?.userId ?? null;
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

export function forbiddenResponse() {
  return Response.json({ error: 'Admins only' }, { status: 403 });
}
