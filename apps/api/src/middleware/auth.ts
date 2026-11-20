import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User } from '../db/schema.js';
import { getUserBySessionToken } from '../services/auth.js';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
  }
}

export const SESSION_COOKIE_NAME = 'session_token';

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const cookie = request.cookies[SESSION_COOKIE_NAME];
  if (!cookie) {
    reply.status(401).send({ error: 'Authentication required' });
    return;
  }

  // Unsign cookie if signed, or read directly
  const unsigned = request.unsignCookie(cookie);
  const token = unsigned.valid ? unsigned.value : cookie;

  if (!token) {
    reply.status(401).send({ error: 'Invalid session cookie' });
    return;
  }

  const user = await getUserBySessionToken(token);
  if (!user) {
    reply.status(401).send({ error: 'Invalid or expired session' });
    return;
  }

  request.user = user;
}

export function requireRole(allowedRole: 'attendee' | 'organizer') {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!request.user) {
      reply.status(401).send({ error: 'Authentication required' });
      return;
    }

    if (request.user.role !== allowedRole) {
      reply.status(403).send({
        error: `Forbidden: requires ${allowedRole} role`,
      });
      return;
    }
  };
}
