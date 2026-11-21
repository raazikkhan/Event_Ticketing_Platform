import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { env } from '../config.js';
import { authenticate } from '../middleware/auth.js';
import { getEventDetailsWithSeats } from '../services/event.js';
import { checkSlidingWindowRateLimit } from '../services/rate-limit.js';
import { createSeatHold, getSeatHold, releaseSeatHold } from '../services/seat-hold.js';
import { isHighDemandEvent, verifyAdmissionToken } from '../services/waiting-room.js';

const holdSchema = z.object({
  seatIds: z.array(z.string().uuid()).min(1).max(8),
});

export const holdRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/events/:id/availability', async (request, reply) => {
    const { id: eventId } = request.params as { id: string };
    const data = await getEventDetailsWithSeats(eventId);
    if (!data) return reply.status(404).send({ error: 'Event not found' });

    return reply.send({
      eventId,
      seats: data.seats.map((seat) => ({
        id: seat.id,
        seatLabel: seat.seatLabel,
        status: seat.status,
      })),
    });
  });

  fastify.post('/api/events/:id/holds', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const parsed = holdSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    const { id: eventId } = request.params as { id: string };
    const ip =
      request.headers['x-forwarded-for']?.toString().split(',')[0].trim() ??
      request.ip ??
      'unknown';
    const [ipLimit, userLimit] = await Promise.all([
      checkSlidingWindowRateLimit(`hold:ip:${ip}`, env.HOLD_RATE_LIMIT_PER_WINDOW),
      checkSlidingWindowRateLimit(`hold:user:${user.id}`, env.HOLD_RATE_LIMIT_PER_WINDOW),
    ]);
    if (!ipLimit.allowed || !userLimit.allowed) {
      reply.header(
        'Retry-After',
        String(Math.max(ipLimit.retryAfterSeconds, userLimit.retryAfterSeconds)),
      );
      return reply.status(429).send({ error: 'Too many hold requests' });
    }

    if (await isHighDemandEvent(eventId)) {
      const admissionToken =
        typeof request.headers['x-admission-token'] === 'string'
          ? request.headers['x-admission-token']
          : null;
      if (!admissionToken || !verifyAdmissionToken(eventId, user.id, admissionToken)) {
        return reply.status(403).send({ error: 'Valid waiting-room admission required' });
      }
    }

    const result = await createSeatHold(eventId, user.id, parsed.data.seatIds);

    if (!result.hold) {
      if (result.reason === 'invalid_seats') {
        return reply.status(404).send({ error: 'One or more seats do not belong to this event' });
      }
      if (result.reason === 'sold') {
        return reply.status(409).send({ error: 'One or more seats are already sold' });
      }
      if (result.reason === 'limit') {
        return reply.status(429).send({ error: 'Seat hold limit exceeded' });
      }
      return reply.status(409).send({ error: 'One or more seats are already held' });
    }

    return reply.status(201).send({ hold: result.hold });
  });

  fastify.get(
    '/api/events/:id/holds/:holdId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: 'Authentication required' });

      const { id: eventId, holdId } = request.params as { id: string; holdId: string };
      const hold = await getSeatHold(eventId, user.id, holdId);
      if (!hold) return reply.status(404).send({ error: 'Hold not found or expired' });

      return reply.send({ hold });
    },
  );

  fastify.delete(
    '/api/events/:id/holds/:holdId',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: 'Authentication required' });

      const { id: eventId, holdId } = request.params as { id: string; holdId: string };
      const released = await releaseSeatHold(eventId, user.id, holdId);
      if (!released) return reply.status(404).send({ error: 'Hold not found or not owned by you' });

      return reply.send({ success: true });
    },
  );
};
