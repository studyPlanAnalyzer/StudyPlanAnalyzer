import { createHash, randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import { and, eq, isNull, lt } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { ACCESS_TOKEN_TTL_SECONDS, signAccessToken } from './jwt';
import {
  REFRESH_TOKEN_TTL_SECONDS,
  accessCookie,
  clearAuthCookies,
  refreshCookie,
  setCookie,
  signedInCookie,
} from './cookies';

// ---------------------------------------------------------------------------
// Sessions and refresh tokens
//
// Signing in creates a session (user_sessions row) and its first refresh
// token. The refresh token is 256 random bits, opaque, and stored only as a
// SHA-256 hash. Each refresh uses up the presented token and issues the next
// one. Presenting a token that was already used means someone kept a copy, so
// the whole session is deleted: the thief and the real user are both signed
// out, and the real user signs in again.
// ---------------------------------------------------------------------------

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

function newRefreshToken() {
  const raw = randomBytes(32).toString('base64url');
  return {
    raw,
    hash: hashToken(raw),
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
  };
}

type SessionUser = { id: string; isAdmin: boolean };

function setSessionCookies(
  res: NextResponse,
  user: SessionUser,
  sessionId: string,
  refreshRaw: string,
) {
  const access = signAccessToken({
    userId: user.id,
    role: user.isAdmin ? 'admin' : 'parent',
    sid: sessionId,
  });
  setCookie(res, accessCookie(), access, ACCESS_TOKEN_TTL_SECONDS);
  setCookie(res, refreshCookie(), refreshRaw, REFRESH_TOKEN_TTL_SECONDS);
  setCookie(res, signedInCookie(), '1', REFRESH_TOKEN_TTL_SECONDS);
}

/**
 * Signs the user in on this device: a new session, its first refresh token,
 * and the access, refresh and signed-in cookies. The user's expired sessions
 * are cleared out at the same time so the table doesn't grow without bound.
 */
export async function startSession(
  res: NextResponse,
  user: SessionUser,
  /** The browser's User-Agent, shown on the Account page's device list. */
  userAgent: string | null = null,
) {
  const refresh = newRefreshToken();
  const sessionId = await db.transaction(async (tx) => {
    await tx
      .delete(schema.userSessions)
      .where(
        and(
          eq(schema.userSessions.userId, user.id),
          lt(schema.userSessions.expiresAt, new Date()),
        ),
      );
    const [session] = await tx
      .insert(schema.userSessions)
      .values({
        userId: user.id,
        expiresAt: refresh.expiresAt,
        userAgent: userAgent ? userAgent.slice(0, 300) : null,
      })
      .returning({ id: schema.userSessions.id });
    await tx.insert(schema.refreshTokens).values({
      sessionId: session.id,
      tokenHash: refresh.hash,
      expiresAt: refresh.expiresAt,
    });
    return session.id;
  });
  clearAuthCookies(res); // drops a legacy cookie, if any
  setSessionCookies(res, user, sessionId, refresh.raw);
}

export type RefreshResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: 'invalid' | 'reused' };

/**
 * Trades a refresh token for a new access token and a new refresh token. On
 * success the cookies are set on `res`; on failure the caller clears them.
 */
export async function rotateRefreshToken(
  res: NextResponse,
  raw: string,
): Promise<RefreshResult> {
  const now = new Date();
  const [row] = await db
    .select({
      tokenId: schema.refreshTokens.id,
      usedAt: schema.refreshTokens.usedAt,
      expiresAt: schema.refreshTokens.expiresAt,
      sessionId: schema.userSessions.id,
      userId: schema.users.id,
      isAdmin: schema.users.isAdmin,
    })
    .from(schema.refreshTokens)
    .innerJoin(
      schema.userSessions,
      eq(schema.userSessions.id, schema.refreshTokens.sessionId),
    )
    .innerJoin(schema.users, eq(schema.users.id, schema.userSessions.userId))
    .where(eq(schema.refreshTokens.tokenHash, hashToken(raw)))
    .limit(1);
  if (!row) return { ok: false, reason: 'invalid' };

  if (row.usedAt) {
    await endSession(row.sessionId);
    return { ok: false, reason: 'reused' };
  }
  if (row.expiresAt <= now) return { ok: false, reason: 'invalid' };

  const next = newRefreshToken();
  const rotated = await db.transaction(async (tx) => {
    // Claims the token: only one request can mark it used. If another got
    // there first, this one is a replay of a used token.
    const claimed = await tx
      .update(schema.refreshTokens)
      .set({ usedAt: now })
      .where(
        and(
          eq(schema.refreshTokens.id, row.tokenId),
          isNull(schema.refreshTokens.usedAt),
        ),
      )
      .returning({ id: schema.refreshTokens.id });
    if (claimed.length === 0) return false;
    await tx.insert(schema.refreshTokens).values({
      sessionId: row.sessionId,
      tokenHash: next.hash,
      expiresAt: next.expiresAt,
    });
    await tx
      .update(schema.userSessions)
      .set({ expiresAt: next.expiresAt })
      .where(eq(schema.userSessions.id, row.sessionId));
    return true;
  });
  if (!rotated) {
    await endSession(row.sessionId);
    return { ok: false, reason: 'reused' };
  }

  setSessionCookies(
    res,
    { id: row.userId, isAdmin: row.isAdmin },
    row.sessionId,
    next.raw,
  );
  return { ok: true, sessionId: row.sessionId };
}

/** The session a refresh token belongs to, used or not, for logout. */
export async function sessionIdForRefreshToken(
  raw: string,
): Promise<string | null> {
  const [row] = await db
    .select({ sessionId: schema.refreshTokens.sessionId })
    .from(schema.refreshTokens)
    .where(eq(schema.refreshTokens.tokenHash, hashToken(raw)))
    .limit(1);
  return row?.sessionId ?? null;
}

/** Ends one session and all its refresh tokens (they cascade). */
export async function endSession(sessionId: string) {
  await db
    .delete(schema.userSessions)
    .where(eq(schema.userSessions.id, sessionId));
}
