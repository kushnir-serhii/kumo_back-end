import { User, WeeklyStreak } from '@prisma/client';

export interface UserResponse {
  firstName: string | null;
  lastName: string | null;
  email: string;
  emailConfirmed: boolean;
  subscription: string;
  nextPaymentDate: string | null;
  trialEndsDate: string | null;
  weeklyStreak: { date: string }[];
  role: string;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: UserResponse;
}

export interface ErrorResponse {
  error: string;
  statusCode: number;
}

export interface WeeklyStreakDay {
  day: string;
  date: string;
  visited: boolean;
}

export interface WeeklyStreakResponse {
  streak: WeeklyStreakDay[];
  totalVisits: number;
}

export interface JwtPayload {
  userId: string;
  email: string;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}
