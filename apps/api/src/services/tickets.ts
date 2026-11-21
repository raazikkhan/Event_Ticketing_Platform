import crypto from 'node:crypto';
import { and, eq, gt, gte, inArray, or } from 'drizzle-orm';
import QRCode from 'qrcode';
import { env } from '../config.js';
import { db } from '../db/index.js';
import { events, bookings, confirmedSeats, refunds, seats, tickets, users } from '../db/schema.js';
import { publishSeatUpdate } from '../redis/index.js';

export function verifyTicketCode(code: string): {
  bookingId: string;
  eventId: string;
  seatId: string;
  userId: string;
} | null {
  const separator = code.lastIndexOf('.');
  if (separator < 0) return null;
  const payload = code.slice(0, separator);
  const signature = code.slice(separator + 1);
  const parts = payload.split(':');
  if (parts.length !== 4) return null;

  const expected = crypto
    .createHmac('sha256', env.TICKET_SIGNING_SECRET)
    .update(payload)
    .digest('hex');
  const supplied = Buffer.from(signature);
  const calculated = Buffer.from(expected);
  if (supplied.length !== calculated.length || !crypto.timingSafeEqual(supplied, calculated)) {
    return null;
  }

  return {
    bookingId: parts[0],
    eventId: parts[1],
    seatId: parts[2],
    userId: parts[3],
  };
}

export async function listAttendeeBookings(userId: string) {
  const userBookings = await db
    .select()
    .from(bookings)
    .where(eq(bookings.userId, userId))
    .orderBy(bookings.createdAt);

  const results = [];
  for (const booking of userBookings) {
    const [event] = await db.select().from(events).where(eq(events.id, booking.eventId)).limit(1);
    const bookingTickets = await db
      .select({
        id: tickets.id,
        seatId: tickets.seatId,
        ticketCode: tickets.ticketCode,
        status: tickets.status,
        scannedAt: tickets.scannedAt,
      })
      .from(tickets)
      .where(eq(tickets.bookingId, booking.id));

    results.push({
      ...booking,
      event: event ?? null,
      tickets: bookingTickets,
    });
  }
  return results;
}

export async function createTicketQr(ticketCode: string): Promise<string | null> {
  if (!verifyTicketCode(ticketCode)) return null;
  return QRCode.toDataURL(ticketCode, {
    width: 512,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}

export async function scanTicket(
  organizerId: string,
  ticketCode: string,
): Promise<
  | { success: true; ticket: typeof tickets.$inferSelect }
  | { success: false; reason: 'invalid' | 'already_used' | 'refunded' | 'forbidden' | 'not_found' }
> {
  const verified = verifyTicketCode(ticketCode);
  if (!verified) return { success: false, reason: 'invalid' };

  const [ticket] = await db
    .select()
    .from(tickets)
    .where(eq(tickets.ticketCode, ticketCode))
    .limit(1);
  if (!ticket) return { success: false, reason: 'not_found' };
  if (ticket.status === 'refunded') return { success: false, reason: 'refunded' };
  if (ticket.status === 'used') return { success: false, reason: 'already_used' };

  const [event] = await db.select().from(events).where(eq(events.id, ticket.eventId)).limit(1);
  if (!event) return { success: false, reason: 'not_found' };
  if (event.organizerId !== organizerId) {
    return { success: false, reason: 'forbidden' };
  }

  const updated = await db.transaction(async (tx) => {
    const [scanned] = await tx
      .update(tickets)
      .set({
        status: 'used',
        scannedAt: new Date(),
        scannedBy: organizerId,
        updatedAt: new Date(),
      })
      .where(and(eq(tickets.id, ticket.id), eq(tickets.status, 'issued')))
      .returning();
    return scanned ?? null;
  });

  if (!updated) return { success: false, reason: 'already_used' };
  return { success: true, ticket: updated };
}

export async function refundBooking(
  userId: string,
  bookingId: string,
): Promise<
  | { success: true; bookingId: string }
  | { success: false; reason: 'not_found' | 'forbidden' | 'not_confirmed' | 'too_late' }
> {
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId)).limit(1);
  if (!booking) return { success: false, reason: 'not_found' };
  if (booking.userId !== userId) return { success: false, reason: 'forbidden' };
  if (booking.status !== 'confirmed') return { success: false, reason: 'not_confirmed' };

  const [event] = await db.select().from(events).where(eq(events.id, booking.eventId)).limit(1);
  if (!event) return { success: false, reason: 'not_found' };

  const cutoff = new Date(event.eventDate);
  cutoff.setHours(cutoff.getHours() - 24);
  if (Date.now() > cutoff.getTime()) return { success: false, reason: 'too_late' };

  const bookingSeats = await db
    .select({ seatId: confirmedSeats.seatId })
    .from(confirmedSeats)
    .where(eq(confirmedSeats.bookingId, booking.id));

  await db.transaction(async (tx) => {
    await tx
      .update(bookings)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(eq(bookings.id, booking.id));
    await tx
      .update(tickets)
      .set({ status: 'refunded', updatedAt: new Date() })
      .where(eq(tickets.bookingId, booking.id));
    await tx.delete(confirmedSeats).where(eq(confirmedSeats.bookingId, booking.id));
    await tx.insert(refunds).values({
      bookingId: booking.id,
      userId,
      amount: booking.totalAmount,
      reason: 'Requested more than 24 hours before event',
      status: 'completed',
    });
  });

  await publishSeatUpdate(
    booking.eventId,
    'released',
    bookingSeats.map((seat) => seat.seatId),
  );
  return { success: true, bookingId: booking.id };
}
