import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { createAndSendOtp } from '@/lib/auth/otp';
import { withErrorHandling } from '@/lib/api/handler';

const signupSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  email: z.string().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  preferredLanguage: z.enum(['en', 'ne']).optional(),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parsed = signupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { name, email, password, preferredLanguage } = parsed.data;

    const [existing] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);
    if (existing) {
      return NextResponse.json(
        { error: 'An account with this email already exists' },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const [user] = await db
      .insert(schema.users)
      .values({
        name,
        email,
        passwordHash,
        preferredLanguage: preferredLanguage || 'en',
        // Deliberately NOT setting lastLoginAt here — the account exists
        // but the person isn't considered "logged in" until they verify.
      })
      .returning({
        id: schema.users.id,
        name: schema.users.name,
        email: schema.users.email,
        emailVerified: schema.users.emailVerified,
        createdAt: schema.users.createdAt,
      });

    // Signup should still succeed even if the email provider hiccups —
    // the user can hit "resend code" on the verify-email page.
    try {
      await createAndSendOtp({
        userId: user.id,
        email: user.email,
        purpose: 'EMAIL_VERIFICATION',
      });
    } catch (otpErr) {
      console.error('Failed to send signup verification email:', otpErr);
    }

    // No cookie is set here. Signing up no longer implies being signed in —
    // that only happens once the OTP is verified, in verify-otp/route.ts.
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    console.error('Signup error:', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
});
