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
});

export type Env = z.infer<typeof envSchema>;

export const env = envSchema.parse(process.env);
