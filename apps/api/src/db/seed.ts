import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { createEventWithLayout } from '../services/event.js';
import { db, dbPool, initDb } from './index.js';
import { events, users } from './schema.js';

async function seed(): Promise<void> {
  await initDb();

  const attendeeEmail = 'attendee@example.com';
  const attendeeRows = await db.select().from(users).where(eq(users.email, attendeeEmail)).limit(1);
  if (attendeeRows.length === 0) {
    await db.insert(users).values({
      name: 'Sample Attendee',
      email: attendeeEmail,
      passwordHash: await bcrypt.hash('AttendeePassword123', 10),
      role: 'attendee',
    });
  }

  const email = 'organizer@example.com';
  let organizerRows = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (organizerRows.length === 0) {
    const passwordHash = await bcrypt.hash('OrganizerPassword123', 10);
    const inserted = await db
      .insert(users)
      .values({
        name: 'Sample Organizer',
        email,
        passwordHash,
        role: 'organizer',
      })
      .returning();
    organizerRows = inserted;
  }

  const organizer = organizerRows[0];
  const existingEvent = await db
    .select({ id: events.id })
    .from(events)
    .where(eq(events.title, 'Neon Symphony'))
    .limit(1);

  if (existingEvent.length > 0) {
    console.log(`Seed data already present for ${email}`);
    await dbPool.end();
    return;
  }

  await createEventWithLayout({
    organizerId: organizer.id,
    title: 'Neon Symphony',
    description: 'A sample multi-tier live music event.',
    venueName: 'The Grand Pavilion',
    venueAddress: '100 Symphony Way',
    eventDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    status: 'published',
    isHighDemand: true,
    sections: [
      { name: 'VIP', price: 7500, rowsCount: 2, seatsPerRow: 6 },
      { name: 'Main', price: 4500, rowsCount: 4, seatsPerRow: 10 },
      { name: 'Balcony', price: 2500, rowsCount: 3, seatsPerRow: 8 },
    ],
  });

  console.log(`Seeded organizer ${email} and sample event`);
  await dbPool.end();
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
