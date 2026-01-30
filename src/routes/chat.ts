import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../utils/errors';
import { buildChatMessages, streamChatResponse } from '../services/chat.service';

const chatStreamSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(10000),
      })
    )
    .min(1)
    .max(100),
});

const chatRoutes: FastifyPluginAsync = async (fastify) => {
  // All routes require authentication
  fastify.addHook('onRequest', fastify.authenticate);

  // POST /chat/stream (SSE)
  fastify.post('/stream', async (request, reply) => {
    const parsed = chatStreamSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.errors[0].message, 400);
    }

    const { messages } = parsed.data;

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
