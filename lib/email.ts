import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

// While your domain isn't verified with Resend, `onboarding@resend.dev`
// works out of the box for testing. Swap EMAIL_FROM once you've verified
// your own sending domain.
const FROM =
  process.env.EMAIL_FROM || 'StudyPlan Analyzer <onboarding@resend.dev>';

type OtpEmailPurpose = 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';

export async function sendOtpEmail(
  to: string,
  code: string,
  purpose: OtpEmailPurpose,
) {
  const isVerification = purpose === 'EMAIL_VERIFICATION';
  const subject = isVerification ? 'Verify your email' : 'Reset your password';
  const heading = isVerification
    ? 'Verify your email address'
    : 'Reset your password';
  const intro = isVerification
    ? 'Use the code below to verify your email address. It expires in 10 minutes.'
    : "Use the code below to reset your password. It expires in 10 minutes. If you didn't request this, you can safely ignore this email.";

  const html = `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #1e293b;">${heading}</h2>
      <p style="color: #475569; font-size: 14px;">${intro}</p>
      <div style="margin: 24px 0; text-align: center;">
        <span style="display: inline-block; font-size: 32px; font-weight: 700; letter-spacing: 8px; color: #4f46e5; background: #eef2ff; padding: 16px 24px; border-radius: 8px;">
          ${code}
        </span>
      </div>
      <p style="color: #94a3b8; font-size: 12px;">StudyPlan Analyzer</p>
    </div>
  `;

  const { error } = await resend.emails.send({ from: FROM, to, subject, html });
  if (error) {
    throw new Error(`Failed to send OTP email: ${error.message}`);
  }
}
