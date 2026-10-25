import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { createAndSendOtp, OtpThrottledError } from '@/lib/auth/otp';
import { withErrorHandling } from "@/lib/api/handler";

const sendOtpSchema = z.object({
  email: z.string().email(),
  purpose: z.enum(['EMAIL_VERIFICATION', 'PASSWORD_RESET']),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parsed = sendOtpSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { email, purpose } = parsed.data;

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, email))
      .limit(1);

    if (purpose === 'EMAIL_VERIFICATION') {
      if (!user) {
        return NextResponse.json(
          { error: 'No account found with this email' },
          { status: 404 },
        );
      }
      if (user.emailVerified) {
        return NextResponse.json({ message: 'Email is already verified' });
      }
      await createAndSendOtp({ userId: user.id, email: user.email, purpose });
      return NextResponse.json({ message: 'Verification code sent' });
    }

    // PASSWORD_RESET: respond identically whether or not the account
    // exists, so this endpoint can't be used to enumerate registered
    // emails. The actual send only happens if a user was found.
    if (user) {
      await createAndSendOtp({ userId: user.id, email: user.email, purpose });
    }
    return NextResponse.json({
      message:
        'If an account exists for this email, a reset code has been sent',
    });
  } catch (err) {
    if (err instanceof OtpThrottledError) {
      return NextResponse.json({ error: err.message }, { status: 429 });
    }
    console.error('Send OTP error:', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
});
