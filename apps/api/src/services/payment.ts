import crypto from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import Razorpay from 'razorpay';
import { env } from '../config.js';
import { db } from '../db/index.js';
import {
  events,
  bookings,
  confirmedSeats,
  refunds,
  seats,
  sections,
  tickets,
  users,
  webhookEvents,
} from '../db/schema.js';
import { publishSeatUpdate } from '../redis/index.js';
import { queueBookingEmail } from './email.js';
import { getSeatHold, releaseSeatHold } from './seat-hold.js';

interface CheckoutResult {
  bookingId: string;
  razorpayOrderId: string;
  amount: number;
  currency: 'INR';
  keyId?: string;
}

export async function createCheckout(
  userId: string,
  eventId: string,
  holdId: string,
): Promise<CheckoutResult | null> {
  const hold = await getSeatHold(eventId, userId, holdId);
  if (!hold) return null;

  const eventSeats = await db
    .select({
      id: seats.id,
      sectionId: seats.sectionId,
    })
    .from(seats)
    .where(and(eq(seats.eventId, eventId), inArray(seats.id, hold.seatIds)));
  if (eventSeats.length !== hold.seatIds.length) return null;

  const sectionIds = Array.from(new Set(eventSeats.map((seat) => seat.sectionId)));
  const eventSections = await db
    .select({ id: sections.id, price: sections.price })
    .from(sections)
    .where(inArray(sections.id, sectionIds));
  const priceBySection = new Map(eventSections.map((section) => [section.id, section.price]));
  const amount = eventSeats.reduce(
    (total, seat) => total + (priceBySection.get(seat.sectionId) ?? 0),
    0,
  );

  const [booking] = await db
    .insert(bookings)
    .values({
      userId,
      eventId,
      totalAmount: amount,
      status: 'pending',
      holdId,
    })
    .returning();

  let razorpayOrderId: string;
  if (env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET) {
    const razorpay = new Razorpay({
      key_id: env.RAZORPAY_KEY_ID,
      key_secret: env.RAZORPAY_KEY_SECRET,
    });
    const order = await razorpay.orders.create({
      amount,
      currency: 'INR',
      receipt: booking.id,
      notes: { event_id: eventId, hold_id: holdId, user_id: userId },
    });
    razorpayOrderId = String(order.id);
  } else {
    razorpayOrderId = `test_order_${booking.id}`;
  }

  await db
    .update(bookings)
    .set({ razorpayOrderId, updatedAt: new Date() })
    .where(eq(bookings.id, booking.id));

  return {
    bookingId: booking.id,
    razorpayOrderId,
    amount,
    currency: 'INR',
    keyId: env.RAZORPAY_KEY_ID,
  };
}

export function verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
  if (!signature) return false;
  const secret =
    env.RAZORPAY_WEBHOOK_SECRET ?? (env.NODE_ENV === 'test' ? 'test-webhook-secret' : undefined);
  if (!secret) return false;

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const provided = Buffer.from(signature);
  const calculated = Buffer.from(expected);
  return provided.length === calculated.length && crypto.timingSafeEqual(provided, calculated);
}

interface CapturedPayment {
  order_id?: string;
  id?: string;
  amount?: number;
}

export interface WebhookPayload {
  id?: string;
  event?: string;
  payload?: {
    payment?: {
      entity?: CapturedPayment;
    };
  };
}

function ticketCode(bookingId: string, eventId: string, seatId: string, userId: string): string {
  const payload = `${bookingId}:${eventId}:${seatId}:${userId}`;
  const signature = crypto
    .createHmac('sha256', env.TICKET_SIGNING_SECRET)
    .update(payload)
    .digest('hex');
  return `${payload}.${signature}`;
}

