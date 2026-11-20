import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { events } from '../db/schema.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import {
  createEventWithLayout,
  getEventDetailsWithSeats,
  listOrganizerEvents,
  listPublishedEvents,
  seedDemoEventIfEmpty,
} from '../services/event.js';

const sectionSchema = z.object({
  name: z.string().min(1, 'Section name is required'),
  price: z.number().int().positive('Price must be a positive integer in smallest currency units'),
  rowsCount: z.number().int().min(1).max(50, 'Max 50 rows per section'),
  seatsPerRow: z.number().int().min(1).max(100, 'Max 100 seats per row'),
});

const createEventSchema = z.object({
  title: z.string().min(3, 'Title must have at least 3 characters'),
  description: z.string().min(10, 'Description must have at least 10 characters'),
  venueName: z.string().min(2, 'Venue name is required'),
  venueAddress: z.string().min(5, 'Venue address is required'),
  eventDate: z
    .string()
    .datetime()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  status: z.enum(['draft', 'published']).default('published'),
  isHighDemand: z.boolean().default(false),
  sections: z.array(sectionSchema).min(1, 'At least one seating section is required'),
});

export const eventRoutes: FastifyPluginAsync = async (fastify) => {
  // Public: List all published events
  fastify.get('/api/events', async (_request, reply) => {
    const published = await listPublishedEvents();
    return reply.send({ events: published });
  });

  // Public: Get event detail and seat inventory
  fastify.get('/api/events/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = await getEventDetailsWithSeats(id);

    if (!data) {
      return reply.status(404).send({ error: 'Event not found' });
    }

    return reply.send(data);
  });

  // Organizer: List organizer's own events
  fastify.get(
    '/api/organizer/events',
    { preHandler: [authenticate, requireRole('organizer')] },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }
      const organizerEvents = await listOrganizerEvents(user.id);
      return reply.send({ events: organizerEvents });
    },
  );

  // Organizer: Create new event with automated seat matrix generation
  fastify.post(
    '/api/events',
    { preHandler: [authenticate, requireRole('organizer')] },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const parseResult = createEventSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: 'Validation failed',
          details: parseResult.error.flatten(),
        });
      }

      const data = parseResult.data;
      const date = new Date(data.eventDate);

      const created = await createEventWithLayout({
        organizerId: user.id,
        title: data.title,
        description: data.description,
        venueName: data.venueName,
        venueAddress: data.venueAddress,
        eventDate: date,
        status: data.status,
        isHighDemand: data.isHighDemand,
        sections: data.sections,
      });

      return reply.status(201).send(created);
    },
  );

  // Organizer: Update event details or publish status
  fastify.put(
    '/api/events/:id',
    { preHandler: [authenticate, requireRole('organizer')] },
    async (request, reply) => {
      const user = request.user;
      if (!user) {
        return reply.status(401).send({ error: 'Authentication required' });
      }

      const { id } = request.params as { id: string };
      const [existing] = await db.select().from(events).where(eq(events.id, id)).limit(1);

      if (!existing) {
        return reply.status(404).send({ error: 'Event not found' });
      }

      if (existing.organizerId !== user.id) {
        return reply.status(403).send({ error: 'Forbidden: You do not own this event' });
      }

      const body = request.body as Partial<{
        title: string;
        description: string;
        venueName: string;
        venueAddress: string;
        status: 'draft' | 'published' | 'cancelled' | 'completed';
        isHighDemand: boolean;
      }>;

      const [updated] = await db
        .update(events)
        .set({
          ...body,
          updatedAt: new Date(),
        })
        .where(eq(events.id, id))
        .returning();

      return reply.send({ event: updated });
    },
  );

  // Seed demo event for easy evaluation
  fastify.post('/api/events/seed-demo', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    await seedDemoEventIfEmpty(user.id);
    const all = await listPublishedEvents();
    return reply.send({ message: 'Demo events checked/seeded', events: all });
  });
};
