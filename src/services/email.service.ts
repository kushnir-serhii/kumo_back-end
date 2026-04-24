import { Resend } from 'resend';
import { env } from '../config/env';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

const FROM = 'Calmisu <noreply@calmisu.com>';

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  if (!resend) {
    console.log('[Resend] No API key — skipping sendVerificationEmail');
    return;
  }
  const verificationUrl = `${env.API_URL}/verify-email?token=${token}`;
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Verify your Calmisu email',
    html: `
      <h1>Welcome to Calmisu!</h1>
      <p>Please click the link below to verify your email address:</p>
      <a href="${verificationUrl}">${verificationUrl}</a>
      <p>This link will expire in 24 hours.</p>
      <p>If you didn't create an account with Calmisu, you can safely ignore this email.</p>
    `,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
  console.log('[Resend] sendVerificationEmail sent, id:', data?.id);
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<void> {
  if (!resend) {
    console.log('[Resend] No API key — skipping sendPasswordResetEmail');
    return;
  }
  const resetUrl = `${env.API_URL}/auth/password-reset-redirect?token=${token}`;
  const { data, error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: 'Reset your Calmisu password',
    html: `
      <h1>Reset your password</h1>
      <p>Click the link below to reset your Calmisu password:</p>
      <a href="${resetUrl}">${resetUrl}</a>
      <p>This link will expire in 1 hour.</p>
      <p>If you didn't request a password reset, you can safely ignore this email.</p>
    `,
  });
  if (error) throw new Error(`Resend error: ${error.message}`);
}
