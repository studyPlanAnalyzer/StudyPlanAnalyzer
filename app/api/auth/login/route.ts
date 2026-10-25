import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import {
  signJwt,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/auth/jwt';
import { withErrorHandling } from "@/lib/api/handler";

const loginSchema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { email, password } = parsed.data;

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 },
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 },
      );
    }

    if (!user.emailVerified) {
      // Distinct error code (not just a message) so the frontend can
      // reliably branch on this and send the person to /verify-email
      // rather than just showing a generic failure.
      return NextResponse.json(
        {
          error: 'Please verify your email before logging in',
          code: 'EMAIL_NOT_VERIFIED',
        },
        { status: 403 },
      );
    }

    const token = signJwt({ userId: user.id, email: user.email });

    await db
      .update(schema.users)
      .set({ lastLoginAt: new Date() })
      .where(eq(schema.users.id, user.id));

    const { passwordHash: _omit, ...safeUser } = user;
    const res = NextResponse.json({ user: safeUser });
    res.cookies.set(AUTH_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
    });
    return res;
  } catch (err) {
    console.error('Login error:', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
});
