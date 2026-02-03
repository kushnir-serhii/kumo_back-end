import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { httpError } from '../utils/errors';
import { appendFeedbackToSheet } from '../services/sheets.service';

const feedbackSchema = z.object({
  feedback: z.string().max(300, 'Feedback must be 300 characters or less').optional(),
  rating: z.number().int().min(0).max(2).optional(),
  name: z.string().optional(),
});

const feedbackRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/', async (request, reply) => {
    const parsed = feedbackSchema.safeParse(request.body);

    if (!parsed.success) {
      httpError(parsed.error.errors[0].message, 400);
    }

    const { feedback, rating, name } = parsed.data;

    try {
      await appendFeedbackToSheet({ name, rating, feedback });

      return reply.send({
        success: true,
        message: 'Feedback submitted successfully',
      });
    } catch (error) {
      fastify.log.error(error);
      httpError('Failed to submit feedback', 500);
    }
  });
};

export default feedbackRoutes;
