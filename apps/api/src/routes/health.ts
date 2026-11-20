import type { FastifyPluginAsync } from 'fastify';
import { checkDatabaseHealth } from '../db/index.js';
import { checkRedisHealth } from '../redis/index.js';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async (_request, reply) => {
    const [dbStatus, redisStatus] = await Promise.all([checkDatabaseHealth(), checkRedisHealth()]);

    const isHealthy = dbStatus.healthy && redisStatus.healthy;

    return reply.status(isHealthy ? 200 : 503).send({
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.floor(process.uptime()),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    });
  });
};
