import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import helmet from '@fastify/helmet';
import { env } from './config/env';
import prismaPlugin from './plugins/prisma';
import authPlugin from './plugins/auth';
import corsPlugin from './plugins/cors';
import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import chatRoutes from './routes/chat';
import subscriptionRoutes from './routes/subscription';
import streakRoutes from './routes/streak';
import feedbackRoutes from './routes/feedback';
import adminRoutes from './routes/admin';
import legalRoutes from './routes/legal';

const buildApp = async () => {
  const fastify = Fastify({
    bodyLimit: 512 * 1024, // 512 KB — covers all legitimate JSON payloads
    logger: env.NODE_ENV === 'development' ? true : { level: 'info' },
  });

  // Register plugins
  await fastify.register(helmet, {
    contentSecurityPolicy: false, // not needed for a mobile API
    hsts: { maxAge: 31536000, includeSubDomains: false },
  });
  await fastify.register(corsPlugin);
  await fastify.register(prismaPlugin);
  await fastify.register(authPlugin);
  await fastify.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });
  await fastify.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
    errorResponseBuilder: (_request, _context) => ({
      message: 'Too many requests, please try again later',
      statusCode: 429,
    }),
  });

  // Error handler
  fastify.setErrorHandler((error: Error & { statusCode?: number; isHttpError?: boolean; validation?: unknown; code?: string }, _request, reply) => {
    // Custom HTTP errors
    if (error.isHttpError && error.statusCode) {
      return reply.status(error.statusCode).send({
        message: error.message,
        statusCode: error.statusCode,
      });
    }

    // Fastify validation errors
    if (error.validation) {
      return reply.status(400).send({
        message: error.message,
        statusCode: 400,
      });
    }

    // JWT errors
    if (
      error.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' ||
      error.code === 'FST_JWT_BAD_REQUEST'
    ) {
      return reply.status(401).send({
        message: 'Authorization header missing',
        statusCode: 401,
      });
    }

    if (
      error.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED' ||
      error.code === 'FST_JWT_AUTHORIZATION_TOKEN_INVALID'
    ) {
      return reply.status(401).send({
        message: 'Token expired or invalid',
        statusCode: 401,
      });
    }

    fastify.log.error(error);
    return reply.status(500).send({
      message: 'Internal server error',
      statusCode: 500,
    });
  });

  // Register routes
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(profileRoutes);
  await fastify.register(chatRoutes, { prefix: '/chat' });
  await fastify.register(subscriptionRoutes, { prefix: '/subscription' });
  await fastify.register(streakRoutes, { prefix: '/streak' });
  await fastify.register(feedbackRoutes, { prefix: '/feedback' });
  await fastify.register(adminRoutes, { prefix: '/admin' });
  await fastify.register(legalRoutes, { prefix: '/legal' });

  // GET /verify-email?token=xxx — no auth, redirects to app after verifying token
  fastify.get('/verify-email', async (request, reply) => {
    const { token } = request.query as { token?: string };

    if (!token) {
      return reply.redirect('calmisu://email-verified?success=false&error=missing_token');
    }

    const verificationToken = await fastify.prisma.verificationToken.findUnique({
      where: { token },
    });

    if (!verificationToken) {
      return reply.redirect('calmisu://email-verified?success=false&error=invalid_token');
    }

    if (verificationToken.expiresAt < new Date()) {
      await fastify.prisma.verificationToken.delete({ where: { id: verificationToken.id } });
      return reply.redirect('calmisu://email-verified?success=false&error=expired_token');
    }

    await fastify.prisma.user.update({
      where: { id: verificationToken.userId },
      data: { emailConfirmed: true },
    });

    await fastify.prisma.verificationToken.delete({ where: { id: verificationToken.id } });

    return reply.redirect('calmisu://email-verified?success=true');
  });

  // Health check
  fastify.get('/health', async () => ({ status: 'ok' }));

  return fastify;
};

const start = async () => {
  try {
    const app = await buildApp();
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Server running on port ${env.PORT}`);
  } catch (err) {
    console.error("ERROR in app.ts: ", err);
    process.exit(1);
  }
};

start();

export { buildApp };
