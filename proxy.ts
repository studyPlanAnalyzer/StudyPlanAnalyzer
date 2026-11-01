import { NextRequest, NextResponse } from "next/server";
import { accessCookie, signedInCookie } from "@/lib/auth/cookies";

// The proxy (formerly middleware) runs before every matched request.
//
// API requests: CORS and CSRF. Only this app's own origin, plus any listed in
// ALLOWED_ORIGINS (comma-separated, e.g. "https://studyplan.example"), may
// call the API from a browser, with credentials. A state-changing request
// from any other origin is refused outright, on top of the SameSite=Strict
// cookies.
//
// Pages: signed-out visitors are sent to /login. This is a UX convenience,
// not the security boundary: every API route verifies the access token and
// its live session itself (lib/auth/middleware.ts).
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/students", "/admin"];
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function allowedOrigins(req: NextRequest): Set<string> {
  const listed = (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return new Set([req.nextUrl.origin, ...listed]);
}

function withCors(res: NextResponse, origin: string) {
  res.headers.set("Access-Control-Allow-Origin", origin);
  res.headers.set("Access-Control-Allow-Credentials", "true");
  res.headers.append("Vary", "Origin");
  return res;
}

function forbidden() {
  return NextResponse.json(
    { error: "Cross-origin request refused", code: "ORIGIN_NOT_ALLOWED" },
    { status: 403 },
  );
}

function api(req: NextRequest) {
  const origin = req.headers.get("origin");
  const allowed = origin !== null && allowedOrigins(req).has(origin);

  if (req.method === "OPTIONS") {
    if (!allowed) return forbidden();
    const res = new NextResponse(null, { status: 204 });
    res.headers.set(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE",
    );
    res.headers.set("Access-Control-Allow-Headers", "Content-Type");
    res.headers.set("Access-Control-Max-Age", "600");
    return withCors(res, origin);
  }

  if (!SAFE_METHODS.has(req.method)) {
    // Browsers send Origin with every state-changing fetch or form post. With
    // no Origin, Sec-Fetch-Site still says whether it came from another site;
    // a request with neither isn't from a browser, so carries no ambient
    // cookies a third party could abuse.
    const site = req.headers.get("sec-fetch-site");
    if (origin !== null ? !allowed : site === "cross-site" || site === "same-site")
      return forbidden();
  }

  const res = NextResponse.next();
  return allowed && origin !== req.nextUrl.origin ? withCors(res, origin) : res;
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/api/")) return api(req);

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  // The access cookie lasts 15 minutes; the signed-in marker lasts as long as
  // the refresh token, so a page loads and the API client refreshes quietly.
  const signedIn =
    req.cookies.has(accessCookie().name) ||
    req.cookies.has(signedInCookie().name);
  if (!signedIn) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/:path*",
    "/dashboard/:path*",
    "/onboarding/:path*",
    "/students/:path*",
    "/admin/:path*",
  ],
};
