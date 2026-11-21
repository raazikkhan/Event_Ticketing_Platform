import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

loadDotenv();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().default('postgres://postgres:postgrespassword@localhost:5432/ticketing'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  SESSION_SECRET: z.string().default('super-secret-session-key-minimum-32-characters-required'),
  FRONTEND_URL: z.string().default('http://localhost:3000'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  TICKET_SIGNING_SECRET: z.string().default('ticket-signing-secret-minimum-32-characters'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_FROM: z.string().default('tickets@example.com'),
  WAITING_ROOM_BATCH_SIZE: z.coerce.number().default(25),
  WAITING_ROOM_ADMISSION_SECONDS: z.coerce.number().default(300),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(60),
  HOLD_RATE_LIMIT_PER_WINDOW: z.coerce.number().default(20),
  CHECKOUT_RATE_LIMIT_PER_WINDOW: z.coerce.number().default(10),
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
