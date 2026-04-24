import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const isProd = process.env.NODE_ENV === 'production';

const optional = z.string().optional();
const optionalNum = z.string().transform(Number).optional();

const envSchema = z.object({
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  OPENAI_API_KEY: isProd ? z.string() : optional,
  API_URL: isProd ? z.string() : z.string().default('http://localhost:3001'),
  RESEND_API_KEY: isProd ? z.string() : optional,
  // RevenueCat (subscription management)
  REVENUECAT_SECRET_API_KEY: isProd ? z.string() : optional,
  REVENUECAT_WEBHOOK_SECRET: isProd ? z.string() : optional,
  REVENUECAT_SANDBOX: z.string().transform((v) => v === 'true').default('false'),
  // Expo Push Notifications (optional — increases delivery reliability)
  EXPO_ACCESS_TOKEN: optional,
  GOOGLE_SHEETS_PRIVATE_KEY: isProd ? z.string() : optional,
  GOOGLE_SHEETS_CLIENT_EMAIL: isProd ? z.string() : optional,
  GOOGLE_SHEETS_SPREADSHEET_ID: isProd ? z.string() : optional,
  // Google OAuth Client IDs (at least one required in production)
  GOOGLE_WEB_CLIENT_ID: optional,
  GOOGLE_ANDROID_CLIENT_ID: optional,
  GOOGLE_IOS_CLIENT_ID: optional,
  FREE_CHAT_MESSAGE_LIMIT: z.string().transform(Number).default('10'),
  APP_MIN_VERSION: z.string().default('1.0.0'),
  APP_LATEST_VERSION: z.string().default('1.0.0'),
  APP_STORE_URL_ANDROID: z.string().default('market://details?id=com.calmisu.app'),
  PORT: z.string().transform(Number).default('3001'),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
