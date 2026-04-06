import nodemailer from 'nodemailer';
import { env } from '../config/env';

let _transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!_transporter) {
    if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
      throw new Error('SMTP credentials are not configured');
    }
    _transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      requireTLS: env.SMTP_PORT !== 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
  }
  return _transporter;
}

export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<void> {
  const verificationUrl = `${env.API_URL}/verify-email?token=${token}`;

  await getTransporter().sendMail({
    from: env.SMTP_FROM,
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

  await getTransporter().sendMail({
    from: env.SMTP_FROM,
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
