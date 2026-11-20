import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config.js';
import { healthRoutes } from './routes/health.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
  });

  app.register(fastifyCors, {
    origin: [env.FRONTEND_URL, 'http://localhost:3000'],
    credentials: true,
  });

  app.register(fastifyCookie, {
    secret: env.SESSION_SECRET,
  });

  app.register(healthRoutes);

  return app;
}
