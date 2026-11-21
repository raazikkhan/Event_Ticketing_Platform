import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { env } from './config.js';
import { authRoutes } from './routes/auth.js';
import { eventRoutes } from './routes/events.js';
import { healthRoutes } from './routes/health.js';
import { holdRoutes } from './routes/holds.js';
import { paymentRoutes } from './routes/payments.js';

declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

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

  app.decorateRequest('rawBody', '');
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
    const rawBody = body.toString('utf8');
    request.rawBody = rawBody;
    try {
      done(null, rawBody.length === 0 ? {} : JSON.parse(rawBody));
    } catch {
      done(new Error('Invalid JSON'), undefined);
    }
  });

  app.register(healthRoutes);
  app.register(authRoutes);
  app.register(eventRoutes);
  app.register(holdRoutes);
  app.register(paymentRoutes);

  return app;
}
