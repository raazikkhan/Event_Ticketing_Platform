import { eq } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { SESSION_COOKIE_NAME, authenticate, requireRole } from '../middleware/auth.js';
import { createSession, deleteSession, hashPassword, verifyPassword } from '../services/auth.js';

const registerSchema = z.object({
  name: z.string().min(2, 'Name must have at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must have at least 6 characters'),
  role: z.enum(['attendee', 'organizer']).default('attendee'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register
  fastify.post('/api/auth/register', async (request, reply) => {
    const parseResult = registerSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { name, email, password, role } = parseResult.data;

    // Check duplicate email
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      return reply.status(409).send({ error: 'Email already registered' });
    }

    const passwordHash = await hashPassword(password);
    const [createdUser] = await db
      .insert(users)
      .values({
        name,
        email: email.toLowerCase(),
        passwordHash,
        role,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        createdAt: users.createdAt,
      });

    const { token, expiresAt } = await createSession(createdUser.id);

    reply.setCookie(SESSION_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      signed: true,
    });

    return reply.status(201).send({
      user: createdUser,
    });
  });

  // Login
  fastify.post('/api/auth/login', async (request, reply) => {
    const parseResult = loginSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: 'Validation failed',
        details: parseResult.error.flatten(),
      });
    }

    const { email, password } = parseResult.data;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const { token, expiresAt } = await createSession(user.id);

    reply.setCookie(SESSION_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      signed: true,
    });

    return reply.status(200).send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  });

  // Logout
  fastify.post('/api/auth/logout', async (request, reply) => {
    const rawCookie = request.cookies[SESSION_COOKIE_NAME];
    if (rawCookie) {
      const unsigned = request.unsignCookie(rawCookie);
      const token = unsigned.valid ? unsigned.value : rawCookie;
      if (token) {
        await deleteSession(token);
      }
    }

    reply.clearCookie(SESSION_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
    });

    return reply.status(200).send({ success: true });
  });

  // Current authenticated user
  fastify.get('/api/auth/me', { preHandler: [authenticate] }, async (request, reply) => {
    const user = request.user;
    if (!user) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
    return reply.send({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  });

  // Role guard verification routes
  fastify.get(
    '/api/protected/attendee',
    { preHandler: [authenticate, requireRole('attendee')] },
    async (request, reply) => {
      return reply.send({ message: 'Access granted to attendee resource', user: request.user });
    },
  );

  fastify.get(
    '/api/protected/organizer',
    { preHandler: [authenticate, requireRole('organizer')] },
    async (request, reply) => {
      return reply.send({ message: 'Access granted to organizer resource', user: request.user });
    },
  );
};
