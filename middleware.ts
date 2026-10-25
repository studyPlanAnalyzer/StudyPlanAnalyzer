import { NextRequest, NextResponse } from "next/server";

const AUTH_COOKIE_NAME = "auth-token";

// Middleware runs on the Edge runtime, where verifying the JWT signature
// isn't available with the jsonwebtoken package. It only checks that a
// token cookie is present and redirects unauthenticated visitors away from
// protected pages; every API route independently verifies the JWT itself
// via getUserFromRequest, so this is a UX convenience, not the security
// boundary.
const PROTECTED_PREFIXES = ["/dashboard", "/onboarding", "/students", "/admin"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const token = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (!token) {
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding/:path*", "/students/:path*", "/admin/:path*"],
};
