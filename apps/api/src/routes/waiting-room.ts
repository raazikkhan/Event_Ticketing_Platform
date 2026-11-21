import type { FastifyPluginAsync } from 'fastify';
import { authenticate } from '../middleware/auth.js';
import { isHighDemandEvent, joinWaitingRoom } from '../services/waiting-room.js';

export const waitingRoomRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/events/:id/queue', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const { id: eventId } = request.params as { id: string };
    if (!(await isHighDemandEvent(eventId))) {
      return reply.send({
        eventId,
        admitted: true,
        position: null,
        admittedCount: 0,
        estimatedWaitSeconds: 0,
        admissionToken: null,
      });
    }

    return reply.send(await joinWaitingRoom(eventId, user.id));
  });

  fastify.post(
    '/api/events/:id/queue/join',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: 'Authentication required' });

      const { id: eventId } = request.params as { id: string };
      if (!(await isHighDemandEvent(eventId))) {
        return reply.status(409).send({ error: 'Waiting room is not enabled for this event' });
      }

      return reply.send(await joinWaitingRoom(eventId, user.id));
    },
  );
};
