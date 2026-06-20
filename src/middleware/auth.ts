import type { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '../config/env.js';
import { verifyToken, type UserRole } from '../modules/auth/service.js';

// Contexto de autenticación adjunto a cada request
export interface AuthContext {
  userId: string | null;   // null para acceso por API key (servicios internos)
  role: UserRole;
  email: string;
  name: string;
  isService: boolean;      // true = autenticado con la API key fija
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}

export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const header = request.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  const apiKey = (request.headers['x-api-key'] as string | undefined) || bearer;

  // 1. Token de usuario (JWT)
  if (bearer) {
    const payload = verifyToken(bearer);
    if (payload) {
      request.auth = {
        userId: payload.sub,
        role: payload.role,
        email: payload.email,
        name: payload.name,
        isService: false,
      };
      return;
    }
  }

  // 2. API key fija (servicios internos / compatibilidad)
  if (apiKey && apiKey === env.API_KEY) {
    request.auth = {
      userId: null,
      role: 'admin',
      email: 'service',
      name: 'service',
      isService: true,
    };
    return;
  }

  return reply.status(401).send({ error: 'No autorizado: token o API key inválida' });
}

// Guard para rutas exclusivas de admin
export function requireAdmin(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.auth?.role !== 'admin') {
    reply.status(403).send({ error: 'Acceso restringido a administradores' });
    return false;
  }
  return true;
}
