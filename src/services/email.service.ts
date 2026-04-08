import { Resend } from 'resend';
import { env } from '../config/env';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    if (!env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    _resend = new Resend(env.RESEND_API_KEY);
  }
  return _resend;
}

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const verificationUrl = `${env.API_URL}/verify-email?token=${token}`;

  await getResend().emails.send({
    from: env.SMTP_FROM ?? 'Calmisu <noreply@calmisu.app>',
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
}

export async function sendPasswordResetEmail(
  email: string,
  token: string
): Promise<void> {
  const resetUrl = `${env.API_URL}/auth/password-reset-redirect?token=${token}`;

  await getResend().emails.send({
    from: env.SMTP_FROM ?? 'Calmisu <noreply@calmisu.app>',
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
}
