import { asc, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
  events,
  type Event,
  type NewEvent,
  type NewSeat,
  type NewSection,
  type Seat,
  type Section,
  seats,
  sections,
} from '../db/schema.js';

export interface SectionInput {
  name: string;
  price: number; // in smallest currency unit (cents, paise)
  rowsCount: number;
  seatsPerRow: number;
}

export interface CreateEventInput {
  organizerId: string;
  title: string;
  description: string;
  venueName: string;
  venueAddress: string;
  eventDate: Date;
  status?: 'draft' | 'published';
  isHighDemand?: boolean;
  sections: SectionInput[];
}

export function getRowLetter(index: number): string {
  // 0 -> 'A', 25 -> 'Z', 26 -> 'AA', etc.
  let label = '';
  let num = index;
  while (num >= 0) {
    label = String.fromCharCode((num % 26) + 65) + label;
    num = Math.floor(num / 26) - 1;
  }
  return label;
}

export async function createEventWithLayout(input: CreateEventInput): Promise<{
  event: Event;
  sections: Section[];
  totalSeats: number;
}> {
  return await db.transaction(async (tx) => {
    // 1. Insert Event
    const [createdEvent] = await tx
      .insert(events)
      .values({
        organizerId: input.organizerId,
        title: input.title,
        description: input.description,
        venueName: input.venueName,
        venueAddress: input.venueAddress,
        eventDate: input.eventDate,
        status: input.status ?? 'draft',
        isHighDemand: input.isHighDemand ?? false,
      })
      .returning();

    const createdSections: Section[] = [];
    const allSeatBatches: NewSeat[] = [];

    // 2. Insert Sections and prepare Seats
    for (const sec of input.sections) {
      const [newSection] = await tx
        .insert(sections)
        .values({
          eventId: createdEvent.id,
          name: sec.name,
          price: sec.price,
          rowsCount: sec.rowsCount,
          seatsPerRow: sec.seatsPerRow,
        })
        .returning();

      createdSections.push(newSection);

      for (let r = 0; r < sec.rowsCount; r++) {
        const rowLabel = getRowLetter(r);
        for (let s = 1; s <= sec.seatsPerRow; s++) {
          allSeatBatches.push({
            eventId: createdEvent.id,
            sectionId: newSection.id,
            rowLabel,
            seatNumber: s,
            seatLabel: `${sec.name}-${rowLabel}-${s}`,
          });
        }
      }
    }

    // 3. Insert Seats in batches to maintain high performance
    if (allSeatBatches.length > 0) {
      const BATCH_SIZE = 500;
      for (let i = 0; i < allSeatBatches.length; i += BATCH_SIZE) {
        const batch = allSeatBatches.slice(i, i + BATCH_SIZE);
        await tx.insert(seats).values(batch);
      }
    }

    return {
      event: createdEvent,
      sections: createdSections,
      totalSeats: allSeatBatches.length,
    };
  });
}

export async function listPublishedEvents(): Promise<
  Array<
    Event & {
      minPrice: number;
      maxPrice: number;
      totalSeats: number;
    }
  >
> {
  const publishedEvents = await db
    .select()
    .from(events)
    .where(eq(events.status, 'published'))
    .orderBy(asc(events.eventDate));

  const result = [];
  for (const event of publishedEvents) {
    const eventSections = await db.select().from(sections).where(eq(sections.eventId, event.id));

    let minPrice = Number.POSITIVE_INFINITY;
    let maxPrice = 0;
    let totalSeats = 0;

    for (const sec of eventSections) {
      if (sec.price < minPrice) minPrice = sec.price;
      if (sec.price > maxPrice) maxPrice = sec.price;
      totalSeats += sec.rowsCount * sec.seatsPerRow;
    }

    result.push({
      ...event,
      minPrice: Number.isFinite(minPrice) ? minPrice : 0,
      maxPrice,
      totalSeats,
    });
  }

  return result;
}

export async function listOrganizerEvents(organizerId: string): Promise<Event[]> {
  return await db
    .select()
    .from(events)
    .where(eq(events.organizerId, organizerId))
    .orderBy(desc(events.createdAt));
}

export interface SeatWithStatus extends Seat {
  status: 'available' | 'held' | 'sold';
  price: number;
  sectionName: string;
}

export async function getEventDetailsWithSeats(eventId: string): Promise<{
  event: Event;
  sections: Section[];
  seats: SeatWithStatus[];
} | null> {
  const [event] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);

  if (!event) return null;

  const eventSections = await db
    .select()
    .from(sections)
    .where(eq(sections.eventId, eventId))
    .orderBy(asc(sections.name));

  const sectionMap = new Map(eventSections.map((s) => [s.id, s]));

  const eventSeats = await db
    .select()
    .from(seats)
    .where(eq(seats.eventId, eventId))
    .orderBy(asc(seats.rowLabel), asc(seats.seatNumber));

  const seatsWithStatus: SeatWithStatus[] = eventSeats.map((seat) => {
    const sec = sectionMap.get(seat.sectionId);
    return {
      ...seat,
      status: 'available', // Part 6 & 7 merge holds and confirmed bookings
      price: sec?.price ?? 0,
      sectionName: sec?.name ?? '',
    };
  });

  return {
    event,
    sections: eventSections,
    seats: seatsWithStatus,
  };
}

export async function seedDemoEventIfEmpty(organizerId: string): Promise<void> {
  const existing = await db.select({ id: events.id }).from(events).limit(1);
  if (existing.length > 0) return;

  const concertDate = new Date();
  concertDate.setDate(concertDate.getDate() + 30);
  concertDate.setHours(19, 30, 0, 0);

  await createEventWithLayout({
    organizerId,
    title: 'Neon Symphony: Live Orchestral Showcase',
    description:
      'An immersive live music journey blending modern synthesizer frequencies with an acoustic 40-piece philharmonic orchestra.',
    venueName: 'The Grand Pavilion Amphitheater',
    venueAddress: '100 Symphony Way, Arts District, Metropolitan City',
    eventDate: concertDate,
    status: 'published',
    isHighDemand: true,
    sections: [
      {
        name: 'VIP Front Orchestra',
        price: 7500, // $75.00
        rowsCount: 2,
        seatsPerRow: 6,
      },
      {
        name: 'Main Tier',
        price: 4500, // $45.00
        rowsCount: 4,
        seatsPerRow: 10,
      },
      {
        name: 'Balcony',
        price: 2500, // $25.00
        rowsCount: 3,
        seatsPerRow: 8,
      },
    ],
  });
}
