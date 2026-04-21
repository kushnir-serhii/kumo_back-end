import { FastifyPluginAsync } from 'fastify';
import { env } from '../config/env';

const versionRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', { config: { rateLimit: { max: 200, timeWindow: '1 minute' } } }, async (_request, reply) => {
    return reply.send({
      minVersion: env.APP_MIN_VERSION,
      latestVersion: env.APP_LATEST_VERSION,
      storeUrl: env.APP_STORE_URL_ANDROID,
    });
  });
};

export default versionRoutes;
