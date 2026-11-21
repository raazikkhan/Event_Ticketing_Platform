import type { FastifyPluginAsync } from 'fastify';
import { redisPubSub, seatUpdateChannel } from '../redis/index.js';

export const seatStreamRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/events/:id/seats/stream', async (request, reply) => {
    const { id: eventId } = request.params as { id: string };

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    reply.raw.write(`event: sync\ndata: ${JSON.stringify({ eventId })}\n\n`);

    const subscriber = redisPubSub.duplicate();
    await subscriber.connect();
    const channel = seatUpdateChannel(eventId);
    await subscriber.subscribe(channel);

    const onMessage = (_channel: string, message: string) => {
      if (!reply.raw.destroyed) {
        reply.raw.write(`event: seat-update\ndata: ${message}\n\n`);
      }
    };
    subscriber.on('message', onMessage);

    const heartbeat = setInterval(() => {
      if (reply.raw.destroyed) return;
      reply.raw.write(`event: heartbeat\ndata: ${JSON.stringify({ eventId })}\n\n`);
    }, 5000);

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      clearInterval(heartbeat);
      subscriber.off('message', onMessage);
      void subscriber.unsubscribe(channel).finally(() => subscriber.quit());
    };

    request.raw.on('close', close);
  });
};
