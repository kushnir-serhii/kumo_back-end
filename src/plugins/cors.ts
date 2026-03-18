import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { env } from '../config/env';

const corsPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(cors, {
    // In dev: allow all origins (Postman, browser testing).
    // In prod: restrict to API_URL only to prevent credentialed requests from arbitrary sites.
    origin: env.NODE_ENV === 'development' ? true : [env.API_URL],
    credentials: true,
    methods: ['GET', 'POST', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  });
};

export default fp(corsPlugin, { name: 'cors' });
