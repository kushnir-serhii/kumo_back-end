import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const bodySchema = z.object({
  rating: z.number().int().min(1).max(3).nullable().optional(),
});

const flowRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.post('/session', async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ message: parsed.error.errors[0].message, statusCode: 400 });
    }

    const { rating } = parsed.data;
    const { userId } = request.user;

    const session = await fastify.prisma.flowSession.create({
      data: { userId, rating: rating ?? null },
    });

    const totalCompletions = await fastify.prisma.flowSession.count({ where: { userId } });

    return reply.status(201).send({ ...session, totalCompletions });
  });
};

export default flowRoutes;
