import { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import path from 'path';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}

function resolveDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith('file:')) return undefined;
  const filePath = url.replace('file:', '');
  return 'file:' + path.resolve(filePath);
}

const prismaPlugin: FastifyPluginAsync = async (fastify) => {
  const datasourceUrl = resolveDatasourceUrl();
  const prisma = new PrismaClient(datasourceUrl ? { datasourceUrl } : {});

  await prisma.$connect();

  fastify.decorate('prisma', prisma);

  fastify.addHook('onClose', async (instance) => {
    await instance.prisma.$disconnect();
  });
};

export default fp(prismaPlugin, { name: 'prisma' });
