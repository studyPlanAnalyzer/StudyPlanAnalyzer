import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db, schema } from '@/lib/db';
import { sendOtpEmail } from '@/lib/email';

export type OtpPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

export class OtpThrottledError extends Error {}

function generateCode(): string {
  // crypto.randomInt is uniform and cryptographically secure — unlike
  // Math.random(), which is fine for UI jitter but not for the only thing
  // standing between an attacker and a password reset.
  const min = 10 ** (OTP_LENGTH - 1);
  const max = 10 ** OTP_LENGTH - 1;
  return crypto.randomInt(min, max + 1).toString();
}

export async function createAndSendOtp({
  userId,
  email,
  purpose,
}: {
  userId: string;
  email: string;
  purpose: OtpPurpose;
}) {
  const [recent] = await db
    .select({ createdAt: schema.otpCodes.createdAt })
    .from(schema.otpCodes)
    .where(
      and(
        eq(schema.otpCodes.email, email),
        eq(schema.otpCodes.purpose, purpose),
      ),
    )
    .orderBy(desc(schema.otpCodes.createdAt))
    .limit(1);

  if (
    recent &&
    Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000
  ) {
    throw new OtpThrottledError(
      'Please wait a minute before requesting another code',
    );
  }

  // Only the most recently issued code should ever be valid — invalidate
  // any earlier, unconsumed codes for this email + purpose so a stale code
  // from a previous email can't be used alongside the fresh one.
  await db
    .update(schema.otpCodes)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(schema.otpCodes.email, email),
        eq(schema.otpCodes.purpose, purpose),
        isNull(schema.otpCodes.consumedAt),
      ),
    );

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  await db.insert(schema.otpCodes).values({
    userId,
    email,
    purpose,
    codeHash,
    expiresAt,
  });

  await sendOtpEmail(email, code, purpose);
}

export async function verifyOtp({
  email,
  purpose,
  code,
}: {
  email: string;
  purpose: OtpPurpose;
  code: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const [row] = await db
    .select()
    .from(schema.otpCodes)
    .where(
      and(
        eq(schema.otpCodes.email, email),
        eq(schema.otpCodes.purpose, purpose),
        isNull(schema.otpCodes.consumedAt),
      ),
    )
    .orderBy(desc(schema.otpCodes.createdAt))
    .limit(1);

  if (!row) {
    return { success: false, error: 'Invalid or expired code' };
  }
  if (row.expiresAt.getTime() < Date.now()) {
    return {
      success: false,
      error: 'This code has expired. Please request a new one.',
    };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return {
      success: false,
      error: 'Too many incorrect attempts. Please request a new code.',
    };
  }

  const matches = await bcrypt.compare(code, row.codeHash);
  if (!matches) {
    await db
      .update(schema.otpCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(schema.otpCodes.id, row.id));
    return { success: false, error: 'Incorrect code' };
  }

  await db
    .update(schema.otpCodes)
    .set({ consumedAt: new Date() })
    .where(eq(schema.otpCodes.id, row.id));
  return { success: true };
}
