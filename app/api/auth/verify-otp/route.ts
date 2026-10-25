import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { verifyOtp } from '@/lib/auth/otp';
import {
  signJwt,
  signResetToken,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_MAX_AGE_SECONDS,
} from '@/lib/auth/jwt';
import { withErrorHandling } from '@/lib/api/handler';

const verifyOtpSchema = z.object({
  email: z.string().email(),
  code: z.string().length(6),
  purpose: z.enum(['EMAIL_VERIFICATION', 'PASSWORD_RESET']),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parsed = verifyOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { email, code, purpose } = parsed.data;

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid or expired code' },
        { status: 400 },
      );
    }

    const result = await verifyOtp({ email, purpose, code });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (purpose === 'EMAIL_VERIFICATION') {
      const [updated] = await db
        .update(schema.users)
        .set({ emailVerified: true, lastLoginAt: new Date() })
        .where(eq(schema.users.id, user.id))
        .returning({
          id: schema.users.id,
          name: schema.users.name,
          email: schema.users.email,

          preferredLanguage: schema.users.preferredLanguage,
          emailVerified: schema.users.emailVerified,
          createdAt: schema.users.createdAt,
        });

      // This is the actual "sign up" moment from the user's perspective —
      // the account only becomes usable once the email is proven, so this
      // is where the session cookie gets set for the first time.
      const token = signJwt({ userId: user.id, email: user.email });
      const res = NextResponse.json({ user: updated });
      res.cookies.set(AUTH_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: AUTH_COOKIE_MAX_AGE_SECONDS,
      });
      return res;
    }

    // PASSWORD_RESET: hand back a short-lived, single-purpose token instead
    // of resetting the password here directly — keeps "prove you own the
    // email" and "set the new password" as two separate steps.
    const resetToken = signResetToken({ userId: user.id, email: user.email });
    return NextResponse.json({ resetToken });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
});
