import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { buildChatMessages, streamChatResponse, validateMessageTokens } from '../services/chat.service';
import { httpError } from '../utils/errors';
import { env } from '../config/env';

const chatStreamSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(100),
});

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  // POST /chat/stream (SSE)
  fastify.post('/stream', {
    config: {
      rateLimit: {
        max: 20,
        timeWindow: '1 hour',
        keyGenerator: (request: FastifyRequest) =>
          (request.user as any)?.userId ?? request.ip,
      },
    },
  }, async (request, reply) => {
    const parsed = chatStreamSchema.safeParse(request.body);
    
    if (!parsed.success) {
      return httpError(parsed.error.errors[0].message, 400);
    }
    
    const { messages } = parsed.data;

    const userId = (request.user as any).userId as string;

    // Enforce per-subscription message limit before SSE headers are written
    const user = await fastify.prisma.user.findUnique({
      where: { id: userId },
      select: { subscription: true, chatMessageCount: true, chatMessageCountDate: true },
    });

    // Compute effective daily count (reset if it's a new day)
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const countDate = user?.chatMessageCountDate ? new Date(user.chatMessageCountDate) : null;
    countDate?.setUTCHours(0, 0, 0, 0);
    const isNewDay = !countDate || countDate.getTime() < today.getTime();
    const effectiveCount = isNewDay ? 0 : (user?.chatMessageCount ?? 0);

    if (user?.subscription === 'free' && effectiveCount >= env.FREE_CHAT_MESSAGE_LIMIT) {
      return httpError('Chat message limit reached for free plan', 403);
    }

    validateMessageTokens(messages);

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    // Keep-alive interval
    const keepAliveInterval = setInterval(() => {
      reply.raw.write(': keepalive\n\n');
    }, 15000);

    // Handle client disconnect
    request.raw.on('close', () => {
      clearInterval(keepAliveInterval);
    });

    try {
      // Build chat messages with system prompt
      const chatMessages = buildChatMessages(messages);

      // Stream AI response
      for await (const token of streamChatResponse(chatMessages)) {
        reply.raw.write(
          `data: ${JSON.stringify({ type: 'token', content: token })}\n\n`
        );
      }
      // Increment daily message count for free users
      if (user?.subscription === 'free') {
        const newCount = effectiveCount + 1;
        await fastify.prisma.user.update({
          where: { id: userId },
          data: {
            chatMessageCount: newCount,
            ...(isNewDay ? { chatMessageCountDate: new Date() } : {}),
          },
        });
        reply.raw.write(`data: ${JSON.stringify({ type: 'messages_info', used: newCount, limit: env.FREE_CHAT_MESSAGE_LIMIT })}\n\n`);
        if (newCount >= env.FREE_CHAT_MESSAGE_LIMIT) {
          reply.raw.write(`data: ${JSON.stringify({ type: 'limit_reached' })}\n\n`);
        }
      }

      // Send done event
      reply.raw.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);

      // Send end signal
      reply.raw.write('data: [DONE]\n\n');
    } catch (error) {
      console.error('Stream error:', error);
      reply.raw.write(
        `data: ${JSON.stringify({ type: 'error', content: 'Failed to generate response' })}\n\n`
      );
    } finally {
      clearInterval(keepAliveInterval);
      reply.raw.end();
    }
  });
};

export default chatRoutes;
