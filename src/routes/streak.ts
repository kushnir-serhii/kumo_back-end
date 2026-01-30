import { FastifyPluginAsync } from 'fastify';
import { WeeklyStreakDay, WeeklyStreakResponse } from '../types';

const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

function getWeekBounds(): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  // Convert Sunday (0) to 7 for easier calculation (Monday = 1)
  const adjustedDay = dayOfWeek === 0 ? 7 : dayOfWeek;

  // Get Monday of current week (start)
  const start = new Date(now);
  start.setUTCDate(now.getUTCDate() - adjustedDay + 1);
  start.setUTCHours(0, 0, 0, 0);

  // Get Sunday of current week (end)
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  end.setUTCHours(23, 59, 59, 999);

  return { start, end };
}

function getTodayUTC(): Date {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  return now;
}

function formatDateString(date: Date): string {
  return date.toISOString().split('T')[0];
}

function buildWeeklyStreak(visitedDates: Date[]): WeeklyStreakResponse {
  const { start } = getWeekBounds();
  const visitedSet = new Set(visitedDates.map((d) => formatDateString(d)));

  const streak: WeeklyStreakDay[] = DAYS_OF_WEEK.map((day, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    const dateStr = formatDateString(date);

    return {
      day,
      date: dateStr,
      visited: visitedSet.has(dateStr),
    };
  });

  const totalVisits = streak.filter((d) => d.visited).length;

  return { streak, totalVisits };
}

const streakRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  // GET /streak - Get current week's streak
  fastify.get('/', async (request, reply) => {
    const userId = request.user.userId;
    const { start, end } = getWeekBounds();

    const streaks = await fastify.prisma.weeklyStreak.findMany({
      where: {
        userId,
        date: {
          gte: start,
          lte: end,
        },
      },
    });

    const response = buildWeeklyStreak(streaks.map((s) => s.date));
    return reply.send(response);
  });

  // POST /streak/check-in - Record today's visit
  fastify.post('/check-in', async (request, reply) => {
    const userId = request.user.userId;
    const today = getTodayUTC();
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(today.getUTCDate() + 1);

    // Check if already checked in today
    const existing = await fastify.prisma.weeklyStreak.findFirst({
      where: {
        userId,
        date: {
          gte: today,
          lt: tomorrow,
        },
      },
    });

    if (!existing) {
      await fastify.prisma.weeklyStreak.create({
        data: {
          userId,
          date: today,
        },
      });
    }

    // Fetch updated streak for current week
    const { start, end } = getWeekBounds();
    const streaks = await fastify.prisma.weeklyStreak.findMany({
      where: {
        userId,
        date: {
          gte: start,
          lte: end,
        },
      },
    });

    const response = buildWeeklyStreak(streaks.map((s) => s.date));
    return reply.send({
      success: true,
      message: existing ? 'Already checked in today' : 'Check-in recorded',
      ...response,
    });
  });
};

export default streakRoutes;