export async function processPaymentWebhook(
  rawBody: string,
  payload: WebhookPayload,
): Promise<{ replayed: boolean; status: 'processed' | 'ignored' }> {
  const eventId = payload.id ?? crypto.createHash('sha256').update(rawBody).digest('hex');

  const inserted = await db
    .insert(webhookEvents)
    .values({
      eventId,
      eventType: payload.event ?? 'unknown',
      payload,
      status: 'processed',
    })
    .onConflictDoNothing()
    .returning({ eventId: webhookEvents.eventId });

  if (inserted.length === 0) return { replayed: true, status: 'processed' };

  const payment = payload.payload?.payment?.entity;
  if (!payment?.order_id) {
    await db
      .update(webhookEvents)
      .set({ status: 'ignored', processedAt: new Date() })
      .where(eq(webhookEvents.eventId, eventId));
    return { replayed: false, status: 'ignored' };
  }

  const [booking] = await db
    .select()
    .from(bookings)
    .where(eq(bookings.razorpayOrderId, payment.order_id))
    .limit(1);
  if (!booking) {
    await db
      .update(webhookEvents)
      .set({ status: 'ignored', processedAt: new Date() })
      .where(eq(webhookEvents.eventId, eventId));
    return { replayed: false, status: 'ignored' };
  }

  if (payload.event === 'payment.failed') {
    await db
      .update(bookings)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(bookings.id, booking.id));
    if (booking.holdId) {
      await releaseSeatHold(booking.eventId, booking.userId, booking.holdId);
    }
    return { replayed: false, status: 'processed' };
  }

  if (payload.event !== 'payment.captured') {
    await db
      .update(webhookEvents)
      .set({ status: 'ignored', processedAt: new Date() })
      .where(eq(webhookEvents.eventId, eventId));
    return { replayed: false, status: 'ignored' };
  }

  if (booking.status === 'confirmed') {
    return { replayed: false, status: 'processed' };
  }

  if (!booking.holdId) {
    await db
      .update(webhookEvents)
      .set({ status: 'ignored', processedAt: new Date() })
      .where(eq(webhookEvents.eventId, eventId));
    return { replayed: false, status: 'ignored' };
  }

  const hold = await getSeatHold(booking.eventId, booking.userId, booking.holdId);
  if (!hold) {
    await db.transaction(async (tx) => {
      await tx
        .update(bookings)
        .set({ status: 'refunded', razorpayPaymentId: payment.id, updatedAt: new Date() })
        .where(eq(bookings.id, booking.id));
      await tx.insert(refunds).values({
        bookingId: booking.id,
        userId: booking.userId,
        amount: booking.totalAmount,
        reason: 'Seat hold expired before payment confirmation',
        status: 'pending',
      });
    });
    return { replayed: false, status: 'processed' };
  }

  const holdSeats = await db
    .select({
      id: seats.id,
      sectionId: seats.sectionId,
    })
    .from(seats)
    .where(and(eq(seats.eventId, booking.eventId), inArray(seats.id, hold.seatIds)));
  if (holdSeats.length !== hold.seatIds.length) return { replayed: false, status: 'ignored' };

  const sectionIds = Array.from(new Set(holdSeats.map((seat) => seat.sectionId)));
  const seatSections = await db
    .select({ id: sections.id, price: sections.price })
    .from(sections)
    .where(inArray(sections.id, sectionIds));
  const priceBySection = new Map(seatSections.map((section) => [section.id, section.price]));

  await db.transaction(async (tx) => {
    for (const seat of holdSeats) {
      await tx.insert(confirmedSeats).values({
        eventId: booking.eventId,
        seatId: seat.id,
        bookingId: booking.id,
        price: priceBySection.get(seat.sectionId) ?? 0,
      });
    }

    await tx
      .update(bookings)
      .set({
        status: 'confirmed',
        razorpayPaymentId: payment.id,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id));

    for (const seat of holdSeats) {
      await tx.insert(tickets).values({
        bookingId: booking.id,
        seatId: seat.id,
        eventId: booking.eventId,
        userId: booking.userId,
        ticketCode: ticketCode(booking.id, booking.eventId, seat.id, booking.userId),
        status: 'issued',
      });
    }
  });

  await releaseSeatHold(booking.eventId, booking.userId, booking.holdId);
  await publishSeatUpdate(
    booking.eventId,
    'sold',
    holdSeats.map((seat) => seat.id),
  );
  const [attendee] = await db.select().from(users).where(eq(users.id, booking.userId)).limit(1);
  const [event] = await db.select().from(events).where(eq(events.id, booking.eventId)).limit(1);
  if (attendee && event) {
    await queueBookingEmail(attendee.email, booking.id, event.title);
  }
  return { replayed: false, status: 'processed' };
}
