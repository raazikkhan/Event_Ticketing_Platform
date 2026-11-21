import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { authenticate } from '../middleware/auth.js';
import {
  type WebhookPayload,
  createCheckout,
  processPaymentWebhook,
  verifyWebhookSignature,
} from '../services/payment.js';

const checkoutSchema = z.object({
  eventId: z.string().uuid(),
  holdId: z.string().uuid(),
});

const webhookSchema = z.object({
  id: z.string().optional(),
  event: z.string().optional(),
  payload: z
    .object({
      payment: z
        .object({
          entity: z
            .object({
              order_id: z.string().optional(),
              id: z.string().optional(),
              amount: z.number().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
});

export const paymentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/bookings/checkout', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    if (!user) return reply.status(401).send({ error: 'Authentication required' });

    const parsed = checkoutSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parsed.error.flatten(),
      });
    }

    try {
      const checkout = await createCheckout(user.id, parsed.data.eventId, parsed.data.holdId);
      if (!checkout) return reply.status(404).send({ error: 'Hold not found or expired' });
      return reply.status(201).send({ checkout });
    } catch (error) {
      request.log.error(error, 'Failed to create payment order');
      return reply.status(502).send({ error: 'Payment provider unavailable' });
    }
  });

  fastify.post('/api/payments/webhook', async (request, reply) => {
    const signature = request.headers['x-razorpay-signature'];
    const signatureHeader = Array.isArray(signature) ? signature[0] : signature;
    const rawBody = request.rawBody ?? JSON.stringify(request.body);

    if (!verifyWebhookSignature(rawBody, signatureHeader)) {
      return reply.status(400).send({ error: 'Invalid webhook signature' });
    }

    const parsedPayload = webhookSchema.safeParse(request.body);
    if (!parsedPayload.success) {
      return reply.status(400).send({ error: 'Invalid webhook payload' });
    }

    try {
      const result = await processPaymentWebhook(rawBody, parsedPayload.data as WebhookPayload);
      return reply.send({ success: true, replayed: result.replayed, status: result.status });
    } catch (error) {
      request.log.error(error, 'Failed to process payment webhook');
      return reply.status(500).send({ error: 'Webhook processing failed' });
    }
  });
};
