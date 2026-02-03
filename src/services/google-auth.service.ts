import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import { httpError } from '../utils/errors';

const client = new OAuth2Client();

export interface GoogleUserInfo {
  email: string;
  firstName: string | null;
  lastName: string | null;
  googleId: string;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleUserInfo> {
  const validClientIds = [
    env.GOOGLE_WEB_CLIENT_ID,
    env.GOOGLE_ANDROID_CLIENT_ID,
    env.GOOGLE_IOS_CLIENT_ID,
  ].filter((id): id is string => Boolean(id));

  if (validClientIds.length === 0) {
    httpError('Google OAuth is not configured', 500);
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: validClientIds,
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      httpError('No email in Google token', 400);
    }

    return {
      email: payload.email,
      firstName: payload.given_name || null,
      lastName: payload.family_name || null,
      googleId: payload.sub,
    };
  } catch {
    httpError('Invalid Google token', 400);
  }
}
