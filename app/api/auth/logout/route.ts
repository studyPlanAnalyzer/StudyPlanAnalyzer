import { NextRequest, NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/auth/middleware";
import { endSession, sessionIdForRefreshToken } from "@/lib/auth/session";
import { clearAuthCookies, refreshCookie } from "@/lib/auth/cookies";
import { withErrorHandling } from "@/lib/api/handler";

export const POST = withErrorHandling(async (req: NextRequest) => {
  // Revokes the session server-side (its refresh tokens go with it), found
  // from the refresh cookie, or from the access token if that's all there is,
  // so a copy of either cookie stops working.
  const refresh = req.cookies.get(refreshCookie().name)?.value;
  const sessionId =
    (refresh ? await sessionIdForRefreshToken(refresh) : null) ??
    sessionFromRequest(req)?.sid;
  if (sessionId) await endSession(sessionId);

  const res = NextResponse.json({ message: "Logged out" });
  clearAuthCookies(res);
  return res;
});
