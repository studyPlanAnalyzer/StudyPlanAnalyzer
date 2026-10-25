import { NextResponse } from "next/server";
import { AUTH_COOKIE_NAME } from "@/lib/auth/jwt";
import { withErrorHandling } from "@/lib/api/handler";

export const POST = withErrorHandling(async () => {
  const res = NextResponse.json({ message: "Logged out" });
  res.cookies.set(AUTH_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
});
