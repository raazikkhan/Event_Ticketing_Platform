import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { tickets } from '../db/schema.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  createTicketQr,
  listAttendeeBookings,
  refundBooking,
  scanTicket,
} from '../services/tickets.js';

const scanSchema = z.object({
  ticketCode: z.string().min(20),
});

export const attendeeRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get(
    '/api/dashboard/bookings',
    { preHandler: [authenticate, requireRole('attendee')] },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: 'Authentication required' });

      return reply.send({ bookings: await listAttendeeBookings(user.id) });
    },
  );

  fastify.get(
    '/api/tickets/:ticketId/qr',
    { preHandler: [authenticate] },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: 'Authentication required' });

      const { ticketId } = request.params as { ticketId: string };
      const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1);
      if (!ticket || ticket.userId !== user.id) {
        return reply.status(404).send({ error: 'Ticket not found' });
      }

      const qrDataUrl = await createTicketQr(ticket.ticketCode);
      if (!ticket || !qrDataUrl) return reply.status(400).send({ error: 'Invalid ticket' });
      return reply.send({ qrCode: qrDataUrl, ticketCode: ticket.ticketCode });
    },
  );

  fastify.post(
    '/api/bookings/:bookingId/refund',
    { preHandler: [authenticate, requireRole('attendee')] },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: 'Authentication required' });

      const { bookingId } = request.params as { bookingId: string };
      const result = await refundBooking(user.id, bookingId);
      if (!result.success) {
        const status =
          result.reason === 'not_found'
            ? 404
            : result.reason === 'forbidden'
              ? 403
              : result.reason === 'too_late'
                ? 409
                : 400;
        const messages = {
          not_found: 'Booking not found',
          forbidden: 'You do not own this booking',
          not_confirmed: 'Only confirmed bookings can be refunded',
          too_late: 'Refunds are only allowed more than 24 hours before the event',
        };
        return reply.status(status).send({ error: messages[result.reason] });
      }

      return reply.send({ success: true, bookingId: result.bookingId });
    },
  );

  fastify.post(
    '/api/organizer/tickets/scan',
    { preHandler: [authenticate, requireRole('organizer')] },
    async (request, reply) => {
      const user = request.user;
      if (!user) return reply.status(401).send({ error: 'Authentication required' });

      const parsed = scanSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send({ error: 'Validation failed', details: parsed.error.flatten() });
      }

      const result = await scanTicket(user.id, parsed.data.ticketCode);
      if (!result.success) {
        const status =
          result.reason === 'invalid' || result.reason === 'not_found'
            ? 404
            : result.reason === 'forbidden'
              ? 403
              : 409;
        const messages = {
          invalid: 'Invalid ticket signature',
          already_used: 'Ticket has already been used',
          refunded: 'Ticket has been refunded',
          forbidden: 'This ticket belongs to another organizer',
          not_found: 'Ticket not found',
        };
        return reply.status(status).send({ error: messages[result.reason] });
      }

      return reply.send({ success: true, ticket: result.ticket });
    },
  );
};
