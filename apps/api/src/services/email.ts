import { Queue, Worker } from 'bullmq';
import nodemailer from 'nodemailer';
import { env } from '../config.js';

const connection = {
  host: new URL(env.REDIS_URL).hostname,
  port: Number(new URL(env.REDIS_URL).port || 6379),
};

export const emailQueue = new Queue('booking-confirmation', { connection });

export async function queueBookingEmail(
  to: string,
  bookingId: string,
  eventTitle: string,
): Promise<void> {
  await emailQueue.add(
    'booking-confirmation',
    { to, bookingId, eventTitle },
    { removeOnComplete: true, removeOnFail: false, attempts: 3 },
  );
}

export function startEmailWorker(): Worker {
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: false,
  });

  return new Worker(
    'booking-confirmation',
    async (job) => {
      await transporter.sendMail({
        from: env.SMTP_FROM,
        to: String(job.data.to),
        subject: `Booking confirmed: ${String(job.data.eventTitle)}`,
        text: `Your booking ${String(job.data.bookingId)} is confirmed. Your QR tickets are available in the dashboard.`,
      });
    },
    { connection },
  );
}
