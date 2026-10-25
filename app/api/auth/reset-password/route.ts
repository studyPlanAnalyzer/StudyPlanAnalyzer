import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { verifyResetToken } from '@/lib/auth/jwt';
import { withErrorHandling } from "@/lib/api/handler";

const resetPasswordSchema = z.object({
  resetToken: z.string().min(1),
  newPassword: z.string().min(8, 'Password must be at least 8 characters'),
});

export const POST = withErrorHandling(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const { resetToken, newPassword } = parsed.data;

    const payload = verifyResetToken(resetToken);
    if (!payload) {
      return NextResponse.json(
        { error: 'This reset link has expired. Please request a new code.' },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db
      .update(schema.users)
      .set({ passwordHash })
      .where(eq(schema.users.id, payload.userId));

    return NextResponse.json({
      message: 'Password updated. You can now log in.',
    });
  } catch (err) {
    console.error('Reset password error:', err);
    return NextResponse.json(
      { error: 'Something went wrong. Please try again.' },
      { status: 500 },
    );
  }
});
